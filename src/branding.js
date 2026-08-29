// src/branding.js
// Modul branding bersama - dipakai semua halaman.
// "Sehatin+" adalah nama & logo produk/software (tetap/fixed).
// Nama & logo APOTEK bisa dikustomisasi lewat menu
// Kelola Aplikasi > Identitas Apotek, dan disimpan di tabel
// pengaturan_apotek di Supabase.
import { getPengaturanApotek } from './database.js';

export const DEFAULT_APOTEK_NAME = 'Apotek Saya';

// Terapkan branding ke halaman saat ini:
// - document.title
// - elemen sidebar dengan id="sidebarApotekName" (nama apotek custom)
// - elemen sidebar dengan id="sidebarLogo" (logo apotek custom, kalau ada)
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

    return { namaApotek, logoUrl };
}
