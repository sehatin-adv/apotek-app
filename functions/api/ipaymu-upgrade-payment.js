// functions/api/ipaymu-upgrade-payment.js
//
// Dipanggil dari halaman "Upgrade ke Pro" (Kelola Aplikasi) oleh admin
// tenant yang masih paket Basic. Beda dari ipaymu-create-payment.js
// (perpanjangan biasa): nominalnya cuma SELISIH harga Pro-Basic, dan
// TIDAK menambah hari langganan - tanggal jatuh tempo yang sudah
// berjalan tetap sama, cuma paketnya yang berubah jadi Pro begitu
// pembayaran ini sukses (lihat ipaymu-webhook.js).

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return toHex(hashBuffer);
}
async function hmacSha256Hex(message, secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return toHex(sigBuffer);
}
function ipaymuTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
async function ipaymuHeaders(method, va, apiKey, bodyObj) {
    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = await sha256Hex(bodyJson);
    const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash.toLowerCase()}:${apiKey}`;
    const signature = await hmacSha256Hex(stringToSign, apiKey);
    return {
        headers: { 'Content-Type': 'application/json', 'va': va, 'signature': signature, 'timestamp': ipaymuTimestamp() },
        bodyJson
    };
}
function ipaymuBaseUrl(mode) {
    return mode === 'production' ? 'https://my.ipaymu.com/api/v2' : 'https://sandbox.ipaymu.com/api/v2';
}
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
        if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.IPAYMU_VA || !env.IPAYMU_API_KEY) {
            return new Response(JSON.stringify({ error: 'Integrasi iPaymu belum lengkap dikonfigurasi di server.', step: 'config-check' }), { status: 500, headers: CORS_HEADERS });
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

        const appUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${authUser.id}&select=tenant_id,email`, { headers: serviceHeaders });
        const appUserRows = await appUserRes.json();
        const appUser = appUserRows?.[0];
        if (!appUser) return new Response(JSON.stringify({ error: 'Akun ini tidak terhubung ke tenant manapun.', step: 'find-app-user' }), { status: 403, headers: CORS_HEADERS });

        const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${appUser.tenant_id}&select=*`, { headers: serviceHeaders });
        const tenantRows = await tenantRes.json();
        const tenant = tenantRows?.[0];
        if (!tenant) return new Response(JSON.stringify({ error: 'Tenant tidak ditemukan.', step: 'find-tenant' }), { status: 404, headers: CORS_HEADERS });

        // Ambil no. telepon ASLI apotek (dari Identitas Apotek) - PENTING:
        // sebelumnya kode ini pakai nomor HP yang SAMA PERSIS utk semua
        // transaksi ("08000000000"), yang bikin iPaymu mengira semua
        // tenant itu "pembeli yang sama" mencoba berkali-kali dan
        // memblokirnya sbg "Suspicious Buyer" (limit iPaymu: 3x/hari
        // utk nomor HP/email yang sama).
        const pengaturanRes = await fetch(`${env.SUPABASE_URL}/rest/v1/pengaturan_apotek?tenant_id=eq.${tenant.id}&select=telepon`, { headers: serviceHeaders });
        const pengaturanRows = await pengaturanRes.json().catch(() => []);
        const teleponApotek = pengaturanRows?.[0]?.telepon?.trim();

        if (tenant.plan === 'Pro') {
            return new Response(JSON.stringify({ error: 'Tenant ini sudah berada di paket Pro.', step: 'already-pro' }), { status: 400, headers: CORS_HEADERS });
        }

        // Hitung selisih harga Pro - Basic dari platform_settings
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
        if (amount <= 0) {
            return new Response(JSON.stringify({ error: 'Selisih harga tidak valid (Pro harus lebih mahal dari Basic).', step: 'invalid-diff' }), { status: 400, headers: CORS_HEADERS });
        }

        const referenceId = `SEHATIN-UPG-${tenant.id.slice(0, 8)}-${Date.now()}`;

        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments`, {
            method: 'POST',
            headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({
                tenant_id: tenant.id, reference_id: referenceId, amount,
                days_to_extend: 0, status: 'pending',
                payment_type: 'upgrade', upgrade_to_plan: 'Pro'
            })
        });
        if (!insertRes.ok) {
            const err = await insertRes.json().catch(() => ({}));
            return new Response(JSON.stringify({ error: 'Gagal mencatat pembayaran: ' + (err.message || JSON.stringify(err)), step: 'insert-payment' }), { status: 500, headers: CORS_HEADERS });
        }

        const mode = env.IPAYMU_MODE === 'production' ? 'production' : 'sandbox';
        const notifyUrl = `${new URL(request.url).origin}/api/ipaymu-webhook`;

        const paymentBody = {
            name: tenant.nama,
            email: appUser.email || 'noreply@sehatin.app',
            phone: teleponApotek || '081200000000',
            amount,
            paymentMethod: 'qris',
            paymentChannel: 'qris',
            notifyUrl,
            referenceId,
            expired: 24,
            description: `Upgrade ke Pro - ${tenant.nama}`
        };

        const { headers, bodyJson } = await ipaymuHeaders('POST', env.IPAYMU_VA, env.IPAYMU_API_KEY, paymentBody);
        const ipaymuRes = await fetch(`${ipaymuBaseUrl(mode)}/payment/direct`, { method: 'POST', headers, body: bodyJson });
        const ipaymuRawText = await ipaymuRes.text();
        let ipaymuData;
        try {
            ipaymuData = JSON.parse(ipaymuRawText);
        } catch (parseErr) {
            return new Response(JSON.stringify({ error: 'Respons iPaymu bukan JSON valid.', step: 'parse-ipaymu-response', detail: ipaymuRawText.slice(0, 500) }), { status: 502, headers: CORS_HEADERS });
        }

        if (!ipaymuRes.ok || ipaymuData.Status !== 200) {
            return new Response(JSON.stringify({ error: 'iPaymu menolak permintaan.', step: 'ipaymu-call', ipaymuHttpStatus: ipaymuRes.status, ipaymuResponse: ipaymuData }), { status: 502, headers: CORS_HEADERS });
        }

        await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}`, {
            method: 'PATCH',
            headers: serviceHeaders,
            body: JSON.stringify({ qr_data: JSON.stringify(ipaymuData) })
        });

        return new Response(JSON.stringify({ data: { referenceId, amount, priceBasic, pricePro, ipaymu: ipaymuData } }), { headers: CORS_HEADERS });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Kesalahan tak terduga: ' + (e?.message || String(e)), step: 'unhandled-exception' }), { status: 500, headers: CORS_HEADERS });
    }
}
