-- ============================================================
-- APOTEK APP - SUPABASE SCHEMA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE obat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_obat TEXT UNIQUE NOT NULL,
    nama_obat TEXT NOT NULL,
    satuan TEXT DEFAULT 'Tablet',
    harga_beli INTEGER DEFAULT 0,
    harga_jual INTEGER DEFAULT 0,
    stok INTEGER DEFAULT 0,
    stok_minimal INTEGER DEFAULT 10,
    jenis TEXT DEFAULT 'Generik',
    golongan TEXT DEFAULT 'Bebas',
    status TEXT DEFAULT 'Aktif',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_supplier TEXT UNIQUE NOT NULL,
    nama_supplier TEXT NOT NULL,
    alamat TEXT,
    kota TEXT,
    telepon TEXT,
    status TEXT DEFAULT 'Aktif',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE apoteker (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nama TEXT NOT NULL,
    no_sik TEXT,
    no_stra TEXT,
    alamat TEXT,
    jabatan TEXT,
    tanggal_mulai DATE,
    nik TEXT,
    id_satu_sehat TEXT,
    status TEXT DEFAULT 'Aktif',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE penjualan_header (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    no_faktur TEXT UNIQUE NOT NULL,
    tanggal DATE NOT NULL,
    jam TIME NOT NULL,
    shift TEXT NOT NULL,
    kasir TEXT NOT NULL,
    pelanggan TEXT DEFAULT 'Umum',
    total INTEGER DEFAULT 0,
    metode_pembayaran TEXT DEFAULT 'Cash',
    nominal_pembayaran INTEGER DEFAULT 0,
    transfer_keterangan TEXT,
    cash INTEGER DEFAULT 0,
    kembalian INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Selesai',
    closed_shift_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE penjualan_detail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    penjualan_id UUID REFERENCES penjualan_header(id) ON DELETE CASCADE,
    obat_id UUID REFERENCES obat(id),
    kode_obat TEXT,
    nama_obat TEXT,
    satuan TEXT,
    jumlah INTEGER NOT NULL,
    harga_jual INTEGER NOT NULL,
    subtotal INTEGER NOT NULL
);

CREATE TABLE retur_penjualan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    no_faktur TEXT NOT NULL,
    tanggal_retur DATE NOT NULL,
    jam_retur TIME NOT NULL,
    shift_retur TEXT,
    shift_asal TEXT,
    tanggal_asal DATE,
    jam_asal TIME,
    pelanggan TEXT,
    total_retur INTEGER DEFAULT 0,
    closed_shift_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE retur_detail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    retur_id UUID REFERENCES retur_penjualan(id) ON DELETE CASCADE,
    obat_id UUID REFERENCES obat(id),
    kode_obat TEXT,
    nama_obat TEXT,
    satuan TEXT,
    harga_jual INTEGER NOT NULL,
    jumlah_retur INTEGER NOT NULL,
    subtotal_retur INTEGER NOT NULL
);

CREATE TABLE kartu_stok (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    obat_id UUID REFERENCES obat(id),
    kode_obat TEXT,
    nama_obat TEXT,
    tanggal DATE NOT NULL,
    jam TIME NOT NULL,
    no_bukti TEXT NOT NULL,
    keterangan TEXT,
    masuk INTEGER DEFAULT 0,
    keluar INTEGER DEFAULT 0,
    sisa_stok INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shift_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift TEXT NOT NULL,
    tanggal DATE NOT NULL,
    user TEXT NOT NULL,
    saldo_awal INTEGER DEFAULT 0,
    saldo_akhir INTEGER DEFAULT 0,
    total_penjualan INTEGER DEFAULT 0,
    total_cash INTEGER DEFAULT 0,
    total_transfer INTEGER DEFAULT 0,
    total_retur INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Buka',
    diserahkan_kepada TEXT,
    catatan TEXT,
    waktu_buka TIMESTAMPTZ,
    waktu_tutup TIMESTAMPTZ
);

