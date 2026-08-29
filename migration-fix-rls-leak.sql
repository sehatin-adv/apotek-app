-- ============================================================
-- HOTFIX: KEBOCORAN DATA ANTAR TENANT
-- ============================================================
-- Jalankan SEKARANG JUGA di Supabase SQL Editor. Aman dijalankan
-- berkali-kali (idempotent).
--
-- MASALAH: migration-sehatin.sql sempat direvisi beberapa kali
-- sepanjang pengembangan, dengan nama policy RLS yang berbeda-beda di
-- tiap revisi. Migrasi multi-tenant sebelumnya cuma menghapus policy
-- dengan nama-nama TERTENTU yang saya kira masih aktif - kalau ada
-- policy versi lebih lama dengan nama lain yang masih nyangkut,
-- migrasi itu tidak ikut menghapusnya.
--
-- Di Postgres, RLS dengan >1 policy di tabel yang sama digabung pakai
-- OR - jadi 1 policy lama yang longgar ("asal login boleh lihat
-- semua") tetap bikin SEMUA data kebuka, walau sudah ada policy baru
-- yang lebih ketat ("cuma tenant sendiri"). Ini penyebab akun tenant
-- baru bisa lihat user/data milik tenant lain.
--
-- PERBAIKAN: hapus SEMUA policy yang ada di tiap tabel data (apapun
-- namanya, dari revisi manapun), baru pasang ulang SATU policy
-- "Tenant isolation" yang benar. Ini dijamin bersih karena membaca
-- langsung dari katalog sistem Postgres (pg_policies), bukan menebak
-- nama.
-- ============================================================

DO $$
DECLARE
    t TEXT;
    pol RECORD;
    tenant_tables TEXT[] := ARRAY[
        'obat','supplier','apoteker','penjualan_header','penjualan_detail',
        'retur_penjualan','retur_detail','kartu_stok','shift_history','stok_opname',
        'pembelian_header','pembelian_detail','app_users','user_permissions',
        'audit_log','pengeluaran','supplier_katalog','supplier_selections',
        'kategori_obat','pengaturan_apotek'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

        -- Hapus SEMUA policy di tabel ini, apapun namanya, dari revisi
        -- kapan pun - baca langsung dari pg_policies, bukan tebak nama.
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
        END LOOP;

        -- Pasang ulang SATU policy yang benar
        EXECUTE format(
            'CREATE POLICY "Tenant isolation" ON %I FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id())',
            t
        );
    END LOOP;
END $$;

-- Sekalian bersihkan & pastikan tabel tenants sendiri cuma punya 1 policy yang benar
DO $$
DECLARE
    pol RECORD;
BEGIN
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON tenants', pol.policyname);
    END LOOP;
    CREATE POLICY "Users can read own tenant" ON tenants
        FOR SELECT USING (id = get_my_tenant_id());
END $$;

-- ============================================================
-- VERIFIKASI: setelah menjalankan ini, jalankan query di bawah untuk
-- memastikan tiap tabel data cuma punya TEPAT SATU policy bernama
-- "Tenant isolation" (kalau ada baris dengan jumlah > 1 atau nama
-- lain, berarti masih ada yang nyangkut - beri tahu saya hasilnya).
-- ============================================================
SELECT tablename, count(*) AS jumlah_policy, array_agg(policyname) AS nama_policy
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
    'obat','supplier','apoteker','penjualan_header','penjualan_detail',
    'retur_penjualan','retur_detail','kartu_stok','shift_history','stok_opname',
    'pembelian_header','pembelian_detail','app_users','user_permissions',
    'audit_log','pengeluaran','supplier_katalog','supplier_selections',
    'kategori_obat','pengaturan_apotek','tenants'
)
GROUP BY tablename
ORDER BY tablename;
