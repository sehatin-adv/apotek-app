// functions/api/ipaymu-webhook.js
//
// Dipanggil OTOMATIS oleh server iPaymu (bukan oleh aplikasi kita)
// setiap ada perubahan status pembayaran, ke URL yang kita kasih
// sebagai "notifyUrl" saat bikin transaksi.
//
// Format payload DIKONFIRMASI lewat uji coba nyata (fitur "Tes Notify"
// di dashboard iPaymu Sandbox), dikirim sebagai
// application/x-www-form-urlencoded, contoh isinya:
//   { trx_id: 228250, reference_id: "SEHATIN-...", status: "berhasil",
//     status_code: 1, settlement_status: "settled", ... }
// Kode di bawah tetap ada fallback ke nama field lain jaga-jaga kalau
// ada varian channel pembayaran (bukan cuma QRIS) yang formatnya beda.

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
    // (iPaymu mengirim application/x-www-form-urlencoded, dikonfirmasi lewat uji coba nyata)
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

    // Nama field DIKONFIRMASI dari payload asli iPaymu (lowercase
    // snake_case), dengan fallback ke variasi lain jaga-jaga.
    const referenceId = payload.reference_id || payload.ReferenceId || payload.referenceId || payload.reference || payload.trx_id_merchant || null;
    const trxId = payload.trx_id || payload.TransactionId || payload.trxId || payload.transactionId || null;
    // Sinyal sukses dicek dari 3 sudut sekaligus (status text "berhasil",
    // status_code numerik 1, DAN settlement_status "settled") - kalau
    // salah satu cocok, dianggap sukses. Ini lebih tahan banting daripada
    // cuma andalkan satu field saja.
    const statusText = String(payload.status ?? '').toLowerCase();
    const statusCode = payload.status_code ?? payload.transaction_status_code ?? null;
    const settlementStatus = String(payload.settlement_status ?? '').toLowerCase();

    // Simpan payload mentah dulu apapun hasilnya, buat debugging/verifikasi manual
    if (referenceId) {
        await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}`, {
            method: 'PATCH',
            headers: serviceHeaders,
            body: JSON.stringify({ raw_webhook_payload: JSON.stringify(payload), ipaymu_trx_id: trxId ? String(trxId) : null })
        }).catch(() => {});
    }

    const isSuccess = statusText === 'berhasil' || statusText === 'success' || String(statusCode) === '1' || settlementStatus === 'settled' || settlementStatus === 'paid';

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
