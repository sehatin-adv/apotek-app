import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

function copyFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            copyFiles(fullPath);
        } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) {
            const relativePath = path.relative(srcDir, fullPath);
            const destPath = path.join(distDir, relativePath);
            const destDirPath = path.dirname(destPath);
            if (!fs.existsSync(destDirPath)) fs.mkdirSync(destDirPath, { recursive: true });
            fs.copyFileSync(fullPath, destPath);
        }
    });
}

copyFiles(srcDir);

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, distDir, { recursive: true });
}

console.log('✅ Build selesai!');