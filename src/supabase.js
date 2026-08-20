// src/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://plkdxqwmltoxifzsvkho.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsa2R4cXdtbHRveGlmenN2a2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDY4NjAsImV4cCI6MjEwMjc4Mjg2MH0.gYbKMv9c5VvY0wzBxlaobh6xkJ7QIhxQ5SWBHsk3NJc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================
// AUTHENTICATION
// ============================================================
export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('getCurrentUser error:', error);
        return null;
    }
    return user;
}

export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('getSession error:', error);
        return null;
    }
    return session;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data?.session) {
        localStorage.setItem('supabaseSession', JSON.stringify(data.session));
    }
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
    await supabase.auth.signOut();
    localStorage.removeItem('supabaseSession');
    window.location.href = '/';
}

// ============================================================
// CHECK AUTH - UNTUK SEMUA HALAMAN
// ============================================================
export async function checkAuth() {
    const session = localStorage.getItem('supabaseSession');
    if (!session) {
        window.location.href = '/';
        return false;
    }
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
            localStorage.removeItem('supabaseSession');
            window.location.href = '/';
            return false;
        }
        return true;
    } catch(e) {
        localStorage.removeItem('supabaseSession');
        window.location.href = '/';
        return false;
    }
}

export async function requireAuth() {
    return await checkAuth();
}