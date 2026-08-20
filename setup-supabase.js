import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
    console.log('==================================================');
    console.log('  APOTEK APP - SUPABASE SETUP');
    console.log('==================================================');
    console.log('');
    console.log('Sebelum melanjutkan, pastikan Anda sudah:');
    console.log('1. Buat project di Supabase (https://supabase.com)');
    console.log('2. Dapatkan URL dan Anon Key');
    console.log('3. Jalankan schema.sql di SQL Editor Supabase');
    console.log('4. Buat user admin di Authentication');
    console.log('');

    const supabaseUrl = await question('Masukkan SUPABASE_URL: ');
    const supabaseAnonKey = await question('Masukkan SUPABASE_ANON_KEY: ');

    // Update wrangler.toml
    let wranglerContent = fs.readFileSync(path.join(__dirname, 'wrangler.toml'), 'utf8');
    wranglerContent = wranglerContent.replace('YOUR_SUPABASE_URL', supabaseUrl);
    wranglerContent = wranglerContent.replace('YOUR_SUPABASE_ANON_KEY', supabaseAnonKey);
    fs.writeFileSync(path.join(__dirname, 'wrangler.toml'), wranglerContent);

    // Update supabase.js
    let supabaseJs = fs.readFileSync(path.join(__dirname, 'src', 'supabase.js'), 'utf8');
    supabaseJs = supabaseJs.replace('YOUR_SUPABASE_URL', supabaseUrl);
    supabaseJs = supabaseJs.replace('YOUR_SUPABASE_ANON_KEY', supabaseAnonKey);
    fs.writeFileSync(path.join(__dirname, 'src', 'supabase.js'), supabaseJs);

    console.log('');
    console.log('✅ Konfigurasi Supabase berhasil!');
    console.log('');
    console.log('📦 Langkah selanjutnya:');
    console.log('  1. npm install');
    console.log('  2. npm run build');
    console.log('  3. npx wrangler pages deploy dist');
    console.log('');
    console.log('🔑 Login Default:');
    console.log('   Email: admin@apotek.com');
    console.log('   Password: admin123');
    console.log('');

    rl.close();
}

setup();