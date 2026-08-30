// src/branding.js
// Modul branding bersama - dipakai semua halaman.
// "Sehatin+" adalah nama & logo produk/software (tetap/fixed).
// Nama & logo APOTEK bisa dikustomisasi lewat menu
// Kelola Aplikasi > Identitas Apotek, dan disimpan di tabel
// pengaturan_apotek di Supabase.
import { supabase } from './supabase.js';
import { getPengaturanApotek } from './database.js';

export const DEFAULT_APOTEK_NAME = 'Apotek Saya';

// Terapkan branding ke halaman saat ini:
// - document.title
// - elemen sidebar dengan id="sidebarApotekName" (nama apotek custom)
// - elemen sidebar dengan id="sidebarLogo" (logo apotek custom, kalau ada)
// - banner notifikasi kalau masa berlangganan tenant mau/sudah habis
export async function applyBranding(pageTitle) {
    let namaApotek = DEFAULT_APOTEK_NAME;
    let logoUrl = null;

    try {
        const { data } = await getPengaturanApotek();
        if (data) {
            namaApotek = data.nama_apotek || DEFAULT_APOTEK_NAME;
            logoUrl = data.logo_url || null;
        }
    } catch (e) {
        console.error('Error applyBranding:', e);
    }

    document.title = pageTitle ? `${pageTitle} - ${namaApotek} | Sehatin+` : `Sehatin+`;
    // Simpan di window supaya bisa dipakai kode lain di halaman yg sama
    // (mis. template struk/print) tanpa perlu import ulang.
    window.__apotekName = namaApotek;
    window.__apotekLogoUrl = logoUrl;

    const nameEl = document.getElementById('sidebarApotekName');
    if (nameEl) nameEl.textContent = namaApotek;

    const loginNameEl = document.getElementById('loginApotekName');
    if (loginNameEl) loginNameEl.textContent = namaApotek;

    if (logoUrl) {
        const logoEl = document.getElementById('sidebarLogo');
        if (logoEl) logoEl.src = logoUrl;
        const loginLogoEl = document.getElementById('loginApotekLogo');
        if (loginLogoEl) loginLogoEl.src = logoUrl;
    }

    checkSubscriptionBanner();

    return { namaApotek, logoUrl };
}

// ============================================================
// NOTIFIKASI MASA BERLANGGANAN
// Muncul otomatis di semua halaman (lewat applyBranding di atas)
// kalau tenant lagi Suspended atau masa berlangganannya mau/sudah habis.
// ============================================================
async function checkSubscriptionBanner() {
    try {
        const { data, error } = await supabase.rpc('get_my_tenant_info');
        if (error) return; // fungsi belum ada (migration blm dijalankan) atau user blm terhubung tenant - diam saja
        const info = Array.isArray(data) ? data[0] : data;
        if (!info) return;

        const expiresAt = info.subscription_expires_at ? new Date(info.subscription_expires_at) : null;
        const isSuspended = info.status === 'Suspended';
        const daysLeft = expiresAt ? Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24)) : null;

        const shouldWarn = isSuspended || (daysLeft !== null && daysLeft <= 7);
        if (!shouldWarn) return;

        let qrisUrl = null;
        let subscriptionPrice = null;
        try {
            const { data: qrisRow } = await supabase.from('platform_settings').select('value').eq('key', 'qris_image_url').maybeSingle();
            qrisUrl = qrisRow?.value || null;
        } catch (e) { /* platform_settings mungkin belum ada, abaikan */ }
        try {
            const { data: priceRow } = await supabase.from('platform_settings').select('value').eq('key', 'subscription_price').maybeSingle();
            subscriptionPrice = priceRow?.value || null;
        } catch (e) { /* abaikan */ }

        renderSubscriptionBanner({ isSuspended, daysLeft, expiresAt, qrisUrl, subscriptionPrice });
    } catch (e) {
        console.error('Error checkSubscriptionBanner:', e);
    }
}

function formatRupiah(v) {
    const n = Number(v);
    if (!v || isNaN(n)) return null;
    return 'Rp ' + n.toLocaleString('id-ID');
}

