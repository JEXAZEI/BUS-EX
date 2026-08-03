import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { listStudents } from "@/lib/services/students";

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  await requireAdmin();
  const students = await listStudents();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Students</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          View any student&apos;s portfolio and trade history. Read-only -- for password resets or
          deactivating/deleting an account, use Users.
        </p>
      </div>

      <div className="card overflow-hidden !p-0">
        {students.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">No students yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="px-4 py-2.5 font-semibold">Student</th>
                <th className="px-4 py-2.5 text-right font-semibold">Cash</th>
                <th className="px-4 py-2.5 text-right font-semibold">Net worth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {students.map((s) => (
                <tr key={s.id} className="group">
                  <td className="p-0">
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="flex items-center gap-2 px-4 py-3 group-hover:bg-gray-50 dark:group-hover:bg-white/5"
                    >
                      @{s.username}
                      {!s.isActive && <span className="badge-muted">Inactive</span>}
                    </Link>
                  </td>
                  <td className="p-0 text-right">
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="mono-nums block px-4 py-3 group-hover:bg-gray-50 dark:group-hover:bg-white/5"
                    >
                      ${s.cashBalance.toFixed(2)}
                    </Link>
                  </td>
                  <td className="p-0 text-right">
                    <Link
                      href={`/admin/students/${s.id}`}
                      className="mono-nums block px-4 py-3 font-semibold group-hover:bg-gray-50 dark:group-hover:bg-white/5"
                    >
                      ${s.netWorth.toFixed(2)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
