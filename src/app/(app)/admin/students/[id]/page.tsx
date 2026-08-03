import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getStudentDetail } from "@/lib/services/students";

export const dynamic = "force-dynamic";

export default async function AdminStudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const student = await getStudentDetail(id);
  if (!student) notFound();

  const holdingsValue = student.netWorth - student.cashBalance;

  return (
    <div className="space-y-4">
      <Link href="/admin/students" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
        &larr; Back to students
      </Link>

      <div>
        <h1 className="text-xl font-bold tracking-tight">
          @{student.username}
          {!student.isActive && <span className="badge-muted ml-2">Inactive</span>}
        </h1>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Read-only view -- no trades can be placed from here
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cash</p>
          <p className="mono-nums text-lg font-bold tabular-nums">${student.cashBalance.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Holdings</p>
          <p className="mono-nums text-lg font-bold tabular-nums">${holdingsValue.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Net worth</p>
          <p className="mono-nums text-lg font-bold tabular-nums">${student.netWorth.toFixed(2)}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Portfolio
        </h2>
        {student.holdings.length === 0 ? (
          <p className="text-sm text-gray-400">Doesn&apos;t own any shares.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {student.holdings.map((h) => (
              <li key={h.companyId} className="flex items-center justify-between py-2">
                <span>
                  {h.companyName} <span className="font-mono text-xs text-gray-400">{h.ticker}</span>
                </span>
                <div className="text-right">
                  <p className="mono-nums font-mono">{h.shares.toFixed(4)} sh</p>
                  <p className="mono-nums font-mono text-xs text-gray-400">${h.value.toFixed(2)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Trade history
        </h2>
        {student.trades.length === 0 ? (
          <p className="text-sm text-gray-400">No trades yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {student.trades.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-1.5">
                <span>
                  <span className={t.side === "buy" ? "delta-up" : "delta-down"}>
                    {t.side === "buy" ? "Bought" : "Sold"}
                  </span>{" "}
                  {t.shares.toFixed(2)} {t.ticker}
                </span>
                <span className="mono-nums font-mono text-gray-500 dark:text-gray-400">
                  ${t.cashAmount.toFixed(2)}
                </span>
                <span className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
