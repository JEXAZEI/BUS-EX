import { requireOwner } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { UserRow } from "@/components/admin/UserRow";
import type { Profile } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("username");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-gray-500">Owner-only account management.</p>
      </div>

      <div className="space-y-2">
        {((users ?? []) as Profile[]).map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </div>
    </div>
  );
}
