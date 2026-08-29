// functions/api/telegram-webhook.js
//
// Bot Telegram buat kelola tenant/apotek langsung dari chat, tanpa
// buka /platform-tenants.html. Cara pakai:
// 1. Buat bot lewat @BotFather di Telegram, catat token-nya.
// 2. Cari tahu User ID Telegram Anda sendiri lewat @userinfobot.
// 3. Set 2 secret di Cloudflare Pages:
//      npx wrangler pages secret put TELEGRAM_BOT_TOKEN
//      npx wrangler pages secret put TELEGRAM_AUTHORIZED_USER_ID
// 4. Daftarkan webhook-nya (SEKALI SAJA) - buka URL ini di browser
//    (ganti <TOKEN> dan domain Anda):
//      https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://sehatin-app.pages.dev/api/telegram-webhook
// 5. Chat bot Anda di Telegram, coba kirim /help
//
// Cuma pesan dari TELEGRAM_AUTHORIZED_USER_ID yang diproses - dari
// user lain diabaikan diam-diam (tidak dibalas apa-apa, supaya orang
// asing yang nemu bot ini tidak tahu bot ini "hidup").

async function sendTelegramMessage(env, chatId, text) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    }).catch(() => {});
}

function serviceHeadersOf(env) {
    return {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
    };
}

async function findTenantsByName(env, keyword) {
    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/tenants?nama=ilike.*${encodeURIComponent(keyword)}*&select=*`,
        { headers: serviceHeadersOf(env) }
    );
    if (!res.ok) return [];
    return res.json();
}

function formatTanggal(iso) {
    if (!iso) return 'tanpa batas';
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function handleList(env, chatId) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?select=*&order=created_at.desc`, { headers: serviceHeadersOf(env) });
    const tenants = await res.json();
    if (!tenants || tenants.length === 0) {
        await sendTelegramMessage(env, chatId, 'Belum ada tenant terdaftar.');
        return;
    }
    const lines = tenants.map(t => {
        const emoji = t.status === 'Aktif' ? '✅' : t.status === 'Suspended' ? '🔴' : '🟡';
        return `${emoji} <b>${t.nama}</b>\nStatus: ${t.status} | Langganan: ${formatTanggal(t.subscription_expires_at)}`;
    });
    await sendTelegramMessage(env, chatId, lines.join('\n\n'));
}

async function handleExtend(env, chatId, keyword, days) {
    if (!keyword) {
        await sendTelegramMessage(env, chatId, '⚠️ Format: /perpanjang &lt;nama apotek&gt; [jumlah hari, default 30]\nContoh: /perpanjang Naya 30');
        return;
    }
    const matches = await findTenantsByName(env, keyword);
    if (matches.length === 0) {
        await sendTelegramMessage(env, chatId, `❌ Tidak ada tenant dengan nama mengandung "${keyword}".`);
        return;
    }
    if (matches.length > 1) {
        const names = matches.map(t => '- ' + t.nama).join('\n');
        await sendTelegramMessage(env, chatId, `⚠️ Ada ${matches.length} tenant cocok dengan "${keyword}", sebutkan nama lebih spesifik:\n${names}`);
        return;
    }
    const t = matches[0];
    const base = (t.subscription_expires_at && new Date(t.subscription_expires_at) > new Date()) ? new Date(t.subscription_expires_at) : new Date();
    base.setDate(base.getDate() + days);
    const expiresAtIso = base.toISOString().split('T')[0];

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${t.id}`, {
        method: 'PATCH',
        headers: { ...serviceHeadersOf(env), 'Prefer': 'return=representation' },
        body: JSON.stringify({ subscription_expires_at: expiresAtIso, status: 'Aktif' })
    });
    if (!res.ok) {
        await sendTelegramMessage(env, chatId, '❌ Gagal memperpanjang langganan.');
        return;
    }
    await sendTelegramMessage(env, chatId, `✅ <b>${t.nama}</b> diperpanjang ${days} hari.\nAktif sampai: ${formatTanggal(expiresAtIso)}\nStatus: Aktif`);
}

async function handleStatus(env, chatId, keyword, newStatus) {
    if (!keyword) {
        await sendTelegramMessage(env, chatId, `⚠️ Format: /${newStatus === 'Suspended' ? 'bekukan' : 'aktifkan'} &lt;nama apotek&gt;`);
        return;
    }
    const matches = await findTenantsByName(env, keyword);
    if (matches.length === 0) {
        await sendTelegramMessage(env, chatId, `❌ Tidak ada tenant dengan nama mengandung "${keyword}".`);
        return;
    }
    if (matches.length > 1) {
        const names = matches.map(t => '- ' + t.nama).join('\n');
        await sendTelegramMessage(env, chatId, `⚠️ Ada ${matches.length} tenant cocok, sebutkan nama lebih spesifik:\n${names}`);
        return;
    }
    const t = matches[0];
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenants?id=eq.${t.id}`, {
        method: 'PATCH',
        headers: serviceHeadersOf(env),
        body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) {
        await sendTelegramMessage(env, chatId, '❌ Gagal mengubah status.');
        return;
    }
    const emoji = newStatus === 'Aktif' ? '✅' : '🔴';
    await sendTelegramMessage(env, chatId, `${emoji} <b>${t.nama}</b> sekarang berstatus ${newStatus}.`);
}

