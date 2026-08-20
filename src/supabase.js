// src/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://plkdxqwmltoxifzsvkho.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsa2R4cXdtbHRveGlmenN2a2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDY4NjAsImV4cCI6MjEwMjc4Mjg2MH0.gYbKMv9c5VvY0wzBxlaobh6xkJ7QIhxQ5SWBHsk3NJc';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsa2R4cXdtbHRveGlmenN2a2hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzIwNjg2MCwiZXhwIjoyMTAyNzgyODYwfQ.dDj_uE_1vdHQkw4cV5khnGWOhOeSbOHGJruM1SW2soY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
// ADMIN FUNCTIONS - Menggunakan Service Role Key
// ============================================================
export async function adminCreateUser(email, password, userMetadata) {
    try {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: userMetadata || {}
        });
        
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error adminCreateUser:', e);
        return { data: null, error: e };
    }
}

export async function adminDeleteUser(userId) {
    try {
        const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return { data, error: null };
    } catch(e) {
        console.error('Error adminDeleteUser:', e);
        return { data: null, error: e };
    }
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