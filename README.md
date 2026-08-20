# 🏥 Apotek App

Aplikasi manajemen apotek lengkap dengan database online menggunakan Supabase.

## ✨ Fitur

- ✅ **Login System** - Autentikasi Supabase
- ✅ **Dashboard** - Statistik real-time
- ✅ **Master Data** - Obat, Supplier, Apoteker
- ✅ **Kasir** - Transaksi penjualan dengan cetak struk
- ✅ **Retur Penjualan** - Batas maksimal 3 hari
- ✅ **Stok** - Kartu stok online, opname, stok terkini
- ✅ **Shift** - Buka/tutup shift dengan perhitungan otomatis
- ✅ **Laporan** - Penjualan harian, per obat, laba rugi
- ✅ **Multi-device** - Data sinkron di semua perangkat

## 🚀 Cara Install

### 1. Clone atau Download Project

### 2. Setup Supabase

Buat akun di https://supabase.com dan buat project baru.
Jalankan `schema.sql` di SQL Editor Supabase.

### 3. Konfigurasi

```bash
npm install
npm run supabase:init
```

### 4. Deploy ke Cloudflare

```bash
npm run build
npx wrangler pages deploy dist
```

## 🔑 Login Default

- Email: admin@apotek.com
- Password: admin123

## 📊 Database Schema

Lihat `schema.sql` untuk struktur database lengkap.

## 📱 Teknologi

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Cloudflare Pages
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Charts**: Chart.js