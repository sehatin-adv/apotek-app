// src/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://plkdxqwmltoxifzsvkho.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsa2R4cXdtbHRveGlmenN2a2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDY4NjAsImV4cCI6MjEwMjc4Mjg2MH0.gYbKMv9c5VvY0wzBxlaobh6xkJ7QIhxQ5SWBHsk3NJc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// CATATAN KEAMANAN: sebelumnya ada "supabaseAdmin" di sini yang dibuat
// pakai service role key - kunci itu bisa melewati SEMUA aturan
// keamanan (RLS), dan karena file ini dikirim ke browser semua orang,
// siapa pun yang buka DevTools/View Source bisa mencurinya dan dapat
// akses penuh ke seluruh database. Sekarang service role key hanya
// hidup di server (functions/api/admin-auth.js), sebagai secret
// environment variable di Cloudflare Pages - TIDAK PERNAH dikirim ke
// browser. Operasi admin (bikin/hapus akun login) sekarang lewat
// fetch() ke endpoint itu, bukan pakai kuncinya langsung.

// ============================================================
// AUTHENTICATION
// ============================================================
export async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch(e) {
        console.error('Error getCurrentUser:', e);
        return null;
    }
}

export async function getSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    } catch(e) {
        console.error('Error getSession:', e);
        return null;
    }
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
}

export async function signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: userData }
    });
    return { data, error };
}

// Kirim email reset password - Supabase otomatis kirim link, kliknya
// mendarat di redirectTo (reset-password.html) yang biar user set
// password baru.
export async function resetPasswordForEmail(email) {
    const redirectTo = `${window.location.origin}/reset-password.html`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { data, error };
}

// Dipanggil dari reset-password.html setelah user klik link email -
// Supabase sudah otomatis login-kan sesi sementara lewat token di URL,
// ini cuma update password akun yang sedang login itu.
export async function updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    return { data, error };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    localStorage.removeItem('supabaseSession');
    return { error };
}

// ============================================================
// ADMIN FUNCTIONS - lewat functions/api/admin-auth.js (server-side),
// BUKAN pakai service role key langsung di browser lagi.
// ============================================================
async function callAdminAuthApi(action, payload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        return { data: null, error: new Error('Sesi login tidak ditemukan.') };
    }
    try {
        const res = await fetch('/api/admin-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ action, ...payload })
        });
        const result = await res.json();
        if (!res.ok) return { data: null, error: new Error(result.error || 'Gagal memproses permintaan.') };
        return { data: result.data ?? result, error: null };
    } catch(e) {
        return { data: null, error: e };
    }
}

export async function adminCreateUser(email, password, userMetadata) {
    const { data, error } = await callAdminAuthApi('create', { email, password, user_metadata: userMetadata || {} });
    if (error) { console.error('Error adminCreateUser:', error); return { data: null, error }; }
    return { data: { user: data }, error: null };
}

export async function adminDeleteUser(userId) {
    const { data, error } = await callAdminAuthApi('delete', { user_id: userId });
    if (error) { console.error('Error adminDeleteUser:', error); return { data: null, error }; }
    return { data, error: null };
}

// Cari akun Supabase Auth berdasarkan email (dipakai saat createUser
// menemukan email yang sudah terdaftar di Auth tapi belum ada baris
// app_users-nya). Dulu ini pakai supabaseAdmin.auth.admin.listUsers()
// langsung di browser (butuh service key) - sekarang lewat endpoint
// server yang sudah diverifikasi hak aksesnya.
export async function findAuthUserByEmail(email) {
    const { data, error } = await callAdminAuthApi('find-by-email', { email });
    if (error) { console.error('Error findAuthUserByEmail:', error); return { data: null, error }; }
    return { data, error: null };
}

export async function requireAuth() {
    const savedSession = localStorage.getItem('supabaseSession');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session) {
                return data.session;
            }
        } catch(e) {
            console.log('Session invalid, checking...');
        }
    }
    
    const session = await getSession();
    if (session) {
        localStorage.setItem('supabaseSession', JSON.stringify(session));
        return session;
    }
    
    console.log('No session found, redirecting to login');
    window.location.href = '/';
    return null;
}

export async function checkAuth() {
    const session = localStorage.getItem('supabaseSession');
    if (!session) {
        const supabaseSession = await getSession();
        if (supabaseSession) {
            localStorage.setItem('supabaseSession', JSON.stringify(supabaseSession));
            return supabaseSession;
        }
        window.location.href = '/';
        return null;
    }
    
    try {
        const sessionData = JSON.parse(session);
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
            localStorage.removeItem('supabaseSession');
            window.location.href = '/';
            return null;
        }
        return data.session;
    } catch(e) {
        localStorage.removeItem('supabaseSession');
        window.location.href = '/';
        return null;
    }
}