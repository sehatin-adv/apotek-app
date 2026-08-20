// src/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ============================================================
// SUPABASE CONFIG - SUDAH DIUPDATE
// ============================================================

const supabaseUrl = 'https://plkdxqmwltoxfzvxho.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsa2R4cXdtbHRveGlmenN2a2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDY4NjAsImV4cCI6MjEwMjc4Mjg2MH0.gYbKMv9c5VvY0wzBxlaobh6xkJ7QIhxQ5SWBHsk3NJc';

// ============================================================
// CREATE CLIENT
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================
// AUTHENTICATION
// ============================================================
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
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
    return { error };
}

export async function requireAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = '/';
        return null;
    }
    return session;
}