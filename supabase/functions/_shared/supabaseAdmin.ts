import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

export function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserFromAuthHeader(
  supabaseAdmin: SupabaseClient,
  authHeader: string | null
) {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { user: null, error: new Error("Missing Authorization header.") };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { user: null, error: new Error("Missing bearer token.") };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: error || new Error("Invalid token.") };
  }

  return { user: data.user, error: null };
}

export async function isAdminUser(supabaseAdmin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) return false;
  return data?.role === "admin";
}
