-- ============================================================
-- SEHATIN+ MULTI-TENANT MIGRATION
-- ============================================================
-- Jalankan di Supabase SQL Editor SETELAH migration-sehatin.sql.
-- Mengubah Sehatin+ dari 1-apotek-1-database jadi 1-database-banyak-
-- apotek, dengan data tiap apotek terpisah rapi lewat kolom
-- tenant_id + Row Level Security.
--
-- CARA KERJA:
-- 1. Tabel baru "tenants" = daftar apotek yang pakai Sehatin+.
-- 2. Semua tabel data (obat, penjualan, dst) dapat kolom tenant_id.
-- 3. Fungsi get_my_tenant_id() mencari tenant_id milik user yang
--    sedang login (lewat tabel app_users).
-- 4. RLS diubah: sebelumnya "asal sudah login boleh akses semua data",
--    sekarang "hanya boleh akses data tenant sendiri".
-- 5. Trigger BEFORE INSERT otomatis menempelkan tenant_id ke baris
--    baru - jadi kode aplikasi (database.js) TIDAK PERLU diubah utk
--    ini, karena triggernya yang urus di level database.
--
-- PENTING: migrasi ini akan MEMINDAHKAN SELURUH DATA APOTEK ANDA
-- SAAT INI ke satu tenant baru bernama sesuai Identitas Apotek yang
-- sudah Anda isi. Data tidak hilang, cuma ditandai kepemilikannya.
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABEL TENANTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nama TEXT NOT NULL,
    status TEXT DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Suspended', 'Trial')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2) TAMBAH KOLOM tenant_id KE SEMUA TABEL DATA
-- ------------------------------------------------------------
ALTER TABLE obat ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE apoteker ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE penjualan_header ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE penjualan_detail ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE retur_penjualan ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE retur_detail ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE shift_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE stok_opname ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE pembelian_header ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE pembelian_detail ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE pengeluaran ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE supplier_katalog ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE supplier_selections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE kategori_obat ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE pengaturan_apotek ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Catatan: app_modules SENGAJA tidak dapat tenant_id - itu cuma daftar
-- nama modul aplikasi (fitur apa saja yang ada), bukan data milik
-- apotek tertentu, jadi tetap dipakai bersama semua tenant.

-- ------------------------------------------------------------
-- 3) BUAT TENANT UNTUK DATA YANG SUDAH ADA, LALU BACKFILL
-- ------------------------------------------------------------
DO $$
DECLARE
    v_tenant_id UUID;
    v_nama_apotek TEXT;
BEGIN
    -- Ambil nama apotek dari Identitas Apotek yang sudah diisi, kalau ada
    SELECT nama_apotek INTO v_nama_apotek FROM pengaturan_apotek LIMIT 1;
    IF v_nama_apotek IS NULL OR v_nama_apotek = '' THEN
        v_nama_apotek := 'Apotek Pertama';
    END IF;

    -- Kalau belum ada tenant sama sekali, buat satu utk data existing
    IF NOT EXISTS (SELECT 1 FROM tenants LIMIT 1) THEN
        INSERT INTO tenants (nama, status) VALUES (v_nama_apotek, 'Aktif')
        RETURNING id INTO v_tenant_id;
    ELSE
        SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
    END IF;

    UPDATE obat SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE supplier SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE apoteker SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE penjualan_header SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE penjualan_detail SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE retur_penjualan SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE retur_detail SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE kartu_stok SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE shift_history SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE stok_opname SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE pembelian_header SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE pembelian_detail SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE app_users SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE user_permissions SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE audit_log SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE pengeluaran SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE supplier_katalog SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE supplier_selections SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE kategori_obat SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE pengaturan_apotek SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;

    -- PENTING: akun pemilik/superadmin yang login langsung lewat
    -- Supabase Auth (bukan dibuat lewat form Tambah User) sebelumnya
    -- dianggap "di luar sistem hak akses = akses penuh". Di dunia
    -- multi-tenant itu berbahaya (tidak jelas dia punya tenant mana),
    -- jadi sekarang SETIAP login wajib py baris app_users dgn tenant_id.
    -- Baris ini otomatis daftarkan semua akun auth yang belum py baris
    -- app_users ke tenant di atas, sebagai admin.
    INSERT INTO app_users (auth_user_id, username, email, nama, role, status, tenant_id)
    SELECT u.id, u.email, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email), 'admin', 'Aktif', v_tenant_id
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM app_users a WHERE a.auth_user_id = u.id);
END $$;

