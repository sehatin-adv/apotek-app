// functions/api/ipaymu-webhook.js
//
// Dipanggil OTOMATIS oleh server iPaymu (bukan oleh aplikasi kita)
// setiap ada perubahan status pembayaran, ke URL yang kita kasih
// sebagai "notifyUrl" saat bikin transaksi.
//
// CATATAN JUJUR: format persis payload notifikasi iPaymu belum bisa
// saya pastikan 100% dari dokumentasi publik saat kode ini ditulis.
// Makanya kode ini didesain DEFENSIF:
// - payload mentah SELALU disimpan ke kolom raw_webhook_payload,
//   apapun formatnya - supaya begitu ada 1 transaksi sungguhan lewat
//   sandbox, kita bisa lihat persis isinya dan pastikan/perbaiki
//   logika deteksi sukses di bawah kalau perlu.
// - Deteksi "field mana referenceId, field mana status sukses" coba
//   beberapa kemungkinan nama field sekaligus.

function serviceHeadersOf(env) {
    return {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Response('OK', { status: 200 }); // belum dikonfigurasi, diam saja
    }
    const serviceHeaders = serviceHeadersOf(env);

    // Baca payload - coba JSON dulu, fallback ke form-urlencoded/multipart
    let payload = {};
    const contentType = request.headers.get('content-type') || '';
    try {
        if (contentType.includes('application/json')) {
            payload = await request.json();
        } else {
            const formData = await request.formData();
            for (const [key, value] of formData.entries()) payload[key] = value;
        }
    } catch (e) {
        try {
            const text = await request.text();
            payload = { _raw_text: text };
        } catch (e2) { /* biarkan payload kosong */ }
    }

    // Coba beberapa kemungkinan nama field. iPaymu konsisten pakai
    // PascalCase di respons Direct API (Status, TransactionId,
    // ReferenceId) - diprioritaskan duluan, dengan fallback ke variasi
    // lain jaga-jaga kalau notifikasi webhook beda format dari respons API.
    const referenceId = payload.ReferenceId || payload.referenceId || payload.reference_id || payload.reference || payload.trx_id_merchant || null;
    const statusRaw = payload.Status ?? payload.status ?? payload.status_code ?? payload.transaction_status ?? null;
    const trxId = payload.TransactionId || payload.trx_id || payload.trxId || payload.transactionId || payload.TrxId || null;

    // Simpan payload mentah dulu apapun hasilnya, buat debugging/verifikasi manual
    if (referenceId) {
        await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}`, {
            method: 'PATCH',
            headers: serviceHeaders,
            body: JSON.stringify({ raw_webhook_payload: JSON.stringify(payload), ipaymu_trx_id: trxId })
        }).catch(() => {});
    }

    const statusStr = String(statusRaw ?? '').toLowerCase();
    const isSuccess = statusRaw !== null && (statusStr === '1' || statusStr.includes('berhasil') || statusStr.includes('success') || statusStr === 'settled' || statusStr === 'paid');

    if (referenceId && isSuccess) {
        try {
            // Ambil record pending-nya
            const payRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}&select=*`, { headers: serviceHeaders });
            const payRows = await payRes.json();
            const payment = payRows?.[0];

            if (payment && payment.status !== 'success') {
                // Tandai pembayaran sukses
                await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}`, {
                    method: 'PATCH',
                    headers: serviceHeaders,
                    body: JSON.stringify({ status: 'success', paid_at: new Date().toISOString() })
                });

                // Perpanjang langganan tenant terkait & aktifkan lagi
                const tenantRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${payment.tenant_id}&select=subscription_expires_at`, { headers: serviceHeaders });
                const tenantRows = await tenantRes.json();
                const currentExpiry = tenantRows?.[0]?.subscription_expires_at;
                const base = (currentExpiry && new Date(currentExpiry) > new Date()) ? new Date(currentExpiry) : new Date();
                base.setDate(base.getDate() + (payment.days_to_extend || 30));

                await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${payment.tenant_id}`, {
                    method: 'PATCH',
                    headers: serviceHeaders,
                    body: JSON.stringify({ subscription_expires_at: base.toISOString().split('T')[0], status: 'Aktif' })
                });
            }
        } catch (e) {
            console.error('Error memproses webhook iPaymu:', e);
        }
    }

    return new Response('OK', { status: 200 });
}

export async function onRequestGet() {
    return new Response('iPaymu webhook aktif. Kirim POST dari iPaymu, bukan GET manual.', { status: 200 });
}
