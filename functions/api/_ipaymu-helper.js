// functions/api/_ipaymu-helper.js
//
// Helper bersama untuk integrasi iPaymu, dipakai oleh ipaymu-create-payment.js
// dan ipaymu-webhook.js. Implementasi signature ini ikut PERSIS dokumentasi
// resmi iPaymu (iPaymu-signature-documentation-v2.pdf):
//
//   StringToSign = HTTPMETHOD:VA:lowercase(SHA256(RequestBody)):ApiKey
//   Signature    = HMAC-SHA256(StringToSign, ApiKey)  -> hex, lowercase
//
// Header yang wajib dikirim ke API iPaymu:
//   Content-Type: application/json
//   va: <VA iPaymu>
//   signature: <hasil di atas>
//   timestamp: format YYYYMMDDhhmmss
//
// Pakai Web Crypto API (bukan Node "crypto") karena Cloudflare Pages
// Functions jalan di runtime Workers, bukan Node.js.

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return toHex(hashBuffer);
}

export async function hmacSha256Hex(message, secret) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return toHex(sigBuffer);
}

export function ipaymuTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

// method = 'POST' dsb (huruf besar), va = nomor VA, apiKey = API Key,
// bodyObj = object yang akan di-JSON.stringify sebagai body request.
export async function ipaymuHeaders(method, va, apiKey, bodyObj) {
    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = await sha256Hex(bodyJson);
    const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash.toLowerCase()}:${apiKey}`;
    const signature = await hmacSha256Hex(stringToSign, apiKey);
    return {
        headers: {
            'Content-Type': 'application/json',
            'va': va,
            'signature': signature,
            'timestamp': ipaymuTimestamp()
        },
        bodyJson
    };
}

export function ipaymuBaseUrl(mode) {
    return mode === 'production' ? 'https://my.ipaymu.com/api/v2' : 'https://sandbox.ipaymu.com/api/v2';
}
