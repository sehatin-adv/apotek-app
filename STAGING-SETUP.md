# Panduan Setup Lingkungan Staging (Uji Coba)

Tujuan: punya salinan Sehatin+ yang TERPISAH TOTAL dari yang dipakai
pelanggan sungguhan - database sendiri, URL sendiri - supaya fitur
besar seperti Multi-Cabang bisa dites dengan leluasa tanpa risiko.

## Bagian 1 - Buat Project Supabase Baru (staging)

1. Buka https://supabase.com/dashboard
2. Klik **"New Project"**
3. Nama: bebas, sarankan `sehatin-staging` (biar gampang dibedakan
   dari yang produksi)
4. Region: pilih yang SAMA dengan project produksi Anda (biasanya
   Singapore untuk pengguna Indonesia)
5. Catat **Database Password** yang di-generate (kalau perlu nanti)
6. Tunggu sampai project selesai dibuat (1-2 menit)

## Bagian 2 - Jalankan Migration SQL (URUTAN INI PENTING)

Di project Supabase yang BARU (staging), buka **SQL Editor** > **New
query**, lalu jalankan SATU PER SATU, tunggu selesai (tidak ada
error merah) sebelum lanjut ke file berikutnya:

1. `schema.sql` (isi tabel dasar)
2. `migration-sehatin.sql`
3. `migration-fix-rls-leak.sql`
4. `migration-multitenant.sql` (paling panjang, tunggu sampai selesai)

Semua file ini aman dijalankan ulang kalau perlu (tidak akan rusak
kalau dijalankan 2x).

## Bagian 3 - Ambil Kredensial Project Staging

Di project Supabase staging:
1. **Project Settings** (ikon gerigi) > **API**
2. Catat:
   - **Project URL** (bentuknya `https://xxxxx.supabase.co`)
   - **anon public key** (yang panjang, diawali `eyJ...`)
   - **service_role key** (JUGA diawali `eyJ...` - INI RAHASIA, jangan
     sampai bocor ke mana-mana)

## Bagian 4 - Isi wrangler-staging.toml DAN supabase-staging.js

**PENTING - ada 2 tempat kredensial Supabase perlu diisi, bukan cuma 1:**

Buka file `wrangler-staging.toml`, ganti 2 baris ini dengan nilai dari
Bagian 3:
```
SUPABASE_URL = "https://xxxxx.supabase.co"       <- Project URL Anda
SUPABASE_ANON_KEY = "eyJ..."                       <- anon public key Anda
```

**JUGA** buka file `src/supabase-staging.js`, ganti 2 baris serupa di
situ dengan nilai YANG SAMA:
```js
const supabaseUrl = 'https://xxxxx.supabase.co';
const supabaseAnonKey = 'eyJ...';
```

Kenapa harus 2 tempat: `wrangler-staging.toml` itu dipakai FUNGSI DI
SERVER (functions/api/*.js), sedangkan `src/supabase.js` itu dipakai
HALAMAN DI BROWSER (login, dst) - keduanya independen, jadi harus
diisi manual di kedua tempat. Kalau cuma 1 yang diisi, gejalanya
persis seperti yang sempat terjadi: approve tenant berhasil (server
benar), tapi login gagal "Email atau Kata Sandi Salah" (browser
masih nyambung ke project yang salah).

## Bagian 5 - Sebelum Deploy: Tukar 2 File Ini Dulu

```
cp wrangler-staging.toml wrangler.toml
cp src/supabase-staging.js src/supabase.js
```

Baru jalankan deploy seperti biasa:
```
npx wrangler pages project create sehatin-app-staging
node build.js
npx wrangler pages deploy dist --project-name sehatin-app-staging
```

**Setelah selesai deploy ke staging**, kembalikan KEDUANYA ke versi
produksi (supaya tidak salah kirim kredensial staging ke deploy
produksi berikutnya):
```
cp wrangler.toml.production-backup wrangler.toml
git checkout src/supabase.js
```
(atau pulihkan dari salinan cadangan kalau tidak pakai git)

## Bagian 6 - Set Secret untuk Project Staging

Set secret SATU PER SATU (minimal yang penting dulu):

```
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name sehatin-app-staging
```
(masukkan service_role key dari Bagian 3 saat diminta)

```
npx wrangler pages secret put PLATFORM_ADMIN_SECRET --project-name sehatin-app-staging
```
(isi bebas, minimal 20 karakter acak - beda dari punya produksi)

Secret lain (GEMINI_API_KEY, IPAYMU_*, dst) baru perlu di-set kalau
memang mau menguji fitur yang bersangkutan di staging.

## Bagian 7 - Buat Akun Admin Pertama di Staging

Karena ini database KOSONG (baru), Anda perlu daftar tenant/apotek
pertama secara manual - caranya sama seperti dulu pertama kali setup
Sehatin+ produksi (lewat `/daftar.html` di URL staging, lalu approve
manual lewat Kelola Tenant kalau perlu, ATAU langsung lewat SQL
kalau mau lebih cepat - tanya saya kalau butuh bantuan langkah ini).

---

## Setelah semua ini siap

Kabari saya - saya akan mulai kerjakan Tahap 1 Multi-Cabang di
lingkungan staging ini dulu, baru dipindah ke produksi kalau sudah
benar-benar teruji.
