"use client";

import { useEffect, useState } from "react";

interface FeedEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  created_at: string;
}

const EVENT_ICON: Record<string, string> = {
  price_shock: "\u{1F4C8}",
  sector_move: "\u{1F30A}",
  scandal_delist: "\u{1F6A8}",
  relist: "✅",
  cash_bonus: "\u{1F4B0}",
  cash_tax: "\u{1F4B8}",
};

export function NewsTicker({ initialEvents }: { initialEvents: FeedEvent[] }) {
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/events/recent");
        if (!res.ok) return;
        const data = await res.json();
        setEvents(data.events ?? []);
      } catch {
        // Silently ignore -- the next poll will retry.
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  if (events.length === 0) {
    return (
      <div className="card mb-4 text-sm text-gray-500">
        No market news yet. Check back after the first event fires.
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Market News
      </h2>
      <ul className="max-h-56 space-y-2 overflow-y-auto">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-sm">
            <span aria-hidden>{EVENT_ICON[e.event_type] ?? "\u{1F514}"}</span>
            <div>
              <p className="font-medium text-gray-800">{e.title}</p>
              <p className="text-gray-500">{e.description}</p>
              <p className="text-xs text-gray-400">{new Date(e.created_at).toLocaleString()}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
