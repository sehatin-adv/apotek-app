// functions/api/scan-invoice.js
//
// Terima foto faktur (base64), kirim ke Gemini Vision API, minta
// balikan data terstruktur (nama PBF, no faktur, tanggal, daftar item).
// Dipanggil dari tombol "Scan Faktur AI" di halaman Pembelian.
//
// Hasil dari AI TIDAK langsung disimpan ke database - selalu
// ditampilkan dulu ke pengguna untuk dicek/diedit, karena OCR/AI
// membaca gambar tidak selalu 100% akurat (tulisan tangan, foto
// miring, kualitas jelek, dsb).

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

export async function onRequestOptions() {
    return new Response(null, { headers: CORS_HEADERS });
}

const EXTRACTION_PROMPT = `Kamu membaca foto faktur/nota pembelian obat dari PBF (distributor farmasi) ke apotek.
Baca gambar ini dan keluarkan HANYA JSON (tanpa markdown, tanpa penjelasan tambahan) dengan struktur persis seperti ini:

{
  "nama_pbf": "nama distributor/PBF pengirim faktur, kosongkan string jika tidak terbaca",
  "no_faktur": "nomor faktur, kosongkan string jika tidak terbaca",
  "no_faktur_pajak": "nomor faktur pajak jika ada, kosongkan string jika tidak ada/tidak terbaca",
  "tanggal_faktur": "tanggal dalam format YYYY-MM-DD, kosongkan string jika tidak terbaca",
  "items": [
    {
      "nama_obat": "nama obat/produk persis seperti tertulis di faktur",
      "jumlah": angka jumlah/quantity (number, bukan string),
      "satuan": "satuan seperti Tablet/Botol/Strip/Box/dsb, tebak yang wajar kalau tidak jelas",
      "harga_satuan": harga per satuan dalam Rupiah (number, bukan string, tanpa titik/koma pemisah),
      "diskon_persen": angka diskon persen jika tertera per item, 0 jika tidak ada,
      "no_batch": "nomor batch/lot produk jika tertera di faktur, string kosong jika tidak ada",
      "tanggal_exp": "tanggal kedaluwarsa (ED/expired date) produk dalam format YYYY-MM-DD jika tertera di faktur, string kosong jika tidak ada"
    }
  ]
}

ATURAN PENTING:
- Kalau ada field yang benar-benar tidak terbaca/tidak ada di gambar, isi dengan string kosong "" (untuk teks) atau 0 (untuk angka) - JANGAN mengarang isi.
- Untuk "items", baca SEMUA baris item di faktur, jangan lewatkan satupun.
- harga_satuan dan jumlah HARUS berupa angka murni (number JSON), bukan string berformat seperti "15.000".
- no_batch dan tanggal_exp sering ada di kolom terpisah di faktur (kadang disingkat "No. Batch", "Batch/Lot", "ED", "Exp", "Kadaluwarsa") - baca dengan teliti kalau ada.
- Kalau gambar bukan faktur/nota sama sekali, atau benar-benar tidak bisa dibaca, kembalikan items sebagai array kosong [].`;

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'GEMINI_API_KEY belum diset di server.' }), { status: 500, headers: CORS_HEADERS });
        }
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
            return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di server.' }), { status: 500, headers: CORS_HEADERS });
        }

        const body = await request.json().catch(() => null);
        if (!body || !body.image_base64) {
            return new Response(JSON.stringify({ error: 'Gambar faktur wajib dikirim (image_base64).' }), { status: 400, headers: CORS_HEADERS });
        }

        // ============================================================
        // Verifikasi pemanggil + cek batas jatah Scan AI (5x/bulan utk
        // paket Basic, tanpa batas utk Pro). Ini WAJIB dicek di server
        // (bukan cuma disembunyikan di UI) karena tiap panggilan ke
        // Gemini ada biaya nyata - kalau cuma dikunci di frontend, orang
        // masih bisa panggil endpoint ini langsung dan biayanya tetap
        // jalan terus tanpa batas.
        // ============================================================
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token) return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.' }), { status: 401, headers: CORS_HEADERS });

        const serviceHeaders = {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        };

        const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
        });
        if (!userRes.ok) return new Response(JSON.stringify({ error: 'Sesi login tidak valid.' }), { status: 401, headers: CORS_HEADERS });
        const authUser = await userRes.json();

        const appUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${authUser.id}&select=tenant_id`, { headers: serviceHeaders });
        const appUserRows = await appUserRes.json();
        const tenantId = appUserRows?.[0]?.tenant_id;
        if (!tenantId) return new Response(JSON.stringify({ error: 'Akun ini tidak terhubung ke tenant manapun.' }), { status: 403, headers: CORS_HEADERS });

        const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}&select=plan`, { headers: serviceHeaders });
        const tenantRows = await tenantRes.json();
        const plan = tenantRows?.[0]?.plan || 'Basic';

        if (plan === 'Basic') {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const countRes = await fetch(
                `${env.SUPABASE_URL}/rest/v1/ai_scan_log?tenant_id=eq.${tenantId}&created_at=gte.${firstOfMonth}&select=id`,
                { headers: { ...serviceHeaders, 'Prefer': 'count=exact' } }
            );
            const countHeader = countRes.headers.get('content-range'); // format: "0-4/5"
            const usedCount = countHeader ? parseInt(countHeader.split('/')[1], 10) || 0 : 0;
            const LIMIT_BASIC = 5;
            if (usedCount >= LIMIT_BASIC) {
                return new Response(JSON.stringify({
                    error: `Jatah Scan Faktur AI bulan ini sudah habis (${LIMIT_BASIC}x/bulan untuk paket Basic). Upgrade ke Pro untuk scan tanpa batas.`,
                    quota_exceeded: true
                }), { status: 403, headers: CORS_HEADERS });
            }
        }

        // image_base64 bisa datang dengan prefix "data:image/jpeg;base64,..." - buang prefix-nya
        let mimeType = body.mime_type || 'image/jpeg';
        let base64Data = body.image_base64;
        const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            mimeType = dataUrlMatch[1];
            base64Data = dataUrlMatch[2];
        }

        const geminiBody = {
            contents: [{
                parts: [
                    { text: EXTRACTION_PROMPT },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1
            }
        };

        // Model diupdate ke gemini-3.6-flash - versi sebelumnya
        // (gemini-2.5-flash) sudah tidak tersedia lagi utk user baru
        // per pesan error resmi dari Gemini API.
        const model = 'gemini-3.6-flash';
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiBody)
            }
        );

        const geminiRawText = await geminiRes.text();
        let geminiData;
        try {
            geminiData = JSON.parse(geminiRawText);
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Respons Gemini bukan JSON valid.', detail: geminiRawText.slice(0, 500) }), { status: 502, headers: CORS_HEADERS });
        }

        if (!geminiRes.ok) {
            return new Response(JSON.stringify({ error: 'Gemini API menolak permintaan.', detail: geminiData }), { status: geminiRes.status, headers: CORS_HEADERS });
        }

        const textOut = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textOut) {
            return new Response(JSON.stringify({ error: 'Gemini tidak mengembalikan hasil bacaan.', detail: geminiData }), { status: 502, headers: CORS_HEADERS });
        }

        let extracted;
        try {
            extracted = JSON.parse(textOut);
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Hasil bacaan AI bukan format JSON yang valid.', detail: textOut.slice(0, 500) }), { status: 502, headers: CORS_HEADERS });
        }

        // Catat pemakaian scan ini (dipakai buat hitung jatah bulanan
        // Basic) - dicatat SETELAH benar-benar berhasil, supaya scan yang
        // gagal/error tidak ikut memotong jatah pengguna.
        await fetch(`${env.SUPABASE_URL}/rest/v1/ai_scan_log`, {
            method: 'POST',
            headers: serviceHeaders,
            body: JSON.stringify({ tenant_id: tenantId })
        }).catch(() => {});

        return new Response(JSON.stringify({ data: extracted }), { headers: CORS_HEADERS });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Kesalahan tak terduga: ' + (e?.message || String(e)) }), { status: 500, headers: CORS_HEADERS });
    }
}