-- Sekarang semua baris pasti sudah ada tenant_id-nya, wajibkan ke depannya
ALTER TABLE obat ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE supplier ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE apoteker ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE penjualan_header ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE penjualan_detail ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE retur_penjualan ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE retur_detail ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE kartu_stok ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE shift_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE stok_opname ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pembelian_header ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pembelian_detail ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE app_users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pengeluaran ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE supplier_katalog ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE supplier_selections ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE kategori_obat ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pengaturan_apotek ALTER COLUMN tenant_id SET NOT NULL;
-- user_permissions sengaja TIDAK di-NOT NULL-kan di sini (lihat langkah 4)

-- ------------------------------------------------------------
-- 4) BENAHI pengaturan_apotek: dari 1 baris global JADI 1 baris PER TENANT
-- ------------------------------------------------------------
-- Dibungkus DO block + pengecekan supaya AMAN dijalankan berkali-kali -
-- operasi bedah kolom (ganti id dari integer ke UUID) ini DESTRUKTIF
-- kalau diulang tanpa pengecekan (bisa menghapus kolom id yang sudah
-- benar dari hasil migrasi sebelumnya). Cuma jalan kalau migrasi ini
-- BELUM pernah sukses sebelumnya (dideteksi lewat constraint
-- pengaturan_apotek_tenant_unique yang belum ada).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pengaturan_apotek_tenant_unique'
    ) THEN
        ALTER TABLE pengaturan_apotek DROP CONSTRAINT IF EXISTS single_row;
        ALTER TABLE pengaturan_apotek ALTER COLUMN id DROP DEFAULT;
        ALTER TABLE pengaturan_apotek ADD COLUMN IF NOT EXISTS id_new UUID DEFAULT uuid_generate_v4();
        UPDATE pengaturan_apotek SET id_new = uuid_generate_v4() WHERE id_new IS NULL;
        ALTER TABLE pengaturan_apotek DROP CONSTRAINT IF EXISTS pengaturan_apotek_pkey;
        ALTER TABLE pengaturan_apotek DROP COLUMN IF EXISTS id;
        ALTER TABLE pengaturan_apotek RENAME COLUMN id_new TO id;
        ALTER TABLE pengaturan_apotek ADD PRIMARY KEY (id);
        ALTER TABLE pengaturan_apotek ADD CONSTRAINT pengaturan_apotek_tenant_unique UNIQUE (tenant_id);
    END IF;
END $$;

-- kategori_obat: uniqueness sekarang per-tenant, bukan global (juga
-- dibungkus pengecekan biar aman diulang)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kategori_obat_tenant_tipe_nama_key'
    ) THEN
        ALTER TABLE kategori_obat DROP CONSTRAINT IF EXISTS kategori_obat_tipe_nama_key;
        ALTER TABLE kategori_obat ADD CONSTRAINT kategori_obat_tenant_tipe_nama_key UNIQUE (tenant_id, tipe, nama);
    END IF;
END $$;

