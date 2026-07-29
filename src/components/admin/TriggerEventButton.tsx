"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TriggerEventButton({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/events/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: templateId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to trigger event");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={trigger} className="btn-primary" disabled={loading}>
        {loading ? "Firing..." : templateId ? "Fire this event" : "Fire random event"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
