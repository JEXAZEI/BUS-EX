import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db/client";
import { users as usersTable } from "@/lib/db/schema";
import { toProfile } from "@/lib/db/mappers";
import { UserRow } from "@/components/admin/UserRow";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const viewer = await requireAdmin();
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(asc(usersTable.role), asc(usersTable.username));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-gray-500">
          {viewer.role === "owner"
            ? "Reset passwords, deactivate and delete accounts."
            : "Reset student passwords. Deactivating and deleting accounts is owner-only."}
        </p>
      </div>

      <div className="space-y-2">
        {rows.map(toProfile).map((u) => (
          <UserRow key={u.id} user={u} viewerRole={viewer.role} />
        ))}
      </div>
    </div>
  );
}
