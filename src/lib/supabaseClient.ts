import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Prefer Vite env (VITE_*), then NEXT_PUBLIC_*, then any injected window config
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL
  || (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL
  || (window as any).AGENT_CFG?.SUPABASE_URL
  || 'https://iiolvvdnzrfcffudwocp.supabase.co';

const supabaseAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY
  || (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || (window as any).AGENT_CFG?.SUPABASE_ANON
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2x2dmRuenJmY2ZmdWR3b2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MjE4MDAsImV4cCI6MjA3MzA5NzgwMH0.2-e8Scn26fqsR11h-g4avH8MWybwLTtcf3fCN9qAgVw';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('No session. Please sign in.');
  return token;
}




