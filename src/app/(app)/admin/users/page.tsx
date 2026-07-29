import { asc } from "drizzle-orm";
import { requireOwner } from "@/lib/session";
import { db } from "@/lib/db/client";
import { users as usersTable } from "@/lib/db/schema";
import { toProfile } from "@/lib/db/mappers";
import { UserRow } from "@/components/admin/UserRow";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireOwner();
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(asc(usersTable.role), asc(usersTable.username));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-gray-500">Owner-only account management.</p>
      </div>

      <div className="space-y-2">
        {rows.map(toProfile).map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </div>
    </div>
  );
}
