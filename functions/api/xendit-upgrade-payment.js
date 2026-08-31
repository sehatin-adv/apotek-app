// functions/api/xendit-upgrade-payment.js
//
// Pengganti ipaymu-upgrade-payment.js, tapi pakai Xendit. Nominalnya
// cuma SELISIH harga Pro-Basic, dan TIDAK menambah hari langganan -
// tanggal jatuh tempo yang sudah berjalan tetap sama, cuma paketnya
// yang berubah jadi Pro begitu pembayaran ini sukses (lihat
// xendit-webhook.js).

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

function parseRupiahAmount(val) {
    if (typeof val === 'number') return Math.round(val);
    const digitsOnly = String(val || '').replace(/[^0-9]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

export async function onRequestOptions() {
    return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
            return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di server.', step: 'config-check' }), { status: 500, headers: CORS_HEADERS });
        }
        if (!env.XENDIT_SECRET_KEY) {
            return new Response(JSON.stringify({ error: 'XENDIT_SECRET_KEY belum diset di server.', step: 'config-check' }), { status: 500, headers: CORS_HEADERS });
        }

        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token) return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.', step: 'auth-header' }), { status: 401, headers: CORS_HEADERS });

        const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        });
        if (!userRes.ok) return new Response(JSON.stringify({ error: 'Sesi login tidak valid.', step: 'auth-verify' }), { status: 401, headers: CORS_HEADERS });
        const authUser = await userRes.json();

        const serviceHeaders = {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        };

        const appUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${authUser.id}&select=tenant_id`, { headers: serviceHeaders });
        const appUserRows = await appUserRes.json();
        const tenantId = appUserRows?.[0]?.tenant_id;
        if (!tenantId) return new Response(JSON.stringify({ error: 'Akun ini tidak terhubung ke tenant manapun.', step: 'find-app-user' }), { status: 403, headers: CORS_HEADERS });

        const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}&select=*`, { headers: serviceHeaders });
        const tenantRows = await tenantRes.json();
        const tenant = tenantRows?.[0];
        if (!tenant) return new Response(JSON.stringify({ error: 'Tenant tidak ditemukan.', step: 'find-tenant' }), { status: 404, headers: CORS_HEADERS });

        if (tenant.plan === 'Pro') {
            return new Response(JSON.stringify({ error: 'Tenant ini sudah berada di paket Pro.', step: 'already-pro' }), { status: 400, headers: CORS_HEADERS });
        }

        const priceBasicRes = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?key=eq.subscription_price_basic&select=value`, { headers: serviceHeaders });
        const priceProRes = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?key=eq.subscription_price_pro&select=value`, { headers: serviceHeaders });
        const priceBasicRows = await priceBasicRes.json();
        const priceProRows = await priceProRes.json();
        const priceBasic = parseRupiahAmount(priceBasicRows?.[0]?.value);
        const pricePro = parseRupiahAmount(priceProRows?.[0]?.value);
        if (priceBasic <= 0 || pricePro <= 0) {
            return new Response(JSON.stringify({ error: 'Harga paket Basic/Pro belum diatur lengkap oleh pemilik platform.', step: 'get-price' }), { status: 400, headers: CORS_HEADERS });
        }
        const amount = pricePro - priceBasic;
        if (amount < 1500) {
            return new Response(JSON.stringify({ error: 'Selisih harga di bawah minimum QRIS Xendit (Rp1.500), atau selisih tidak valid.', step: 'invalid-diff' }), { status: 400, headers: CORS_HEADERS });
        }

        const referenceId = `SEHATIN-UPG-${tenant.id.slice(0, 8)}-${Date.now()}`;
        const notifyUrl = `${new URL(request.url).origin}/api/xendit-webhook`;

        await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments`, {
            method: 'POST',
            headers: serviceHeaders,
            body: JSON.stringify({
                tenant_id: tenant.id, reference_id: referenceId, amount,
                days_to_extend: 0, status: 'pending',
                payment_type: 'upgrade', upgrade_to_plan: 'Pro'
            })
        });

        const basicAuth = btoa(`${env.XENDIT_SECRET_KEY}:`);
        const formBody = new URLSearchParams({
            external_id: referenceId,
            type: 'DYNAMIC',
            callback_url: notifyUrl,
            amount: String(amount)
        });

        const xenditRes = await fetch('https://api.xendit.co/qr_codes', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody.toString()
        });
        const xenditRawText = await xenditRes.text();
        let xenditData;
        try {
            xenditData = JSON.parse(xenditRawText);
        } catch (parseErr) {
            return new Response(JSON.stringify({ error: 'Respons Xendit bukan JSON valid.', step: 'parse-xendit-response', detail: xenditRawText.slice(0, 500) }), { status: 502, headers: CORS_HEADERS });
        }

        if (!xenditRes.ok) {
            return new Response(JSON.stringify({ error: 'Xendit menolak permintaan.', step: 'xendit-call', xenditHttpStatus: xenditRes.status, xenditResponse: xenditData }), { status: 502, headers: CORS_HEADERS });
        }

        return new Response(JSON.stringify({ data: { referenceId, amount, priceBasic, pricePro, qrString: xenditData.qr_string, xenditId: xenditData.id } }), { headers: CORS_HEADERS });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Kesalahan tak terduga: ' + (e?.message || String(e)), step: 'unhandled-exception' }), { status: 500, headers: CORS_HEADERS });
    }
}