function renderSubscriptionBanner({ isSuspended, daysLeft, expiresAt, qrisUrl, subscriptionPrice }) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    if (document.getElementById('subscriptionBanner')) return; // jangan dobel

    const urgent = isSuspended || (daysLeft !== null && daysLeft < 0);
    const tglStr = expiresAt ? expiresAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const hargaStr = formatRupiah(subscriptionPrice);

    const message = urgent
        ? `Langganan Sehatin+ sudah <strong>berakhir</strong>${tglStr ? ' pada ' + tglStr : ''}. Sebagian fitur mungkin terkunci - segera perpanjang${hargaStr ? ' (' + hargaStr + '/bulan)' : ''}.`
        : `Langganan Sehatin+ akan berakhir dalam <strong>${daysLeft} hari</strong> (${tglStr}). Perpanjang sekarang${hargaStr ? ' - ' + hargaStr + '/bulan' : ''} supaya tidak terputus.`;

    const banner = document.createElement('div');
    banner.id = 'subscriptionBanner';
    banner.style.cssText = `background:${urgent ? '#fbe4e6' : '#fff3cd'};border:1px solid ${urgent ? '#f5c6cb' : '#ffe69c'};color:${urgent ? '#842029' : '#664d03'};padding:14px 18px;border-radius:12px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;font-family:'Inter',sans-serif;`;
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <i class="fas fa-triangle-exclamation" style="font-size:18px;"></i>
            <span>${message}</span>
        </div>
        ${qrisUrl ? `<button id="btnShowQris" style="background:${urgent ? '#dc3545' : '#b8860b'};color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">Perpanjang Sekarang</button>` : ''}
    `;
    mainContent.insertBefore(banner, mainContent.firstChild);

    const btn = document.getElementById('btnShowQris');
    if (btn) btn.onclick = () => showQrisModal(qrisUrl, subscriptionPrice);
}

function showQrisModal(qrisUrl, subscriptionPrice) {
    const hargaStr = formatRupiah(subscriptionPrice);
    const overlay = document.createElement('div');
    overlay.id = 'qrisModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,30,46,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:\'Inter\',sans-serif;';
    overlay.innerHTML = `
        <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:100%;text-align:center;">
            <h3 style="margin-bottom:6px;color:#0f1e2e;font-size:16px;">Perpanjang Langganan</h3>
            ${hargaStr ? `<p style="font-size:22px;font-weight:800;color:#2d6a9f;margin-bottom:4px;">${hargaStr}<span style="font-size:12px;font-weight:500;color:#7a8a9e;"> /bulan</span></p>` : ''}
            <div id="qrisModalBody">
                <p style="font-size:12px;color:#7a8a9e;margin:14px 0;"><i class="fas fa-spinner fa-spin"></i> Membuat kode QRIS...</p>
            </div>
            <button id="btnCloseQris" style="width:100%;padding:10px;background:#2d6a9f;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;margin-top:10px;">Tutup</button>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('btnCloseQris').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // Coba bikin QRIS DINAMIS lewat iPaymu dulu (kalau sudah terintegrasi).
    // Kalau gagal/belum siap, otomatis pakai QRIS statis (fallback) supaya
    // pengalaman pengguna tidak pernah benar-benar buntu.
    createDynamicQris().then(dynamicQrImage => {
        const body = document.getElementById('qrisModalBody');
        if (!body) return; // modal sudah ditutup duluan
        if (dynamicQrImage) {
            body.innerHTML = `
                <img src="${dynamicQrImage}" alt="QRIS" style="width:100%;border-radius:10px;margin-bottom:6px;border:1px solid #eef2f7;">
                <p style="font-size:11px;color:#28a745;margin-bottom:8px;"><i class="fas fa-bolt"></i> Kode QRIS otomatis - status pembayaran terdeteksi sendiri</p>
            `;
        } else if (qrisUrl) {
            body.innerHTML = `
                <img src="${qrisUrl}" alt="QRIS" style="width:100%;border-radius:10px;margin-bottom:6px;border:1px solid #eef2f7;">
                <p style="font-size:12px;color:#7a8a9e;margin-bottom:8px;">Scan QRIS di atas, transfer sesuai nominal, lalu konfirmasi ke admin Sehatin+ supaya akses Anda diaktifkan kembali.</p>
            `;
        } else {
            body.innerHTML = `<p style="font-size:12px;color:#dc3545;margin:14px 0;">Gagal memuat QRIS. Hubungi admin Sehatin+ untuk perpanjangan manual.</p>`;
        }
    });
}

async function createDynamicQris() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return null;
        const res = await fetch('/api/ipaymu-create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) return null;
        const result = await res.json();
        const ipaymuData = result?.data?.ipaymu;
        if (!ipaymuData) return null;
        // Nama field respons QRIS iPaymu belum 100% dipastikan - coba
        // beberapa kemungkinan field yang lazim dipakai.
        const d = ipaymuData.Data || ipaymuData.data || ipaymuData;
        const qrImage = d?.QrImage || d?.qrImage || d?.QrUrl || d?.qrUrl || d?.Url || d?.url || null;
        return qrImage || null;
    } catch (e) {
        console.error('Error createDynamicQris:', e);
        return null;
    }
}
