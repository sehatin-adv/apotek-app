// src/matching.js
// Mesin pencocokan nama obat, di-port dari aplikasi "Analisis Stok &
// Pesanan PBF" (bukan AI - berbasis kemiripan teks token + dosis).
// Skor 0-100: seberapa mirip nama obat di apotek dengan nama versi
// katalog PBF (nama boleh beda format antar PBF).

const STOPWORDS = new Set([
    'tablet', 'tab', 'kaplet', 'kapsul', 'kap', 'strip', 'box', 'dus',
    'botol', 'vial', 'ampul', 'amp', 'sachet', 'sach', 'sirup', 'syrup',
    'cream', 'krim', 'salep', 'gel', 'obat', 'generik', 'kotak', 'pcs',
    'pc', 'buah', 'tube', 'drop', 'drops', 'inj', 'injeksi'
]);

export function normalize(s) {
    return (s || '')
        .toString()
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9.%\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokens(s) {
    return normalize(s).split(' ').filter(t => t && !STOPWORDS.has(t));
}

function extractDosages(s) {
    const m = normalize(s).match(/\d+(\.\d+)?\s?(mg|mcg|ml|g|iu|%)/g);
    return m ? m.map(x => x.replace(/\s+/g, '')) : [];
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp[m][n];
}

function charSim(a, b) {
    if (!a && !b) return 1;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length, 1);
}

// Return 0-100: seberapa mungkin `namaApotek` merujuk ke produk yang
// sama dengan `namaPbf`.
export function matchScore(namaApotek, namaPbf) {
    const tA = tokens(namaApotek), tB = tokens(namaPbf);
    const setA = new Set(tA), setB = new Set(tB);
    let overlap = 0;
    setA.forEach(t => { if (setB.has(t)) overlap++; });
    const union = new Set([...setA, ...setB]).size || 1;
    const jaccard = overlap / union;

    const dA = extractDosages(namaApotek), dB = extractDosages(namaPbf);
    let dosageFactor = 1;
    if (dA.length && dB.length) {
        dosageFactor = dA.some(d => dB.includes(d)) ? 1.25 : 0.35;
    }

    const cSim = charSim(normalize(namaApotek), normalize(namaPbf));
    const score = (jaccard * 0.6 + cSim * 0.4) * dosageFactor;
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
