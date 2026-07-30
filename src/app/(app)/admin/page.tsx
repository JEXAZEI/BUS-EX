import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getDefaultStartingCash } from "@/lib/services/admin";
import { TriggerEventButton } from "@/components/admin/TriggerEventButton";
import { ResetGameButton } from "@/components/admin/ResetGameButton";
import { StartingCashForm } from "@/components/admin/StartingCashForm";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const profile = await requireAdmin();
  const startingCash = await getDefaultStartingCash();

  return (
    <div className="space-y-4">
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
        {profile.role === "owner" && (
          <Link href="/admin/users" className="card hover:border-brand-300">
            <p className="font-semibold">Users</p>
            <p className="text-sm text-gray-500">Reset passwords, deactivate/delete accounts.</p>
          </Link>
        )}
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
        <ResetGameButton />
      </div>
    </div>
  );
}
