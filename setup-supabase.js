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
    console.log('✅ Konfigurasi Supabase sudah siap!');
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