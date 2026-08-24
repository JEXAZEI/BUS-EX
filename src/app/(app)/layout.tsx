import { requireProfile } from "@/lib/session";
import { Navbar } from "@/components/Navbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar displayName={profile.full_name} role={profile.role} />
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
