// functions/api/admin-auth.js
//
// Endpoint ini SATU-SATUNYA tempat service role key Supabase dipakai.
// Sebelumnya service role key ada di src/supabase.js dan ikut terkirim
// ke browser semua orang yang buka aplikasi - siapa saja yang buka
// "View Page Source" bisa menyalin kunci itu dan dapat akses admin
// penuh ke seluruh database, melewati semua aturan keamanan (RLS).
//
// Sekarang: service role key HANYA hidup di sini, sebagai environment
// variable/secret di server Cloudflare, TIDAK PERNAH dikirim ke
// browser. Frontend (src/supabase.js) manggil endpoint ini lewat
// fetch(), bukan pakai kuncinya langsung.
//
// Cara pasang SUPABASE_SERVICE_ROLE_KEY sebagai secret (bukan plain
// var) di Cloudflare Pages:
//   npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
// atau lewat dashboard: Settings > Environment variables > Add
// variable > pilih tipe "Secret" (bukan "Plaintext" / "Text").

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

async function verifyCallerIsAdmin(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return { ok: false, status: 401, message: 'Tidak ada token otorisasi.' };

    // 1. Verifikasi token ini benar-benar sesi login yang valid (pakai anon key,
    //    bukan service key - cukup untuk memvalidasi & membaca identitas pemanggil)
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`
        }
    });
    if (!userRes.ok) return { ok: false, status: 401, message: 'Sesi login tidak valid atau kedaluwarsa.' };
    const authUser = await userRes.json();
    if (!authUser?.id) return { ok: false, status: 401, message: 'Sesi login tidak valid.' };

    // 2. Cek role pemanggil di app_users - HARUS admin buat operasi ini.
    //    Query ini pakai anon key + token pemanggil (bukan service key),
    //    tunduk ke RLS biasa - cukup buat baca role sendiri.
    const roleRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${authUser.id}&select=role`,
        {
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`
            }
        }
    );
    if (!roleRes.ok) return { ok: false, status: 403, message: 'Gagal memverifikasi hak akses.' };
    const rows = await roleRes.json();
    const role = rows?.[0]?.role;

    // Akun yang tidak terdaftar di app_users (mis. pemilik/superadmin awal
    // yang login langsung lewat Supabase Auth) dianggap admin juga -
    // konsisten dengan logika permissions.js di frontend.
    const isAdmin = !rows || rows.length === 0 || role === 'admin';
    if (!isAdmin) return { ok: false, status: 403, message: 'Hanya admin yang boleh mengelola user.' };

    return { ok: true };
}

export async function onRequestOptions() {
    return new Response(null, { headers: CORS_HEADERS });
}

const DEFAULT_KATEGORI = [
    { tipe: 'jenis', nama: 'Generik' }, { tipe: 'jenis', nama: 'Patented' },
    { tipe: 'jenis', nama: 'Herbal' }, { tipe: 'jenis', nama: 'Alat Kesehatan' },
    { tipe: 'golongan', nama: 'Bebas' }, { tipe: 'golongan', nama: 'Terbatas' },
    { tipe: 'golongan', nama: 'Keras' }, { tipe: 'golongan', nama: 'Narkotika' }, { tipe: 'golongan', nama: 'Prekursor' }
];

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di Cloudflare Pages (Settings > Environment variables > tipe Secret).' }), { status: 500, headers: CORS_HEADERS });
    }

    let body;
    try {
        body = await request.json();
    } catch(e) {
        return new Response(JSON.stringify({ error: 'Body request tidak valid.' }), { status: 400, headers: CORS_HEADERS });
    }

    const { action } = body;
    const adminApiBase = `${env.SUPABASE_URL}/auth/v1/admin`;
    const serviceHeaders = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    };

    // ============================================================
    // AKSI KHUSUS PEMILIK PLATFORM (kelola tenant/apotek) - otorisasi
    // TERPISAH dari akun admin tenant biasa. Pakai PLATFORM_ADMIN_SECRET
    // (secret Cloudflare lain, hanya Anda yang tahu), BUKAN status
    // admin di app_users manapun - supaya admin satu apotek tidak bisa
    // bikin/lihat/matikan apotek lain.
    // ============================================================
    const PLATFORM_ACTIONS = ['provision-tenant', 'list-tenants', 'update-tenant-status', 'update-tenant-name', 'update-tenant-subscription', 'delete-tenant', 'get-qris-setting', 'set-qris-setting', 'get-setting', 'set-setting'];
    if (PLATFORM_ACTIONS.includes(action)) {
        if (!env.PLATFORM_ADMIN_SECRET) {
            return new Response(JSON.stringify({ error: 'PLATFORM_ADMIN_SECRET belum diset di Cloudflare Pages.' }), { status: 500, headers: CORS_HEADERS });
        }
        if (!body.platform_secret || body.platform_secret !== env.PLATFORM_ADMIN_SECRET) {
            return new Response(JSON.stringify({ error: 'Kunci platform salah atau tidak diisi.' }), { status: 403, headers: CORS_HEADERS });
        }

        try {
            if (action === 'list-tenants') {
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?select=*&order=created_at.desc`, { headers: serviceHeaders });
                const data = await res.json();
                if (!res.ok) return new Response(JSON.stringify({ error: 'Gagal memuat daftar tenant.' }), { status: res.status, headers: CORS_HEADERS });
                return new Response(JSON.stringify({ data }), { headers: CORS_HEADERS });
            }

            if (action === 'update-tenant-status') {
                const { tenant_id, status } = body;
                if (!tenant_id || !['Aktif', 'Suspended', 'Trial'].includes(status)) {
                    return new Response(JSON.stringify({ error: 'tenant_id dan status (Aktif/Suspended/Trial) wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
                }
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}`, {
                    method: 'PATCH',
                    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
                    body: JSON.stringify({ status })
                });
                const data = await res.json();
                if (!res.ok) return new Response(JSON.stringify({ error: 'Gagal mengubah status tenant: ' + (data.message || res.status) }), { status: res.status, headers: CORS_HEADERS });
                return new Response(JSON.stringify({ data: data[0] || null }), { headers: CORS_HEADERS });
            }

            if (action === 'update-tenant-name') {
                const { tenant_id, nama } = body;
                if (!tenant_id || !nama || !nama.trim()) {
                    return new Response(JSON.stringify({ error: 'tenant_id dan nama wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
                }
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}`, {
                    method: 'PATCH',
                    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
                    body: JSON.stringify({ nama: nama.trim() })
                });
                const data = await res.json();
                if (!res.ok) return new Response(JSON.stringify({ error: 'Gagal mengubah nama tenant: ' + (data.message || res.status) }), { status: res.status, headers: CORS_HEADERS });
                return new Response(JSON.stringify({ data: data[0] || null }), { headers: CORS_HEADERS });
            }

            if (action === 'update-tenant-subscription') {
                // expires_at: string tanggal ISO (mis. "2026-12-31"), atau null utk hapus batas.
                // Kalau diisi tanggal di masa depan, status juga otomatis dibalikin ke
                // "Aktif" (buat kasus "tandai sudah bayar" - langsung aktif lagi seketika).
                const { tenant_id, expires_at, reactivate } = body;
                if (!tenant_id) {
                    return new Response(JSON.stringify({ error: 'tenant_id wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
                }
                const patchBody = { subscription_expires_at: expires_at || null };
                if (reactivate) patchBody.status = 'Aktif';
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}`, {
                    method: 'PATCH',
                    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
                    body: JSON.stringify(patchBody)
                });
                const data = await res.json();
                if (!res.ok) return new Response(JSON.stringify({ error: 'Gagal mengubah masa berlangganan: ' + (data.message || res.status) }), { status: res.status, headers: CORS_HEADERS });
                return new Response(JSON.stringify({ data: data[0] || null }), { headers: CORS_HEADERS });
            }

            if (action === 'delete-tenant') {
                const { tenant_id, confirm_nama } = body;
                if (!tenant_id) {
                    return new Response(JSON.stringify({ error: 'tenant_id wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
                }
                // Ambil data tenant dulu buat verifikasi nama konfirmasi
                const tenantCheckRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenant_id}&select=nama`, { headers: serviceHeaders });
                const tenantCheckData = await tenantCheckRes.json();
                const tenantNama = tenantCheckData?.[0]?.nama;
                if (!tenantNama) {
                    return new Response(JSON.stringify({ error: 'Tenant tidak ditemukan.' }), { status: 404, headers: CORS_HEADERS });
                }
                if (confirm_nama !== tenantNama) {
                    return new Response(JSON.stringify({ error: 'Nama konfirmasi tidak cocok. Ketik ulang nama tenant persis sama.' }), { status: 400, headers: CORS_HEADERS });
                }

                // 1. Ambil semua auth_user_id staff tenant ini, hapus akun loginnya satu-satu
                const usersRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users?tenant_id=eq.${tenant_id}&select=auth_user_id`, { headers: serviceHeaders });
                const usersData = await usersRes.json();
                for (const u of (usersData || [])) {
                    if (u.auth_user_id) {
                        await fetch(`${adminApiBase}/users/${u.auth_user_id}`, { method: 'DELETE', headers: serviceHeaders }).catch(() => {});
                    }
                }

                // 2. Hapus seluruh data tenant lewat fungsi cascade di database
                const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/delete_tenant_cascade`, {
                    method: 'POST',
                    headers: serviceHeaders,
                    body: JSON.stringify({ p_tenant_id: tenant_id })
                });
                if (!rpcRes.ok) {
                    const rpcErr = await rpcRes.json().catch(() => ({}));
                    return new Response(JSON.stringify({ error: 'Akun login staff terhapus, tapi gagal menghapus data tenant: ' + (rpcErr.message || '') }), { status: rpcRes.status, headers: CORS_HEADERS });
                }

                return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
            }

            if (action === 'get-qris-setting') {
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?key=eq.qris_image_url&select=value`, { headers: serviceHeaders });
                const data = await res.json();
                return new Response(JSON.stringify({ data: data?.[0]?.value || null }), { headers: CORS_HEADERS });
            }

            if (action === 'set-qris-setting') {
                const { qris_image_url } = body;
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings`, {
                    method: 'POST',
                    headers: { ...serviceHeaders, 'Prefer': 'resolution=merge-duplicates' },
                    body: JSON.stringify({ key: 'qris_image_url', value: qris_image_url || '' })
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    return new Response(JSON.stringify({ error: 'Gagal menyimpan pengaturan QRIS: ' + (errData.message || res.status) }), { status: res.status, headers: CORS_HEADERS });
                }
                return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
            }

            // Pengaturan platform generik (key-value) - dipakai buat harga
            // langganan & pengaturan lain ke depannya, biar tidak perlu
            // nulis action baru tiap nambah 1 setting.
            const ALLOWED_SETTING_KEYS = ['subscription_price'];
            if (action === 'get-setting') {
                const { key } = body;
                if (!ALLOWED_SETTING_KEYS.includes(key)) {
                    return new Response(JSON.stringify({ error: 'Key pengaturan tidak dikenal.' }), { status: 400, headers: CORS_HEADERS });
                }
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?key=eq.${key}&select=value`, { headers: serviceHeaders });
                const data = await res.json();
                return new Response(JSON.stringify({ data: data?.[0]?.value || null }), { headers: CORS_HEADERS });
            }

            if (action === 'set-setting') {
                const { key, value } = body;
                if (!ALLOWED_SETTING_KEYS.includes(key)) {
                    return new Response(JSON.stringify({ error: 'Key pengaturan tidak dikenal.' }), { status: 400, headers: CORS_HEADERS });
                }
                const res = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings`, {
                    method: 'POST',
                    headers: { ...serviceHeaders, 'Prefer': 'resolution=merge-duplicates' },
                    body: JSON.stringify({ key, value: value ?? '' })
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    return new Response(JSON.stringify({ error: 'Gagal menyimpan pengaturan: ' + (errData.message || res.status) }), { status: res.status, headers: CORS_HEADERS });
                }
                return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
            }

            if (action === 'provision-tenant') {
                const { nama_apotek, admin_nama, admin_email, admin_password } = body;
                if (!nama_apotek || !admin_email || !admin_password) {
                    return new Response(JSON.stringify({ error: 'Nama apotek, email admin, dan password admin wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
                }
                if (admin_password.length < 6) {
                    return new Response(JSON.stringify({ error: 'Password minimal 6 karakter.' }), { status: 400, headers: CORS_HEADERS });
                }

                // 1. Buat tenant
                const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants`, {
                    method: 'POST',
                    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
                    body: JSON.stringify({ nama: nama_apotek.trim(), status: 'Trial' })
                });
                const tenantData = await tenantRes.json();
                if (!tenantRes.ok) return new Response(JSON.stringify({ error: 'Gagal membuat tenant: ' + (tenantData.message || '') }), { status: tenantRes.status, headers: CORS_HEADERS });
                const tenantId = tenantData[0].id;

                // 2. Buat akun login admin pertama utk tenant ini
                const authRes = await fetch(`${adminApiBase}/users`, {
                    method: 'POST',
                    headers: serviceHeaders,
                    body: JSON.stringify({ email: admin_email.trim(), password: admin_password, email_confirm: true, user_metadata: { full_name: admin_nama || admin_email } })
                });
                const authData = await authRes.json();
                if (!authRes.ok) {
                    // Rollback tenant yang baru dibuat supaya tidak nyangkut jadi tenant kosong
                    await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers: serviceHeaders });
                    return new Response(JSON.stringify({ error: 'Gagal membuat akun admin: ' + (authData.msg || authData.message || '') }), { status: authRes.status, headers: CORS_HEADERS });
                }

                // 3. Hubungkan akun itu ke tenant sebagai admin
                const appUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users`, {
                    method: 'POST',
                    headers: { ...serviceHeaders, 'Prefer': 'return=representation' },
                    body: JSON.stringify({
                        auth_user_id: authData.id, username: admin_email.trim(), email: admin_email.trim(),
                        nama: admin_nama || admin_email, role: 'admin', status: 'Aktif', tenant_id: tenantId
                    })
                });
                if (!appUserRes.ok) {
                    const appUserErr = await appUserRes.json().catch(() => ({}));
                    return new Response(JSON.stringify({ error: 'Tenant & akun dibuat, tapi gagal menghubungkan ke tenant: ' + (appUserErr.message || '') }), { status: appUserRes.status, headers: CORS_HEADERS });
                }

                // 4. Isi kategori Jenis/Golongan default (biar Master Obat langsung bisa dipakai)
                await fetch(`${env.SUPABASE_URL}/rest/v1/kategori_obat`, {
                    method: 'POST',
                    headers: serviceHeaders,
                    body: JSON.stringify(DEFAULT_KATEGORI.map(k => ({ ...k, tenant_id: tenantId })))
                });

                return new Response(JSON.stringify({
                    data: { tenant_id: tenantId, nama_apotek: nama_apotek.trim(), admin_email: admin_email.trim() }
                }), { headers: CORS_HEADERS });
            }
        } catch(e) {
            return new Response(JSON.stringify({ error: e.message || 'Terjadi kesalahan server.' }), { status: 500, headers: CORS_HEADERS });
        }
    }

    // ============================================================
    // AKSI ADMIN TENANT BIASA (kelola user staff dalam 1 apotek) -
    // wajib login & admin tenant tsb, TIDAK bisa jangkau tenant lain
    // (dibatasi RLS lewat token pemanggil sendiri).
    // ============================================================
    const auth = await verifyCallerIsAdmin(request, env);
    if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.message }), { status: auth.status, headers: CORS_HEADERS });
    }

    try {
        if (action === 'create') {
            const { email, password, user_metadata } = body;
            if (!email || !password) {
                return new Response(JSON.stringify({ error: 'Email dan password wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
            }
            const res = await fetch(`${adminApiBase}/users`, {
                method: 'POST',
                headers: serviceHeaders,
                body: JSON.stringify({ email, password, email_confirm: true, user_metadata: user_metadata || {} })
            });
            const data = await res.json();
            if (!res.ok) return new Response(JSON.stringify({ error: data.msg || data.message || 'Gagal membuat akun.' }), { status: res.status, headers: CORS_HEADERS });
            return new Response(JSON.stringify({ data }), { headers: CORS_HEADERS });
        }

        if (action === 'delete') {
            const { user_id } = body;
            if (!user_id) return new Response(JSON.stringify({ error: 'user_id wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
            const res = await fetch(`${adminApiBase}/users/${user_id}`, {
                method: 'DELETE',
                headers: serviceHeaders
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return new Response(JSON.stringify({ error: data.msg || data.message || 'Gagal menghapus akun.' }), { status: res.status, headers: CORS_HEADERS });
            }
            return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
        }

        if (action === 'find-by-email') {
            const { email } = body;
            if (!email) return new Response(JSON.stringify({ error: 'email wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
            const res = await fetch(`${adminApiBase}/users?email=${encodeURIComponent(email)}`, {
                headers: serviceHeaders
            });
            const data = await res.json();
            if (!res.ok) return new Response(JSON.stringify({ error: data.msg || data.message || 'Gagal mencari akun.' }), { status: res.status, headers: CORS_HEADERS });
            const match = (data.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
            return new Response(JSON.stringify({ data: match || null }), { headers: CORS_HEADERS });
        }

        return new Response(JSON.stringify({ error: 'Action tidak dikenal.' }), { status: 400, headers: CORS_HEADERS });
    } catch(e) {
        return new Response(JSON.stringify({ error: e.message || 'Terjadi kesalahan server.' }), { status: 500, headers: CORS_HEADERS });
    }
}