CREATE TABLE stok_opname (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    obat_id UUID REFERENCES obat(id),
    snapshot_stok INTEGER DEFAULT 0,
    stok_sistem INTEGER DEFAULT 0,
    stok_fisik INTEGER DEFAULT 0,
    selisih INTEGER DEFAULT 0,
    tanggal DATE NOT NULL,
    jam TIME NOT NULL,
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pembelian_header (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    no_faktur TEXT UNIQUE NOT NULL,
    tanggal_faktur DATE,
    supplier_id UUID REFERENCES supplier(id),
    supplier_nama TEXT,
    gudang TEXT DEFAULT 'GUDANG UTAMA',
    jenis TEXT DEFAULT 'TUNAI',
    kas TEXT DEFAULT 'Kas Umum',
    no_faktur_pajak TEXT,
    subtotal INTEGER DEFAULT 0,
    diskon INTEGER DEFAULT 0,
    ppn INTEGER DEFAULT 0,
    ppn_persen INTEGER DEFAULT 11,
    total INTEGER DEFAULT 0,
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pembelian_detail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pembelian_id UUID REFERENCES pembelian_header(id) ON DELETE CASCADE,
    obat_id UUID REFERENCES obat(id),
    kode_obat TEXT,
    nama_obat TEXT,
    satuan TEXT,
    jumlah INTEGER DEFAULT 0,
    harga_beli NUMERIC(15,4) DEFAULT 0,
    subtotal INTEGER DEFAULT 0,
    diskon_persen NUMERIC(6,2) DEFAULT 0,
    diskon_nominal INTEGER DEFAULT 0,
    hpp INTEGER DEFAULT 0,
    margin_persen NUMERIC(6,2) DEFAULT 25,
    harga_jual INTEGER DEFAULT 0,
    diskon_jual_persen INTEGER DEFAULT 0,
    tanggal_exp DATE,
    no_batch TEXT,
    ketentuan_retur TEXT
);

-- SEED DATA
INSERT INTO supplier (id, kode_supplier, nama_supplier, kota) VALUES 
    (uuid_generate_v4(), 'SUP001', 'PT. Kimia Farma', 'Jakarta'),
    (uuid_generate_v4(), 'SUP002', 'PT. Indofarma', 'Bandung'),
    (uuid_generate_v4(), 'SUP003', 'PT. Dexa Medica', 'Jakarta');

INSERT INTO apoteker (id, nama, jabatan) VALUES 
    (uuid_generate_v4(), 'Apt. Ahmad Justawan, S.Farm', 'Apoteker Pengelola');

INSERT INTO obat (id, kode_obat, nama_obat, stok, harga_beli, harga_jual) VALUES 
    (uuid_generate_v4(), 'OBT001', 'Paracetamol 500mg', 100, 5000, 7500),
    (uuid_generate_v4(), 'OBT002', 'Amoxicillin 500mg', 50, 8000, 12000),
    (uuid_generate_v4(), 'OBT003', 'Cetirizine 10mg', 75, 3000, 5000),
    (uuid_generate_v4(), 'OBT004', 'Omeprazole 20mg', 40, 10000, 15000),
    (uuid_generate_v4(), 'OBT005', 'Vitamin C 1000mg', 200, 2000, 3500);

-- RLS
ALTER TABLE obat ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE apoteker ENABLE ROW LEVEL SECURITY;
ALTER TABLE penjualan_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE penjualan_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE retur_penjualan ENABLE ROW LEVEL SECURITY;
ALTER TABLE retur_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE kartu_stok ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_opname ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembelian_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembelian_detail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access" ON obat
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON supplier
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON apoteker
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON penjualan_header
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON penjualan_detail
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON retur_penjualan
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON retur_detail
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON kartu_stok
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON shift_history
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON stok_opname
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON pembelian_header
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users full access" ON pembelian_detail
    FOR ALL USING (auth.role() = 'authenticated');

-- FUNCTIONS
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_obat
BEFORE UPDATE ON obat
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();