import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { toProfile } from "@/lib/db/mappers";
import type { Profile } from "@/lib/types";

/** Returns the signed-in user's profile, or null if not authenticated. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  return user ? toProfile(user) : null;
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
