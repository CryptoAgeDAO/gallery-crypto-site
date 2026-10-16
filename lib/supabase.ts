import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!configured) return null;
  if (!client) client = createClient(url as string, key as string);
  return client;
}

export function photoUrl(path: string): string {
  if (!url) return '';
  if (path.startsWith('http')) return path;
  return `${url}/storage/v1/object/public/photos/${path}`;
}

export function audioUrl(path: string): string {
  if (!url || !path) return '';
  return `${url}/storage/v1/object/public/audio/${path}`;
}
