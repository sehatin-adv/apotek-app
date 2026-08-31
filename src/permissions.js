// src/permissions.js
// Modul penegakan hak akses per user (Hak Akses Modul di Kelola User)
// DAN penegakan batas paket langganan (Basic/Pro).
import { supabase } from './supabase.js';
import { getCurrentUserPermissions, getMyTenantInfo } from './database.js';

// Modul yang cuma tersedia utk tenant paket Pro - berlaku utk SEMUA
// user (termasuk admin), beda dengan hak akses per-user biasa yang
// admin selalu bypass. Ini soal batas PAKET LANGGANAN, bukan soal
// role individu.
const PRO_ONLY_MODULES = new Set([
    'forecasting_stok', 'forecasting_pbf', 'forecasting_rekomendasi', 'forecasting_sp',
    'laporan_laba_rugi', 'audit_log'
]);

// currentModuleKey = module_key milik HALAMAN INI (lihat DEFAULT_MODULES
// di kelola-user.html utk daftar lengkap key yang valid).
// Pass null/undefined kalau halaman ini tidak perlu diproteksi (mis. dashboard).
export async function enforcePermissions(currentModuleKey) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // biar logic checkAuth masing-masing halaman yg redirect ke login

        // ============================================================
        // 1. BATAS PAKET LANGGANAN (Basic/Pro) - dicek DULUAN, berlaku
        //    utk SEMUA user termasuk admin (beda dengan hak akses
        //    per-user di bawah, yang admin selalu bypass).
        // ============================================================
        const { data: tenantInfo } = await getMyTenantInfo();
        const isBasic = tenantInfo && tenantInfo.plan === 'Basic';
        window.__tenantPlan = tenantInfo ? tenantInfo.plan : 'Pro'; // fallback aman kalau gagal fetch

        if (isBasic) {
            document.querySelectorAll('[data-module]').forEach(el => {
                const key = el.getAttribute('data-module');
                if (PRO_ONLY_MODULES.has(key)) {
                    el.style.display = 'none';
                    el.classList.add('pro-locked');
                }
            });
            document.querySelectorAll('.menu-group').forEach(group => {
                const items = group.querySelectorAll('.sub-menu [data-module]');
                if (items.length === 0) return;
                const anyVisible = Array.from(items).some(i => i.style.display !== 'none');
                const header = group.querySelector(':scope > .menu-item');
                if (!anyVisible && header) header.style.display = 'none';
            });

            if (currentModuleKey && PRO_ONLY_MODULES.has(currentModuleKey)) {
                alert('Fitur ini khusus paket Pro. Hubungi admin Sehatin+ untuk upgrade.');
                window.location.href = 'dashboard.html';
                return;
            }
        }

        const { data: appUserRow } = await supabase
            .from('app_users')
            .select('role')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        // PENTING - PERILAKU INI BERUBAH sejak Sehatin+ jadi multi-tenant:
        // dulu "tidak terdaftar di app_users" berarti akun pemilik/superadmin
        // di luar sistem hak akses -> dikasih akses penuh. Sekarang SETIAP
        // akun WAJIB terhubung ke satu tenant/apotek lewat app_users (lihat
        // migration-multitenant.sql, yang otomatis mendaftarkan akun lama).
        // Jadi "tidak ditemukan" sekarang berarti akun ini tidak terhubung
        // ke apotek manapun - harus DITOLAK, bukan dikasih akses penuh,
        // karena RLS di database juga sudah menolak (tenant_id kosong tidak
        // akan pernah cocok dengan data siapa pun).
        if (!appUserRow) {
            console.error('Akun ini tidak terhubung ke tenant/apotek manapun. Hubungi admin.');
            document.querySelectorAll('[data-module]').forEach(el => { el.style.display = 'none'; });
            document.querySelectorAll('.menu-group').forEach(group => {
                const header = group.querySelector(':scope > .menu-item');
                if (header) header.style.display = 'none';
            });
            if (currentModuleKey && currentModuleKey !== 'dashboard') {
                alert('Akun Anda tidak terhubung ke apotek manapun. Hubungi admin.');
            }
            return;
        }

        if (appUserRow.role === 'admin') return; // admin selalu full access, semua modul kebuka

        const { data: perms } = await getCurrentUserPermissions();
        const allowedModules = new Set((perms || []).filter(p => p.can_view).map(p => p.module));

        // Sembunyikan item menu di sidebar yang modulnya tidak diizinkan
        document.querySelectorAll('[data-module]').forEach(el => {
            const key = el.getAttribute('data-module');
            if (!allowedModules.has(key)) {
                el.style.display = 'none';
            }
        });

        // Kalau semua sub-item dalam satu grup menu (mis. MASTER DATA) disembunyikan,
        // sembunyikan juga header grupnya biar sidebar rapi.
        document.querySelectorAll('.menu-group').forEach(group => {
            const items = group.querySelectorAll('.sub-menu [data-module]');
            if (items.length === 0) return;
            const anyVisible = Array.from(items).some(i => i.style.display !== 'none');
            const header = group.querySelector(':scope > .menu-item');
            if (!anyVisible && header) header.style.display = 'none';
        });

        // Blokir akses langsung lewat URL kalau halaman ini sendiri
        // modulnya tidak diizinkan utk user yg sedang login.
        // Dashboard dikecualikan dari redirect (biar ga infinite loop
        // kalau modul dashboard kebetulan juga ke-uncheck).
        if (currentModuleKey && currentModuleKey !== 'dashboard' && !allowedModules.has(currentModuleKey)) {
            alert('Anda tidak memiliki akses ke halaman ini.');
            window.location.href = 'dashboard.html';
        }
    } catch (e) {
        console.error('Error enforcePermissions:', e);
    }
}
