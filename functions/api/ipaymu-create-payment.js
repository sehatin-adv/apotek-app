// functions/api/ipaymu-create-payment.js
//
// Dipanggil dari aplikasi (tombol "Perpanjang Sekarang") oleh admin
// tenant yang sedang login. Membuat transaksi QRIS dinamis lewat
// iPaymu Direct API, simpan record pending di subscription_payments,
// dan balikin data QR-nya ke frontend buat ditampilkan.
//
// CATATAN: kode signature iPaymu digabung langsung di file ini (bukan
// import dari file terpisah) supaya tidak ada risiko masalah bundling
// lintas-file di Cloudflare Pages Functions. Seluruh isi handler
// dibungkus try/catch supaya SETIAP error (apapun penyebabnya) selalu
// balik sebagai JSON yang jelas, bukan halaman error generik yang
// tidak bisa dibaca dari Network tab browser.

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
// Parser angka Rupiah gaya Indonesia (titik = pemisah ribuan, BUKAN
// desimal) - buang semua karakter selain digit sebelum konversi.
// Ini juga otomatis "membetulkan" nilai lama yang kebetulan tersimpan
// keliru (mis. "50.352" -> tetap benar jadi 50352, bukan 50).
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

    // SELURUH badan fungsi dibungkus try/catch - supaya error apapun
    // (bukan cuma dari panggilan iPaymu) tetap balas JSON yang jelas.
    try {
        if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.IPAYMU_VA || !env.IPAYMU_API_KEY) {
            return new Response(JSON.stringify({ error: 'Integrasi iPaymu belum lengkap dikonfigurasi di server (VA/API Key/Service Role belum diset).', step: 'config-check' }), { status: 500, headers: CORS_HEADERS });
        }

        // 1. Verifikasi pemanggil - harus user yang login
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token) return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.', step: 'auth-header' }), { status: 401, headers: CORS_HEADERS });

        const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        });
        if (!userRes.ok) {
            const errText = await userRes.text().catch(() => '');
            return new Response(JSON.stringify({ error: 'Sesi login tidak valid.', step: 'auth-verify', detail: errText }), { status: 401, headers: CORS_HEADERS });
        }
        const authUser = await userRes.json();

        const serviceHeaders = {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        };

        // 2. Cari tenant_id + info tenant milik pemanggil (pakai service
        //    role, jadi TIDAK terpengaruh RLS/status langganan - orang yg
        //    mau BAYAR justru harus tetap bisa walau tenant-nya terkunci)
        const appUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${authUser.id}&select=tenant_id,nama,email`, { headers: serviceHeaders });
        if (!appUserRes.ok) {
            const errText = await appUserRes.text().catch(() => '');
            return new Response(JSON.stringify({ error: 'Gagal mengambil data app_users.', step: 'fetch-app-user', detail: errText }), { status: 500, headers: CORS_HEADERS });
        }
        const appUserRows = await appUserRes.json();
        const appUser = appUserRows?.[0];
        if (!appUser) return new Response(JSON.stringify({ error: 'Akun ini tidak terhubung ke tenant manapun.', step: 'find-app-user' }), { status: 403, headers: CORS_HEADERS });

        const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${appUser.tenant_id}&select=*`, { headers: serviceHeaders });
        const tenantRows = await tenantRes.json();
        const tenant = tenantRows?.[0];
        if (!tenant) return new Response(JSON.stringify({ error: 'Tenant tidak ditemukan.', step: 'find-tenant' }), { status: 404, headers: CORS_HEADERS });

        // Sama seperti ipaymu-upgrade-payment.js - ambil no. telepon ASLI
        // apotek supaya tiap tenant tidak dianggap "pembeli yang sama"
        // oleh deteksi anti-fraud iPaymu (lihat catatan di file itu).
        const pengaturanRes = await fetch(`${env.SUPABASE_URL}/rest/v1/pengaturan_apotek?tenant_id=eq.${tenant.id}&select=telepon`, { headers: serviceHeaders });
        const pengaturanRows = await pengaturanRes.json().catch(() => []);
        const teleponApotek = pengaturanRows?.[0]?.telepon?.trim();

        // 3. Ambil harga langganan dari platform_settings SESUAI PAKET
        //    tenant ini (Basic/Pro beda harga)
        const priceKey = tenant.plan === 'Pro' ? 'subscription_price_pro' : 'subscription_price_basic';
        const priceRes = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?key=eq.${priceKey}&select=value`, { headers: serviceHeaders });
        const priceRows = await priceRes.json();
        const amount = parseRupiahAmount(priceRows?.[0]?.value);
        if (amount <= 0) {
            return new Response(JSON.stringify({ error: `Harga langganan paket ${tenant.plan || 'Basic'} belum diatur oleh pemilik platform.`, step: 'get-price' }), { status: 400, headers: CORS_HEADERS });
        }

        // 4. Buat referenceId unik, simpan record pending
        const referenceId = `SEHATIN-${tenant.id.slice(0, 8)}-${Date.now()}`;
        const daysToExtend = 30;

        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments`, {
            method: 'POST',
            headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ tenant_id: tenant.id, reference_id: referenceId, amount, days_to_extend: daysToExtend, status: 'pending' })
        });
        if (!insertRes.ok) {
            const err = await insertRes.json().catch(() => ({}));
            return new Response(JSON.stringify({ error: 'Gagal mencatat pembayaran: ' + (err.message || JSON.stringify(err)), step: 'insert-payment' }), { status: 500, headers: CORS_HEADERS });
        }

        // 5. Panggil iPaymu Direct API bikin QRIS
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
            description: `Perpanjangan langganan Sehatin+ - ${tenant.nama}`
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

        return new Response(JSON.stringify({ data: { referenceId, amount, ipaymu: ipaymuData } }), { headers: CORS_HEADERS });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Kesalahan tak terduga: ' + (e?.message || String(e)), step: 'unhandled-exception', stack: e?.stack || null }), { status: 500, headers: CORS_HEADERS });
    }
}
