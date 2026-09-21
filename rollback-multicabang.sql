-- ============================================================
-- ROLLBACK MULTI-CABANG - Kembalikan Database Staging ke Semula
-- ============================================================
-- Jalankan ini di SQL Editor Supabase STAGING untuk membatalkan
-- SEMUA perubahan Multi-Cabang (Tahap 1, 2, 3, dan perbaikan
-- isolasi). Database akan kembali seperti sebelum Multi-Cabang
-- dimulai. Aman dijalankan berkali-kali.

-- 1) Hapus RLS policy tambahan di tabel transaksi (kembalikan ke
--    "Tenant isolation" biasa tanpa cabang)
DO $$
DECLARE
    t TEXT;
    cabang_tables TEXT[] := ARRAY[
        'penjualan_header','pembelian_header','kartu_stok','stok_opname','kasir_pending'
    ];
BEGIN
    FOREACH t IN ARRAY cabang_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Tenant dan cabang isolation" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation" ON %I', t);
        EXECUTE format('CREATE POLICY "Tenant isolation" ON %I FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id())', t);
    END LOOP;
END $$;

-- 2) Hapus kolom cabang_id dari semua tabel transaksi
ALTER TABLE penjualan_header DROP COLUMN IF EXISTS cabang_id;
ALTER TABLE pembelian_header DROP COLUMN IF EXISTS cabang_id;
ALTER TABLE kartu_stok DROP COLUMN IF EXISTS cabang_id;
ALTER TABLE stok_opname DROP COLUMN IF EXISTS cabang_id;
ALTER TABLE kasir_pending DROP COLUMN IF EXISTS cabang_id;
ALTER TABLE app_users DROP COLUMN IF EXISTS cabang_id;

-- 3) Hapus tabel stok_cabang (otomatis ikut hapus RLS & trigger-nya)
DROP TABLE IF EXISTS stok_cabang CASCADE;

-- 4) Hapus tabel cabang (otomatis ikut hapus RLS-nya)
DROP TABLE IF EXISTS cabang CASCADE;

-- 5) Hapus fungsi-fungsi khusus Multi-Cabang
DROP FUNCTION IF EXISTS get_my_cabang_id();
DROP FUNCTION IF EXISTS sync_obat_stok_agregat();

-- 6) Hapus modul "Kelola Cabang" dari daftar hak akses
DELETE FROM app_modules WHERE module_key = 'kelola_cabang';
DELETE FROM user_permissions WHERE module = 'kelola_cabang';

-- ============================================================
-- SELESAI - Database kembali seperti sebelum Multi-Cabang
-- ============================================================