const HELP_TEXT = `<b>Perintah Bot Sehatin+</b>

/list - Lihat semua tenant &amp; status langganan
/perpanjang &lt;nama&gt; [hari] - Perpanjang langganan (default 30 hari), otomatis aktif lagi
/bekukan &lt;nama&gt; - Bekukan akses tenant
/aktifkan &lt;nama&gt; - Aktifkan kembali tenant
/help - Tampilkan pesan ini

Contoh:
/perpanjang Naya 30
/perpanjang Naya (default 30 hari)
/bekukan Naya`;

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_AUTHORIZED_USER_ID || !env.SUPABASE_SERVICE_ROLE_KEY) {
        // Belum dikonfigurasi - diam saja, jangan bocorkan info ke pemanggil luar
        return new Response('OK', { status: 200 });
    }

    let update;
    try {
        update = await request.json();
    } catch (e) {
        return new Response('OK', { status: 200 });
    }

    const message = update.message;
    if (!message || !message.text) return new Response('OK', { status: 200 });

    const chatId = message.chat.id;
    const senderId = String(message.from?.id || '');

    // Cuma proses pesan dari user yang diotorisasi - abaikan yang lain diam-diam
    if (senderId !== String(env.TELEGRAM_AUTHORIZED_USER_ID)) {
        return new Response('OK', { status: 200 });
    }

    const text = message.text.trim();
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase().replace(/@\w+$/, ''); // buang @NamaBot kalau ada

    try {
        if (command === '/start' || command === '/help') {
            await sendTelegramMessage(env, chatId, HELP_TEXT);
        } else if (command === '/list') {
            await handleList(env, chatId);
        } else if (command === '/perpanjang') {
            const lastArg = parts[parts.length - 1];
            const hasDays = parts.length > 2 && /^\d+$/.test(lastArg);
            const days = hasDays ? parseInt(lastArg, 10) : 30;
            const keyword = hasDays ? parts.slice(1, -1).join(' ') : parts.slice(1).join(' ');
            await handleExtend(env, chatId, keyword, days);
        } else if (command === '/bekukan') {
            await handleStatus(env, chatId, parts.slice(1).join(' '), 'Suspended');
        } else if (command === '/aktifkan') {
            await handleStatus(env, chatId, parts.slice(1).join(' '), 'Aktif');
        } else {
            await sendTelegramMessage(env, chatId, 'Perintah tidak dikenal. Ketik /help utk lihat daftar perintah.');
        }
    } catch (e) {
        await sendTelegramMessage(env, chatId, '❌ Terjadi kesalahan: ' + e.message);
    }

    return new Response('OK', { status: 200 });
}

export async function onRequestGet() {
    return new Response('Telegram webhook aktif. Kirim POST dari Telegram, bukan GET manual.', { status: 200 });
}
