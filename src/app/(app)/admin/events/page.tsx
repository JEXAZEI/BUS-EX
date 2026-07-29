import { asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db/client";
import { eventTemplates, events as eventsTable } from "@/lib/db/schema";
import { toEventTemplate, toMarketEvent } from "@/lib/db/mappers";
import { TriggerEventButton } from "@/components/admin/TriggerEventButton";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  await requireAdmin();

  const [templateRows, eventRows] = await Promise.all([
    db.select().from(eventTemplates).orderBy(asc(eventTemplates.eventType)),
    db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)).limit(50),
  ]);
  const templates = templateRows.map(toEventTemplate);
  const events = eventRows.map(toMarketEvent);

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
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 text-sm last:border-0">
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
          Add more templates directly in the <code>event_templates</code> table (Neon SQL editor)
          to expand the pool -- no code changes needed.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Event log
        </h2>
        <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
          {events.map((e) => (
            <li key={e.id} className="border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
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
