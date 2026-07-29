import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { redirect } from "next/navigation";

/** Returns the signed-in user's profile, or null if not authenticated. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as Profile) ?? null;
}

/** Use at the top of any page that requires a signed-in user. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?disabled=1");
  return profile;
}

/** Use at the top of any page restricted to teacher/owner. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "teacher" && profile.role !== "owner") {
    redirect("/dashboard");
  }
  return profile;
}

/** Use at the top of any page restricted to the owner only. */
export async function requireOwner(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "owner") {
    redirect("/dashboard");
  }
  return profile;
}