-- ------------------------------------------------------------
-- 5) FUNGSI: cari tenant_id milik user yang sedang login
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT tenant_id FROM app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 6) TRIGGER: otomatis tempelkan tenant_id ke baris baru
-- ------------------------------------------------------------
-- Dengan ini, kode aplikasi (database.js) TIDAK PERLU mengirim
-- tenant_id secara eksplisit saat insert - database yang isi
-- otomatis sesuai tenant milik user yang login. Kalau kode SUDAH
-- mengirim tenant_id sendiri (mis. saat provisioning tenant baru),
-- nilai itu tetap dipakai (trigger cuma isi kalau kosong).
CREATE OR REPLACE FUNCTION set_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := get_my_tenant_id();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_obat ON obat;
CREATE TRIGGER trg_tenant_obat BEFORE INSERT ON obat FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_supplier ON supplier;
CREATE TRIGGER trg_tenant_supplier BEFORE INSERT ON supplier FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_apoteker ON apoteker;
CREATE TRIGGER trg_tenant_apoteker BEFORE INSERT ON apoteker FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_penjualan_header ON penjualan_header;
CREATE TRIGGER trg_tenant_penjualan_header BEFORE INSERT ON penjualan_header FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_penjualan_detail ON penjualan_detail;
CREATE TRIGGER trg_tenant_penjualan_detail BEFORE INSERT ON penjualan_detail FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_retur_penjualan ON retur_penjualan;
CREATE TRIGGER trg_tenant_retur_penjualan BEFORE INSERT ON retur_penjualan FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_retur_detail ON retur_detail;
CREATE TRIGGER trg_tenant_retur_detail BEFORE INSERT ON retur_detail FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_kartu_stok ON kartu_stok;
CREATE TRIGGER trg_tenant_kartu_stok BEFORE INSERT ON kartu_stok FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_shift_history ON shift_history;
CREATE TRIGGER trg_tenant_shift_history BEFORE INSERT ON shift_history FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_stok_opname ON stok_opname;
CREATE TRIGGER trg_tenant_stok_opname BEFORE INSERT ON stok_opname FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_pembelian_header ON pembelian_header;
CREATE TRIGGER trg_tenant_pembelian_header BEFORE INSERT ON pembelian_header FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_pembelian_detail ON pembelian_detail;
CREATE TRIGGER trg_tenant_pembelian_detail BEFORE INSERT ON pembelian_detail FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_app_users ON app_users;
CREATE TRIGGER trg_tenant_app_users BEFORE INSERT ON app_users FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_user_permissions ON user_permissions;
CREATE TRIGGER trg_tenant_user_permissions BEFORE INSERT ON user_permissions FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_audit_log ON audit_log;
CREATE TRIGGER trg_tenant_audit_log BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_pengeluaran ON pengeluaran;
CREATE TRIGGER trg_tenant_pengeluaran BEFORE INSERT ON pengeluaran FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_supplier_katalog ON supplier_katalog;
CREATE TRIGGER trg_tenant_supplier_katalog BEFORE INSERT ON supplier_katalog FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_supplier_selections ON supplier_selections;
CREATE TRIGGER trg_tenant_supplier_selections BEFORE INSERT ON supplier_selections FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_kategori_obat ON kategori_obat;
CREATE TRIGGER trg_tenant_kategori_obat BEFORE INSERT ON kategori_obat FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_pengaturan_apotek ON pengaturan_apotek;
CREATE TRIGGER trg_tenant_pengaturan_apotek BEFORE INSERT ON pengaturan_apotek FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

-- ------------------------------------------------------------
-- 7) RLS: ganti "asal login boleh akses semua" jadi "cuma boleh akses
--    data tenant sendiri"
-- ------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
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
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated users full access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated read %s" ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation" ON %I', t);
        EXECUTE format(
            'CREATE POLICY "Tenant isolation" ON %I FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id())',
            t
        );
    END LOOP;
END $$;

-- Tabel "tenants" sendiri: user cuma boleh baca baris tenant-nya sendiri
-- (tidak ada CREATE/UPDATE/DELETE dari sisi client biasa - itu lewat
-- proses provisioning terpisah yang pakai service role key)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own tenant" ON tenants;
CREATE POLICY "Users can read own tenant" ON tenants
    FOR SELECT USING (id = get_my_tenant_id());

-- app_modules TETAP shared/global - semua tenant boleh baca (bukan data
-- milik tenant tertentu), policy lama (authenticated) masih berlaku,
-- sengaja tidak diubah di sini.

-- ------------------------------------------------------------
-- 8) TENANT PROVISIONING - alat kelola tenant (Anda sebagai pemilik
--    platform, BUKAN admin apotek biasa)
-- ------------------------------------------------------------
-- get_my_tenant_id() ditingkatkan: kalau status tenant "Suspended"
-- (mis. pelanggan belum bayar), fungsi ini otomatis balikin NULL -
-- yang berarti RLS menolak semua akses data tenant itu, TANPA perlu
-- hapus/ubah data apapun. Tinggal ubah status via halaman
-- platform-tenants.html utk bekukan/aktifkan akses pelanggan.
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT au.tenant_id
    FROM app_users au
    JOIN tenants t ON t.id = au.tenant_id
    WHERE au.auth_user_id = auth.uid()
    AND t.status IN ('Aktif', 'Trial')
    LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 9) MASA BERLANGGANAN TENANT + NOTIFIKASI PERPANJANGAN + QRIS
