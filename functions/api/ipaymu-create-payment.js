// functions/api/ipaymu-create-payment.js
//
// Dipanggil dari aplikasi (tombol "Perpanjang Sekarang") oleh admin
// tenant yang sedang login. Membuat transaksi QRIS dinamis lewat
// iPaymu Direct API, simpan record pending di subscription_payments,
// dan balikin data QR-nya ke frontend buat ditampilkan.
import { ipaymuHeaders, ipaymuBaseUrl } from './_ipaymu-helper.js';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

export async function onRequestOptions() {
    return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.IPAYMU_VA || !env.IPAYMU_API_KEY) {
        return new Response(JSON.stringify({ error: 'Integrasi iPaymu belum lengkap dikonfigurasi di server (VA/API Key/Service Role belum diset).' }), { status: 500, headers: CORS_HEADERS });
    }

    // 1. Verifikasi pemanggil - harus user yang login & terhubung ke tenant
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.' }), { status: 401, headers: CORS_HEADERS });

    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return new Response(JSON.stringify({ error: 'Sesi login tidak valid.' }), { status: 401, headers: CORS_HEADERS });
    const authUser = await userRes.json();

    const serviceHeaders = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    };

    // 2. Cari tenant_id + info tenant milik pemanggil
    const appUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${authUser.id}&select=tenant_id,nama,email`, { headers: serviceHeaders });
    const appUserRows = await appUserRes.json();
    const appUser = appUserRows?.[0];
    if (!appUser) return new Response(JSON.stringify({ error: 'Akun ini tidak terhubung ke tenant manapun.' }), { status: 403, headers: CORS_HEADERS });

    const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${appUser.tenant_id}&select=*`, { headers: serviceHeaders });
    const tenantRows = await tenantRes.json();
    const tenant = tenantRows?.[0];
    if (!tenant) return new Response(JSON.stringify({ error: 'Tenant tidak ditemukan.' }), { status: 404, headers: CORS_HEADERS });

    // 3. Ambil harga langganan dari platform_settings
    const priceRes = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?key=eq.subscription_price&select=value`, { headers: serviceHeaders });
    const priceRows = await priceRes.json();
    const amount = Number(priceRows?.[0]?.value) || 0;
    if (amount <= 0) {
        return new Response(JSON.stringify({ error: 'Harga langganan belum diatur oleh pemilik platform.' }), { status: 400, headers: CORS_HEADERS });
    }

    // 4. Buat referenceId unik, simpan record pending
    const referenceId = `SEHATIN-${tenant.id.slice(0, 8)}-${Date.now()}`;
    const daysToExtend = 30;

    const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments`, {
        method: 'POST',
        headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({
            tenant_id: tenant.id,
            reference_id: referenceId,
            amount,
            days_to_extend: daysToExtend,
            status: 'pending'
        })
    });
    if (!insertRes.ok) {
        const err = await insertRes.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: 'Gagal mencatat pembayaran: ' + (err.message || '') }), { status: 500, headers: CORS_HEADERS });
    }

    // 5. Panggil iPaymu Direct API bikin QRIS
    try {
        const mode = env.IPAYMU_MODE === 'production' ? 'production' : 'sandbox';
        const notifyUrl = `${new URL(request.url).origin}/api/ipaymu-webhook`;

        const paymentBody = {
            name: tenant.nama,
            email: appUser.email || 'noreply@sehatin.app',
            phone: '08000000000',
            amount,
            paymentMethod: 'qris',
            paymentChannel: 'qris',
            notifyUrl,
            referenceId,
            expired: 24, // jam
            description: `Perpanjangan langganan Sehatin+ - ${tenant.nama}`
        };

        const { headers, bodyJson } = await ipaymuHeaders('POST', env.IPAYMU_VA, env.IPAYMU_API_KEY, paymentBody);
        const ipaymuRes = await fetch(`${ipaymuBaseUrl(mode)}/payment/direct`, {
            method: 'POST',
            headers,
            body: bodyJson
        });
        const ipaymuData = await ipaymuRes.json();

        if (!ipaymuRes.ok || ipaymuData.Status !== 200) {
            return new Response(JSON.stringify({ error: 'iPaymu menolak permintaan: ' + (ipaymuData.Message || JSON.stringify(ipaymuData)) }), { status: 502, headers: CORS_HEADERS });
        }

        // Simpan mentah-mentah respons iPaymu di qr_data (belum tau pasti nama
        // field-nya, jadi disimpan lengkap dulu supaya bisa dicek/diproses)
        await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}`, {
            method: 'PATCH',
            headers: serviceHeaders,
            body: JSON.stringify({ qr_data: JSON.stringify(ipaymuData) })
        });

        return new Response(JSON.stringify({ data: { referenceId, amount, ipaymu: ipaymuData } }), { headers: CORS_HEADERS });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Gagal membuat pembayaran: ' + e.message }), { status: 500, headers: CORS_HEADERS });
    }
}
