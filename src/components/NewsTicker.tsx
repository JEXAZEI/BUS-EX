"use client";

import { useEffect, useState } from "react";

interface FeedEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  price_impact_pct: number | null;
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

type Sentiment = "up" | "down" | "neutral";

const SENTIMENT_CLASSES: Record<Sentiment, string> = {
  up: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  down: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  neutral: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

function eventSentiment(e: FeedEvent): Sentiment {
  if (e.event_type === "price_shock" || e.event_type === "sector_move") {
    if (e.price_impact_pct == null) return "neutral";
    return e.price_impact_pct >= 0 ? "up" : "down";
  }
  if (e.event_type === "cash_bonus" || e.event_type === "relist") return "up";
  if (e.event_type === "cash_tax" || e.event_type === "scandal_delist") return "down";
  return "neutral";
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

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
      <div className="card mb-4 text-sm text-gray-500 dark:text-gray-400">
        No market news yet. Check back after the first event fires.
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Market News
      </h2>
      <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
        {events.map((e) => {
          const sentiment = eventSentiment(e);
          return (
            <li key={e.id} className="flex items-start gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${SENTIMENT_CLASSES[sentiment]}`}
              >
                {EVENT_ICON[e.event_type] ?? "\u{1F514}"}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{e.title}</p>
                <p className="text-gray-600 dark:text-gray-400">{e.description}</p>
                <p
                  className="mt-0.5 text-xs text-gray-400 dark:text-gray-500"
                  title={new Date(e.created_at).toLocaleString()}
                >
                  {formatRelativeTime(e.created_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