-- ------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Pengaturan platform (key-value sederhana) - dipakai buat simpan URL
-- gambar QRIS statis yang ditampilkan di notifikasi perpanjangan semua
-- tenant. Bukan data milik tenant tertentu, jadi tidak perlu tenant_id.
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- Semua orang yang login boleh BACA (buat nampilin QRIS di notifikasi),
-- tapi TIDAK ada policy INSERT/UPDATE/DELETE - itu cuma lewat endpoint
-- server yang dijaga PLATFORM_ADMIN_SECRET.
DROP POLICY IF EXISTS "Anyone authenticated can read platform settings" ON platform_settings;
CREATE POLICY "Anyone authenticated can read platform settings" ON platform_settings
    FOR SELECT USING (auth.role() = 'authenticated');

-- get_my_tenant_id() dipisah jadi 2 versi:
-- - get_my_tenant_id_raw(): SELALU balikin tenant_id user yg login,
--   TIDAK PEDULI status/masa berlangganan. Dipakai HANYA supaya user
--   yang tenant-nya sudah dibekukan/expired tetap bisa lihat info
--   tenant-nya sendiri (nama apotek, tanggal jatuh tempo) buat
--   ditampilkan di notifikasi "perpanjang langganan" - kalau tidak,
--   begitu expired dia juga tidak akan bisa lihat KENAPA dia
--   terkunci.
-- - get_my_tenant_id(): versi ketat (dipakai semua tabel data bisnis)
--   yang balikin NULL kalau statusnya Suspended ATAU masa
--   berlangganan sudah lewat - inilah yang benar2 mengunci akses data.
CREATE OR REPLACE FUNCTION get_my_tenant_id_raw()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT tenant_id FROM app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT au.tenant_id
    FROM app_users au
    JOIN tenants t ON t.id = au.tenant_id
    WHERE au.auth_user_id = auth.uid()
    AND t.status IN ('Aktif', 'Trial')
    AND (t.subscription_expires_at IS NULL OR t.subscription_expires_at > NOW())
    LIMIT 1;
$$;

-- (Fungsi get_my_tenant_info() didefinisikan di bagian bawah file ini,
-- di seksi "Paket Langganan Basic/Pro" - sudah termasuk kolom "plan".
-- Definisi versi lama yang sempat ada di sini sudah dihapus supaya
-- tidak ada 2 definisi berbeda yang bentrok saat migration dijalankan
-- ulang.)

-- Ganti policy tenants: pakai versi RAW (bukan yg ketat) supaya baris
-- tenant sendiri tetap kebaca walau sedang terkunci/expired.
DROP POLICY IF EXISTS "Users can read own tenant" ON tenants;
CREATE POLICY "Users can read own tenant" ON tenants
    FOR SELECT USING (id = get_my_tenant_id_raw());

