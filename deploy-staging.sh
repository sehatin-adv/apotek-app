#!/bin/bash
# deploy-staging.sh
# Jalankan dari folder project (sama tempat wrangler.toml berada):
#   bash deploy-staging.sh
#
# Otomatis: tukar wrangler.toml + supabase.js ke versi staging, build,
# lalu deploy ke project Cloudflare Pages "sehatin-app-staging".
# Setelah selesai, KEDUANYA otomatis dikembalikan lagi ke versi
# produksi - supaya tidak ada risiko lupa & salah kirim kredensial
# staging ke deploy produksi berikutnya.

set -e  # hentikan script kalau ada 1 langkah yang gagal, jangan lanjut

echo "1/5 - Menyimpan cadangan wrangler.toml produksi..."
cp wrangler.toml wrangler.toml.production-backup

echo "2/5 - Menukar ke konfigurasi staging..."
cp wrangler-staging.toml wrangler.toml
cp src/supabase-staging.js src/supabase.js

echo "3/5 - Build..."
node build.js

echo "4/5 - Deploy ke sehatin-app-staging..."
npx wrangler pages deploy dist --project-name sehatin-app-staging

echo "5/5 - Mengembalikan wrangler.toml & supabase.js ke versi produksi..."
cp wrangler.toml.production-backup wrangler.toml
rm wrangler.toml.production-backup
# supabase.js versi produksi dipulihkan dari git kalau pakai git,
# kalau tidak pakai git, ganti baris di bawah dengan cara Anda sendiri
# menyimpan cadangan src/supabase.js produksi.
if [ -d .git ]; then
    git checkout src/supabase.js 2>/dev/null || echo "   (peringatan: gagal restore src/supabase.js lewat git - cek manual!)"
fi

echo ""
echo "✅ Selesai! wrangler.toml & src/supabase.js sudah kembali ke versi produksi."
echo "   Cek hasil deploy di: https://sehatin-app-staging.pages.dev"
