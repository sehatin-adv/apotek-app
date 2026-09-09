// functions/api/verify-admin-password.js
//
// Verifikasi password Admin (dipakai sebelum aksi berbahaya seperti
// Hapus Faktur Pembelian) - DILAKUKAN DI SERVER, bukan di browser.
//
// Sebelumnya verifikasi ini dilakukan langsung di browser dengan
// memanggil supabase.auth.signInWithPassword() - itu artinya BENAR-
// BENAR login sebagai admin dulu (mengganti sesi aktif di localStorage
// browser), lalu mencoba "mengembalikan" ke sesi semula. Proses tukar-
// menukar sesi seperti itu rawan gagal diam-diam (race condition,
// token yang hampir kedaluwarsa, dsb) dan bisa merusak sesi login
// user yang sedang aktif tanpa ada error yang terlihat.
//
// Sekarang: verifikasi password terjadi di server (via panggilan
// langsung ke Supabase Auth API, BUKAN lewat Supabase client SDK di
// browser), jadi sesi browser pemanggil TIDAK PERNAH tersentuh sama
// sekali.

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
    try {
        const authHeader = request.headers.get('Authorization') || '';
        const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!callerToken) {
            return new Response(JSON.stringify({ valid: false, error: 'Sesi Anda tidak valid, silakan login ulang.' }), { status: 401, headers: CORS_HEADERS });
        }

        const body = await request.json();
        const email = String(body.email || '').trim();
        const password = String(body.password || '');
        if (!email || !password) {
            return new Response(JSON.stringify({ valid: false, error: 'Email dan password wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
        }

        const serviceHeaders = {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        };

        // 1. Cari tahu tenant_id si PEMANGGIL (bukan admin yang sedang
        //    diverifikasi) - pakai token si pemanggil, bukan service key,
        //    supaya hanya bisa lihat identitasnya sendiri.
        const callerUserRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${callerToken}` }
        });
        if (!callerUserRes.ok) {
            return new Response(JSON.stringify({ valid: false, error: 'Sesi Anda tidak valid, silakan login ulang.' }), { status: 401, headers: CORS_HEADERS });
        }
        const callerUser = await callerUserRes.json();
        const callerAppUserRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${callerUser.id}&select=tenant_id`,
            { headers: serviceHeaders }
        );
        const callerAppUserRows = await callerAppUserRes.json();
        const callerTenantId = callerAppUserRows?.[0]?.tenant_id;
        if (!callerTenantId) {
            return new Response(JSON.stringify({ valid: false, error: 'Tidak bisa menemukan data apotek Anda.' }), { status: 403, headers: CORS_HEADERS });
        }

        // 2. Verifikasi email+password admin LANGSUNG ke Supabase Auth API
        //    (fetch mentah, BUKAN lewat client SDK) - ini TIDAK menyentuh
        //    sesi browser manapun, murni cek kredensial di server.
        const verifyRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!verifyRes.ok) {
            return new Response(JSON.stringify({ valid: false, error: 'Email atau password admin salah.' }), { status: 200, headers: CORS_HEADERS });
        }
        const verifyData = await verifyRes.json();
        const adminUserId = verifyData?.user?.id;
        if (!adminUserId) {
            return new Response(JSON.stringify({ valid: false, error: 'Email atau password admin salah.' }), { status: 200, headers: CORS_HEADERS });
        }

        // 3. Pastikan akun ini benar Admin AKTIF di TENANT YANG SAMA
        //    dengan pemanggil (bukan admin apotek lain).
        const adminAppUserRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${adminUserId}&select=role,tenant_id,status`,
            { headers: serviceHeaders }
        );
        const adminAppUserRows = await adminAppUserRes.json();
        const adminAppUser = adminAppUserRows?.[0];

        if (!adminAppUser || adminAppUser.role !== 'admin' || adminAppUser.status === 'Tidak Aktif' || adminAppUser.tenant_id !== callerTenantId) {
            return new Response(JSON.stringify({ valid: false, error: 'Akun ini bukan Admin aktif di apotek ini.' }), { status: 200, headers: CORS_HEADERS });
        }

        return new Response(JSON.stringify({ valid: true, error: null }), { status: 200, headers: CORS_HEADERS });
    } catch (e) {
        console.error('Error verify-admin-password:', e);
        return new Response(JSON.stringify({ valid: false, error: 'Terjadi kesalahan server: ' + e.message }), { status: 500, headers: CORS_HEADERS });
    }
}