-- ------------------------------------------------------------
-- 10) HAPUS TENANT (cascade rapi, lewat 1 fungsi biar aman & konsisten)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_tenant_cascade(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM penjualan_detail WHERE tenant_id = p_tenant_id;
    DELETE FROM retur_detail WHERE tenant_id = p_tenant_id;
    DELETE FROM pembelian_detail WHERE tenant_id = p_tenant_id;
    DELETE FROM kartu_stok WHERE tenant_id = p_tenant_id;
    DELETE FROM stok_opname WHERE tenant_id = p_tenant_id;
    DELETE FROM shift_history WHERE tenant_id = p_tenant_id;
    DELETE FROM penjualan_header WHERE tenant_id = p_tenant_id;
    DELETE FROM retur_penjualan WHERE tenant_id = p_tenant_id;
    DELETE FROM pembelian_header WHERE tenant_id = p_tenant_id;
    DELETE FROM supplier_selections WHERE tenant_id = p_tenant_id;
    DELETE FROM supplier_katalog WHERE tenant_id = p_tenant_id;
    DELETE FROM pengeluaran WHERE tenant_id = p_tenant_id;
    DELETE FROM kategori_obat WHERE tenant_id = p_tenant_id;
    DELETE FROM audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM user_permissions WHERE tenant_id = p_tenant_id;
    DELETE FROM pengaturan_apotek WHERE tenant_id = p_tenant_id;
    DELETE FROM obat WHERE tenant_id = p_tenant_id;
    DELETE FROM supplier WHERE tenant_id = p_tenant_id;
    DELETE FROM apoteker WHERE tenant_id = p_tenant_id;
    DELETE FROM app_users WHERE tenant_id = p_tenant_id;
    DELETE FROM tenants WHERE id = p_tenant_id;
END;
$$;

-- ============================================================
-- SELESAI (Tenant Provisioning)
-- ============================================================

-- ------------------------------------------------------------
-- 11) PERBAIKAN: kode_obat, kode_supplier, no_faktur harus UNIK PER
--     TENANT, bukan unik global. Sebelumnya kolom-kolom ini didesain
--     waktu Sehatin+ masih 1-apotek-1-database, jadi unik secara
--     GLOBAL di seluruh tabel. Begitu jadi multi-tenant, ini jadi
--     bug: tenant BARU tidak bisa pakai kode "OBT001" dst kalau kode
--     itu KEBETULAN sudah dipakai tenant LAIN manapun, padahal
--     harusnya boleh sama karena beda apotek/beda tenant.
-- ------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obat_kode_obat_key') THEN
        ALTER TABLE obat DROP CONSTRAINT obat_kode_obat_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obat_tenant_kode_obat_key') THEN
        ALTER TABLE obat ADD CONSTRAINT obat_tenant_kode_obat_key UNIQUE (tenant_id, kode_obat);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_kode_supplier_key') THEN
        ALTER TABLE supplier DROP CONSTRAINT supplier_kode_supplier_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_tenant_kode_supplier_key') THEN
        ALTER TABLE supplier ADD CONSTRAINT supplier_tenant_kode_supplier_key UNIQUE (tenant_id, kode_supplier);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'penjualan_header_no_faktur_key') THEN
        ALTER TABLE penjualan_header DROP CONSTRAINT penjualan_header_no_faktur_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'penjualan_header_tenant_no_faktur_key') THEN
        ALTER TABLE penjualan_header ADD CONSTRAINT penjualan_header_tenant_no_faktur_key UNIQUE (tenant_id, no_faktur);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pembelian_header_no_faktur_key') THEN
        ALTER TABLE pembelian_header DROP CONSTRAINT pembelian_header_no_faktur_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pembelian_header_tenant_no_faktur_key') THEN
        ALTER TABLE pembelian_header ADD CONSTRAINT pembelian_header_tenant_no_faktur_key UNIQUE (tenant_id, no_faktur);
    END IF;
END $$;

-- ============================================================
-- SELESAI (Perbaikan Unique Constraint Per-Tenant)
-- ============================================================

-- ------------------------------------------------------------
-- 12) KOLOM petugas DI retur_penjualan (siapa yang memproses retur -
--     dipakai utk sistem shift per-user)
-- ------------------------------------------------------------
ALTER TABLE retur_penjualan ADD COLUMN IF NOT EXISTS petugas TEXT;

-- ============================================================
-- SELESAI (Kolom Petugas Retur)
-- ============================================================

-- ------------------------------------------------------------
-- 13) INTEGRASI IPAYMU - tabel pelacakan pembayaran perpanjangan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reference_id TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    days_to_extend INTEGER DEFAULT 30,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'expired')),
    ipaymu_trx_id TEXT,
    qr_data TEXT,
    raw_webhook_payload TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_tenant ON subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_reference ON subscription_payments(reference_id);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own tenant payments" ON subscription_payments;
CREATE POLICY "Users can read own tenant payments" ON subscription_payments
    FOR SELECT USING (tenant_id = get_my_tenant_id_raw());
-- Tidak ada policy INSERT/UPDATE/DELETE dari client - semua penulisan
-- ke tabel ini lewat functions/api/ipaymu-*.js pakai service role.

-- ============================================================
-- SELESAI (Integrasi iPaymu)
-- ============================================================

