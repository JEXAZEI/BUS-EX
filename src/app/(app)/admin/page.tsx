import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getDefaultStartingCash } from "@/lib/services/admin";
import { getRegimeStatus, type MarketRegime } from "@/lib/services/regime";
import { TriggerEventButton } from "@/components/admin/TriggerEventButton";
import { ResetGameButton } from "@/components/admin/ResetGameButton";
import { StartingCashForm } from "@/components/admin/StartingCashForm";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const REGIME_LABEL: Record<MarketRegime, string> = { bull: "Bull", bear: "Bear", neutral: "Neutral" };
const REGIME_BADGE: Record<MarketRegime, string> = {
  bull: "badge-success",
  bear: "badge-danger",
  neutral: "badge-muted",
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export default async function AdminHomePage() {
  const profile = await requireAdmin();
  const [startingCash, regimeStatus] = await Promise.all([getDefaultStartingCash(), getRegimeStatus()]);
  const now = Date.now();

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div>
        <h1 className="text-xl font-bold tracking-tight">Admin</h1>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Signed in as {profile.role}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link href="/admin/companies" className="card hover:border-brand-300">
          <p className="font-semibold">Companies</p>
          <p className="text-sm text-gray-500">Add, edit, delist/relist parody companies.</p>
        </Link>
        <Link href="/admin/events" className="card hover:border-brand-300">
          <p className="font-semibold">Market events</p>
          <p className="text-sm text-gray-500">Trigger events and view the event log.</p>
        </Link>
        <Link href="/admin/students" className="card hover:border-brand-300">
          <p className="font-semibold">Students</p>
          <p className="text-sm text-gray-500">Look up any student&apos;s portfolio and trades.</p>
        </Link>
        {profile.role === "owner" && (
          <Link href="/admin/users" className="card hover:border-brand-300">
            <p className="font-semibold">Users</p>
            <p className="text-sm text-gray-500">Reset passwords, deactivate/delete accounts.</p>
          </Link>
        )}
      </div>

      <div className="card">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Market cycle
          </h2>
          <span className={REGIME_BADGE[regimeStatus.regime]}>{REGIME_LABEL[regimeStatus.regime]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Started</dt>
            <dd className="mono-nums">{regimeStatus.startedAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Running for</dt>
            <dd className="mono-nums">{formatDuration(now - regimeStatus.startedAt.getTime())}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ends</dt>
            <dd className="mono-nums">{regimeStatus.endsAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ends in</dt>
            <dd className="mono-nums">{formatDuration(regimeStatus.endsAt.getTime() - now)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-400">
          Never shown to students -- real markets don&apos;t announce their own trend.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Quick actions
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <TriggerEventButton />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Game settings
        </h2>
        <StartingCashForm current={startingCash} />
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          New semester
        </h2>
        <p className="mb-2 text-sm text-gray-500">
          Wipes all trades and history and resets student balances/company prices back to their
          configured starting values. Use this at the start of a new class term.
        </p>
        <p className="mb-3 text-sm text-gray-500">
          Reset can&apos;t be undone, so grab a copy of the final standings first if you need one for
          grading.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/admin/export" className="btn-secondary">
            Export results (CSV)
          </a>
          <ResetGameButton />
        </div>
      </div>
    </div>
  );
}
