import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSessionUser(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}