-- ------------------------------------------------------------
-- 14) PERBAIKAN: app_users & user_permissions HARUS tetap bisa dibaca
--     PEMILIKNYA SENDIRI walau tenant-nya lagi Suspended/expired.
-- ------------------------------------------------------------
-- Sebelumnya app_users & user_permissions ikut policy "Tenant isolation"
-- yg pakai get_my_tenant_id() (versi ketat, ngecek subscription_expires_at
-- & status). Efeknya: begitu tenant expired, user bahkan tidak bisa baca
-- app_users MILIK SENDIRI - permissions.js jadi salah kesimpulan "akun
-- tidak terhubung tenant" (padahal terhubung, cuma lagi terkunci), dan
-- fitur "lihat kenapa saya terkunci & cara perpanjang" ikut rusak.
--
-- Perbaikannya: app_users & user_permissions pakai get_my_tenant_id_raw()
-- (versi yg TIDAK cek subscription/status) - supaya user tetap bisa lihat
-- info akun & role-nya sendiri kapan pun, walau tenant-nya terkunci.
-- Data BISNIS (obat, penjualan, dst) TETAP terkunci normal seperti biasa
-- lewat get_my_tenant_id() versi ketat di tabel-tabel lain - ini HANYA
-- utk 2 tabel identitas/akses ini.
DROP POLICY IF EXISTS "Tenant isolation" ON app_users;
CREATE POLICY "Tenant isolation" ON app_users
    FOR ALL USING (tenant_id = get_my_tenant_id_raw()) WITH CHECK (tenant_id = get_my_tenant_id_raw());

DROP POLICY IF EXISTS "Tenant isolation" ON user_permissions;
CREATE POLICY "Tenant isolation" ON user_permissions
    FOR ALL USING (tenant_id = get_my_tenant_id_raw()) WITH CHECK (tenant_id = get_my_tenant_id_raw());

-- ============================================================
-- SELESAI (Perbaikan Akses app_users saat Tenant Terkunci)
-- ============================================================

-- ------------------------------------------------------------
-- 15) MODUL PEMBELIAN SUPLIER - Retur Pembelian (retur ke PBF/supplier,
--     arah kebalikan dari Retur Penjualan - stok BERKURANG karena
--     barang dikembalikan ke supplier, bukan bertambah)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retur_pembelian (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    no_retur TEXT NOT NULL,
    no_faktur_asal TEXT NOT NULL,
    tanggal_retur DATE NOT NULL,
    jam_retur TIME NOT NULL,
    supplier_id UUID REFERENCES supplier(id),
    supplier_nama TEXT,
    alasan TEXT,
    petugas TEXT,
    total_retur INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retur_pembelian_detail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    retur_pembelian_id UUID REFERENCES retur_pembelian(id) ON DELETE CASCADE,
    obat_id UUID REFERENCES obat(id),
    kode_obat TEXT,
    nama_obat TEXT,
    satuan TEXT,
    harga_beli INTEGER NOT NULL,
    jumlah_retur INTEGER NOT NULL,
    subtotal_retur INTEGER NOT NULL
);

ALTER TABLE retur_pembelian ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE retur_pembelian_detail ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Backfill utk instalasi yang sudah berjalan (baris lama, kalau ada,
-- ditandai milik tenant yang sama seperti tabel2 lain saat migrasi awal)
DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
        UPDATE retur_pembelian SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
        UPDATE retur_pembelian_detail SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    END IF;
END $$;

ALTER TABLE retur_pembelian ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE retur_pembelian_detail ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retur_pembelian_tenant_no_retur_key') THEN
        ALTER TABLE retur_pembelian ADD CONSTRAINT retur_pembelian_tenant_no_retur_key UNIQUE (tenant_id, no_retur);
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_tenant_retur_pembelian ON retur_pembelian;
CREATE TRIGGER trg_tenant_retur_pembelian BEFORE INSERT ON retur_pembelian FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_retur_pembelian_detail ON retur_pembelian_detail;
CREATE TRIGGER trg_tenant_retur_pembelian_detail BEFORE INSERT ON retur_pembelian_detail FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

DO $$
DECLARE
    t TEXT;
    pol RECORD;
    tbls TEXT[] := ARRAY['retur_pembelian', 'retur_pembelian_detail'];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
        END LOOP;
        EXECUTE format(
            'CREATE POLICY "Tenant isolation" ON %I FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id())',
            t
        );
    END LOOP;
END $$;

