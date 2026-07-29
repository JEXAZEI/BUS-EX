import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Session cookies are httpOnly + secure + sameSite=lax by default via these
// options, so the auth token is never reachable from client-side JS
// (no localStorage tokens anywhere in this app) and is never sent
// cross-site.
const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

/**
 * Server client for use in Server Components, Route Handlers, and Server
 * Actions. Reads/writes the user's session via httpOnly cookies and
 * enforces RLS as the calling user (never bypasses row-level security).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, { ...SESSION_COOKIE_OPTIONS, ...options });
            }
          } catch {
            // Called from a Server Component render; middleware refreshes
            // the session cookie on the next request instead.
          }
        },
      },
    }
  );
}
