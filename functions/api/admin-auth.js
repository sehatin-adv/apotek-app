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

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di Cloudflare Pages (Settings > Environment variables > tipe Secret).' }), { status: 500, headers: CORS_HEADERS });
    }

    const auth = await verifyCallerIsAdmin(request, env);
    if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.message }), { status: auth.status, headers: CORS_HEADERS });
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