-- ============================================================
-- SELESAI (Retur Pembelian)
-- ============================================================

-- ------------------------------------------------------------
-- 16) PEMBELIAN KREDIT - TOP (Term of Payment), jatuh tempo,
--     pembayaran bertahap (cicilan)
-- ------------------------------------------------------------
ALTER TABLE pembelian_header ADD COLUMN IF NOT EXISTS top_hari INTEGER;
ALTER TABLE pembelian_header ADD COLUMN IF NOT EXISTS tanggal_jatuh_tempo DATE;
ALTER TABLE pembelian_header ADD COLUMN IF NOT EXISTS total_dibayar INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS pembelian_pembayaran (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pembelian_id UUID REFERENCES pembelian_header(id) ON DELETE CASCADE,
    tanggal_bayar DATE NOT NULL,
    jumlah_bayar INTEGER NOT NULL,
    keterangan TEXT,
    petugas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pembelian_pembayaran ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
    IF v_tenant_id IS NOT NULL THEN
        UPDATE pembelian_pembayaran SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    END IF;
END $$;

ALTER TABLE pembelian_pembayaran ALTER COLUMN tenant_id SET NOT NULL;

DROP TRIGGER IF EXISTS trg_tenant_pembelian_pembayaran ON pembelian_pembayaran;
CREATE TRIGGER trg_tenant_pembelian_pembayaran BEFORE INSERT ON pembelian_pembayaran FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

DO $$
DECLARE
    pol RECORD;
BEGIN
    ALTER TABLE pembelian_pembayaran ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pembelian_pembayaran' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON pembelian_pembayaran', pol.policyname);
    END LOOP;
    CREATE POLICY "Tenant isolation" ON pembelian_pembayaran
        FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
END $$;

-- ============================================================
-- SELESAI (Pembelian Kredit)
-- ============================================================

-- ------------------------------------------------------------
-- 17) PAKET LANGGANAN (Basic/Pro) + PELACAKAN PEMAKAIAN SCAN AI
-- ------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'Basic' CHECK (plan IN ('Basic', 'Pro'));

CREATE TABLE IF NOT EXISTS ai_scan_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_scan_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON ai_scan_log;
CREATE POLICY "Tenant isolation" ON ai_scan_log
    FOR ALL USING (tenant_id = get_my_tenant_id()) WITH CHECK (tenant_id = get_my_tenant_id());
DROP TRIGGER IF EXISTS trg_tenant_ai_scan_log ON ai_scan_log;
CREATE TRIGGER trg_tenant_ai_scan_log BEFORE INSERT ON ai_scan_log FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

-- get_my_tenant_info() diperbarui supaya ikut balikin "plan" - dipakai
-- utk kunci fitur Basic/Pro di sisi aplikasi (Forecasting, Laba Rugi,
-- Audit Log, Pembelian Kredit, batas jumlah user, jatah scan AI).
-- WAJIB di-DROP dulu (bukan cuma CREATE OR REPLACE) karena struktur
-- kolom hasilnya berubah (nambah kolom "plan") - Postgres tidak
-- mengizinkan CREATE OR REPLACE mengubah bentuk hasil fungsi.
DROP FUNCTION IF EXISTS get_my_tenant_info();
CREATE OR REPLACE FUNCTION get_my_tenant_info()
RETURNS TABLE(tenant_id UUID, nama TEXT, status TEXT, subscription_expires_at TIMESTAMPTZ, plan TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT t.id, t.nama, t.status, t.subscription_expires_at, t.plan
    FROM app_users au
    JOIN tenants t ON t.id = au.tenant_id
    WHERE au.auth_user_id = auth.uid()
    LIMIT 1;
$$;

-- ============================================================
-- SELESAI (Paket Langganan Basic/Pro)
-- ============================================================

-- ------------------------------------------------------------
-- 18) UPGRADE BASIC -> PRO LEWAT APLIKASI (bayar selisih harga,
--     TANPA mengubah tanggal jatuh tempo yang sudah berjalan)
-- ------------------------------------------------------------
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'renewal' CHECK (payment_type IN ('renewal', 'upgrade'));
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS upgrade_to_plan TEXT;

-- ============================================================
-- SELESAI (Upgrade Basic -> Pro)
-- ============================================================
