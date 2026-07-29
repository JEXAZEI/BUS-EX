import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/session";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  redirect(profile ? "/dashboard" : "/login");
}
