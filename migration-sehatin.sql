-- ============================================================
-- SEHATIN+ MIGRATION
-- Jalankan file ini di Supabase SQL Editor (Project > SQL Editor > New query)
-- Aman dijalankan berkali-kali (pakai IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- 1) FIX RLS: app_users, user_permissions, app_modules, audit_log
-- ------------------------------------------------------------
-- Tabel-tabel ini dibuat belakangan (di luar schema.sql awal) dan
-- RLS-nya aktif tanpa policy INSERT/UPDATE/DELETE/SELECT untuk role
-- 'authenticated'. Kode aplikasi sekarang mengakses tabel-tabel ini
-- lewat client biasa (session login admin/staff = role 'authenticated'
-- di Supabase), PERSIS pola yang sudah dipakai & terbukti jalan di
-- tabel obat/supplier/dll di schema.sql awal. Jadi kita samakan
-- polanya di sini: FOR ALL, bukan cuma SELECT.
--
-- (Operasi bikin/hapus akun login di Supabase Auth sendiri tetap
-- pakai service role key khusus lewat Admin API - itu di luar RLS.)

ALTER TABLE IF EXISTS app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read app_users" ON app_users;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON app_users;
CREATE POLICY "Allow authenticated users full access" ON app_users
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated read user_permissions" ON user_permissions;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON user_permissions;
CREATE POLICY "Allow authenticated users full access" ON user_permissions
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated read app_modules" ON app_modules;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON app_modules;
CREATE POLICY "Allow authenticated users full access" ON app_modules
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated read audit_log" ON audit_log;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON audit_log;
CREATE POLICY "Allow authenticated users full access" ON audit_log
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 2) MODUL KEUANGAN — tabel pengeluaran
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengeluaran (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tanggal DATE NOT NULL,
    kategori TEXT DEFAULT 'Operasional',
    keterangan TEXT NOT NULL,
    nominal INTEGER NOT NULL DEFAULT 0,
    metode_pembayaran TEXT DEFAULT 'Cash',
    dicatat_oleh TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pengeluaran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access" ON pengeluaran;
CREATE POLICY "Allow authenticated users full access" ON pengeluaran
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 3) IDENTITAS APOTEK — tabel pengaturan_apotek (single row, id = 1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengaturan_apotek (
    id INTEGER PRIMARY KEY DEFAULT 1,
    nama_apotek TEXT DEFAULT 'Apotek Saya',
    alamat TEXT,
    telepon TEXT,
    email TEXT,
    npwp TEXT,
    apoteker_pj TEXT,
    logo_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE pengaturan_apotek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read pengaturan_apotek" ON pengaturan_apotek;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON pengaturan_apotek;
CREATE POLICY "Allow authenticated users full access" ON pengaturan_apotek
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Baris default supaya form Identitas Apotek langsung ada isinya
INSERT INTO pengaturan_apotek (id, nama_apotek)
VALUES (1, 'Apotek Saya')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SELESAI
-- Setelah menjalankan ini, kemungkinan besar error
-- "new row violates row-level security policy for table app_users"
-- akan hilang, karena sekarang ada policy INSERT/UPDATE/DELETE
-- eksplisit untuk role 'authenticated' (bukan cuma SELECT seperti
-- sebelumnya), dan kode aplikasi sudah diubah untuk memakai client
-- login biasa (bukan service role) saat mengakses tabel-tabel ini.
-- ============================================================

-- ------------------------------------------------------------
-- 4) MODUL FORECASTING — Analisis Stok & Katalog PBF
-- ------------------------------------------------------------
-- Catatan: "Analisis Stok" memakai data obat yang SUDAH ADA di tabel
-- obat (kolom stok & stok_minimal) - tidak perlu tabel baru untuk itu.
-- "Data PBF" TIDAK punya tabel distributor sendiri - datanya diambil
-- langsung dari tabel supplier (Master Data > Data Supplier) yang
-- sudah ada, supaya tidak ada data ganda. Tabel di bawah ini cuma
-- untuk katalog produk tiap supplier & pilihan pesanan.

-- Bersihkan tabel PBF terpisah dari percobaan migrasi sebelumnya
-- (kalau belum pernah dijalankan, DROP IF EXISTS ini aman/no-op)
DROP TABLE IF EXISTS pbf_selections CASCADE;
DROP TABLE IF EXISTS pbf_produk CASCADE;
DROP TABLE IF EXISTS pbf CASCADE;

CREATE TABLE IF NOT EXISTS supplier_katalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    nama TEXT NOT NULL,
    harga INTEGER DEFAULT 0,
    satuan TEXT,
    min_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_supplier_katalog_supplier_id ON supplier_katalog(supplier_id);

-- Pilihan pesanan per obat (1 obat cuma boleh punya 1 pilihan supplier/produk
-- aktif, makanya obat_id jadi primary key - pilih ulang = timpa yang lama)
CREATE TABLE IF NOT EXISTS supplier_selections (
    obat_id UUID PRIMARY KEY REFERENCES obat(id) ON DELETE CASCADE,
    obat_nama TEXT,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    supplier_nama TEXT,
    produk_id UUID,
    produk_nama TEXT,
    harga INTEGER DEFAULT 0,
    satuan TEXT,
    qty INTEGER DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE supplier_katalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access" ON supplier_katalog;
CREATE POLICY "Allow authenticated users full access" ON supplier_katalog
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users full access" ON supplier_selections;
CREATE POLICY "Allow authenticated users full access" ON supplier_selections
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tambahan kolom SIA/SIPA apoteker di Identitas Apotek, dipakai di
-- kop tanda-tangan Surat Pesanan (kalau kolomnya sudah ada, baris ini aman dilewati)
ALTER TABLE pengaturan_apotek ADD COLUMN IF NOT EXISTS sia TEXT;
ALTER TABLE pengaturan_apotek ADD COLUMN IF NOT EXISTS sipa TEXT;

-- ============================================================
-- SELESAI (Forecasting)
-- ============================================================

-- ------------------------------------------------------------
-- 5) KATEGORI OBAT — Jenis & Golongan yang bisa ditambah/dihapus
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kategori_obat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipe TEXT NOT NULL CHECK (tipe IN ('jenis', 'golongan')),
    nama TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tipe, nama)
);

ALTER TABLE kategori_obat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON kategori_obat;
CREATE POLICY "Allow authenticated users full access" ON kategori_obat
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Isi default (nilai yang sebelumnya hardcode di dropdown) supaya
-- tidak kosong saat pertama kali dipakai. Aman dijalankan ulang.
INSERT INTO kategori_obat (tipe, nama) VALUES
    ('jenis', 'Generik'), ('jenis', 'Patented'), ('jenis', 'Herbal'), ('jenis', 'Alat Kesehatan'),
    ('golongan', 'Bebas'), ('golongan', 'Terbatas'), ('golongan', 'Keras'), ('golongan', 'Narkotika'), ('golongan', 'Prekursor')
ON CONFLICT (tipe, nama) DO NOTHING;

-- ============================================================
-- SELESAI (Kategori Obat)
-- ============================================================

-- ------------------------------------------------------------
-- 6) STOK MAKSIMAL di Master Obat
-- ------------------------------------------------------------
ALTER TABLE obat ADD COLUMN IF NOT EXISTS stok_maksimal INTEGER;

-- ============================================================
-- SELESAI (Stok Maksimal)
-- ============================================================
