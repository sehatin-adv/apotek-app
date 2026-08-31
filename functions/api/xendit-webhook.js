// functions/api/xendit-webhook.js
//
// Dipanggil OTOMATIS oleh server Xendit setiap ada pembayaran QRIS
// berhasil, ke URL yang kita kasih sebagai "callback_url" saat bikin
// QR code. Payload JSON, contoh:
//   { event: "qr.payment", qr_code: { external_id: "SEHATIN-..." },
//     amount: 51250, status: "COMPLETED" }
// Xendit menyertakan header "x-callback-token" yang WAJIB dicocokkan
// dengan Verification Token di dashboard Xendit (Konfigurasi >
// Callback) - ini yang membuktikan notifikasi benar2 dari Xendit,
// bukan orang lain berpura-pura.

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

    try {
        // Verifikasi token callback - WAJIB, supaya orang lain tidak bisa
        // pura-pura mengirim notifikasi "pembayaran sukses" palsu.
        const callbackToken = request.headers.get('x-callback-token') || '';
        if (!env.XENDIT_CALLBACK_TOKEN || callbackToken !== env.XENDIT_CALLBACK_TOKEN) {
            console.error('Xendit webhook: token callback tidak cocok atau belum diset.');
            return new Response('Invalid token', { status: 401 });
        }

        const payload = await request.json().catch(() => null);
        if (!payload) return new Response('OK', { status: 200 });

        const referenceId = payload?.qr_code?.external_id;
        const status = payload?.status; // "COMPLETED" kalau sukses
        if (!referenceId || status !== 'COMPLETED') {
            return new Response('OK', { status: 200 }); // bukan event sukses, abaikan saja
        }

        const paymentRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}&select=*`, { headers: serviceHeaders });
        const paymentRows = await paymentRes.json();
        const payment = paymentRows?.[0];

        if (payment && payment.status !== 'success') {
            await fetch(`${env.SUPABASE_URL}/rest/v1/subscription_payments?reference_id=eq.${referenceId}`, {
                method: 'PATCH',
                headers: serviceHeaders,
                body: JSON.stringify({ status: 'success', paid_at: new Date().toISOString() })
            });

            if (payment.payment_type === 'upgrade' && payment.upgrade_to_plan) {
                // UPGRADE PAKET - cuma ganti "plan", TIDAK menambah hari
                // langganan.
                await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${payment.tenant_id}`, {
                    method: 'PATCH',
                    headers: serviceHeaders,
                    body: JSON.stringify({ plan: payment.upgrade_to_plan, status: 'Aktif' })
                });
            } else {
                // PERPANJANGAN BIASA
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
        }

        return new Response('OK', { status: 200 });
    } catch (e) {
        console.error('Error xendit-webhook:', e);
        return new Response('OK', { status: 200 }); // tetap balas 200 spy Xendit tidak retry terus
    }
}
