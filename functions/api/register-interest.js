// functions/api/register-interest.js
//
// Endpoint PUBLIK (tanpa login) - dipanggil dari halaman pendaftaran
// (daftar.html) saat calon pelanggan submit form ketertarikan
// berlangganan. Datanya masuk ke tabel tenant_registrations, muncul
// di Kelola Tenant (platform-tenants.html) buat diproses admin
// platform jadi akun aktif.

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

export async function onRequestOptions() {
    return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
            return new Response(JSON.stringify({ error: 'Server belum dikonfigurasi lengkap.' }), { status: 500, headers: CORS_HEADERS });
        }

        const body = await request.json().catch(() => null);
        if (!body) {
            return new Response(JSON.stringify({ error: 'Data form tidak valid.' }), { status: 400, headers: CORS_HEADERS });
        }

        const nama_apotek = String(body.nama_apotek || '').trim();
        const nama_pic = String(body.nama_pic || '').trim();
        const email = String(body.email || '').trim();
        const telepon = String(body.telepon || '').trim();
        const alamat = String(body.alamat || '').trim();
        const paket_diminati = ['Basic', 'Pro'].includes(body.paket_diminati) ? body.paket_diminati : 'Basic';
        const durasi_bulan = [1, 6, 12].includes(Number(body.durasi_bulan)) ? Number(body.durasi_bulan) : 1;
        const catatan = String(body.catatan || '').trim();

        if (!nama_apotek || !nama_pic || !email) {
            return new Response(JSON.stringify({ error: 'Nama apotek, nama PIC, dan email wajib diisi.' }), { status: 400, headers: CORS_HEADERS });
        }
        // Validasi email sederhana - cukup buat menyaring input asal-asalan
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return new Response(JSON.stringify({ error: 'Format email tidak valid.' }), { status: 400, headers: CORS_HEADERS });
        }

        const serviceHeaders = {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenant_registrations`, {
            method: 'POST',
            headers: serviceHeaders,
            body: JSON.stringify({ nama_apotek, nama_pic, email, telepon, alamat, paket_diminati, durasi_bulan, catatan, status: 'Baru' })
        });
        const data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ error: 'Gagal menyimpan pendaftaran: ' + (data.message || JSON.stringify(data)) }), { status: 500, headers: CORS_HEADERS });
        }

        return new Response(JSON.stringify({ data: { id: data[0]?.id } }), { headers: CORS_HEADERS });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Kesalahan tak terduga: ' + (e?.message || String(e)) }), { status: 500, headers: CORS_HEADERS });
    }
}
