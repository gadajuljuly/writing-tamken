import { createClient } from "@supabase/supabase-js";

// Public values (Supabase → Project Settings → API). Set them in .env / GitHub repository variables.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR-PROJECT"));

export const supabase = createClient(SUPABASE_URL || "https://example.invalid", SUPABASE_ANON_KEY || "missing", {
  auth: { persistSession: true, autoRefreshToken: true },
});
