import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely -- this must NEVER be imported
 * from a Client Component, and must NEVER have its result exposed directly
 * to the browser. Only use it inside Route Handlers for the specific,
 * narrow operations that genuinely require elevated privileges:
 *   - looking up a username's real login email (login route)
 *   - checking/recording login attempts for rate limiting
 *   - creating auth users during signup
 *   - owner-only user management (reset password, remove account)
 * Every call site must independently verify the caller is authorized
 * before using this client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
