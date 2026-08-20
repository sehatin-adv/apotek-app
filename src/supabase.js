// src/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://plkdxqwmltoxifzsvkho.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsa2R4cXdtbHRveGlmenN2a2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDY4NjAsImV4cCI6MjEwMjc4Mjg2MH0.gYbKMv9c5VvY0wzBxlaobh6xkJ7QIhxQ5SWBHsk3NJc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    localStorage.removeItem('supabaseSession');
    return { error };
}

// ============================================================
// REQUIRED AUTH - Perbaikan agar tidak redirect loop
// ============================================================
export async function requireAuth() {
    // Cek session dari localStorage dulu
    const savedSession = localStorage.getItem('supabaseSession');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            // Cek apakah session masih valid
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session) {
                return data.session;
            }
        } catch(e) {
            console.log('Session invalid, checking...');
        }
    }
    
    // Coba ambil session dari Supabase
    const session = await getSession();
    if (session) {
        localStorage.setItem('supabaseSession', JSON.stringify(session));
        return session;
    }
    
    // Jika tidak ada session, redirect ke login
    console.log('No session found, redirecting to login');
    window.location.href = '/';
    return null;
}

// ============================================================
// CHECK AUTH UNTUK SETIAP HALAMAN
// ============================================================
export async function checkAuth() {
    const session = localStorage.getItem('supabaseSession');
    if (!session) {
        // Coba ambil dari Supabase
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