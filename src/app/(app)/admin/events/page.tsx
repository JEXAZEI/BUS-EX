import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TriggerEventButton } from "@/components/admin/TriggerEventButton";
import type { EventTemplate, MarketEvent } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: templates }, { data: events }] = await Promise.all([
    supabase.from("event_templates").select("*").order("event_type"),
    supabase.from("events").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Market events</h1>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Fire a random event now
        </h2>
        <TriggerEventButton />
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Event templates
        </h2>
        <div className="space-y-2">
          {((templates ?? []) as EventTemplate[]).map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm last:border-0">
              <div>
                <p className="font-medium">{t.title_template}</p>
                <p className="text-xs text-gray-400">
                  {t.event_type} · weight {t.weight} {t.is_active ? "" : "· inactive"}
                </p>
              </div>
              <TriggerEventButton templateId={t.id} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Add more templates directly in the <code>event_templates</code> table in Supabase to
          expand the pool -- no code changes needed.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Event log
        </h2>
        <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
          {((events ?? []) as MarketEvent[]).map((e) => (
            <li key={e.id} className="border-b border-gray-100 pb-2 last:border-0">
              <p className="font-medium">{e.title}</p>
              <p className="text-gray-500">{e.description}</p>
              <p className="text-xs text-gray-400">{new Date(e.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
