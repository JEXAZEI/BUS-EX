"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Lets someone fix their own display name. Starts read-only with an "Edit"
 * button rather than as a live input, so the common case (looking at your own
 * profile) can't turn into an accidental edit, and so the field doesn't read
 * as something you're expected to fill in.
 */
export function EditNameForm({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function cancel() {
    setFullName(currentName);
    setEditing(false);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const trimmed = fullName.trim();
    if (trimmed === currentName) {
      setEditing(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update your name");
        return;
      }
      setMessage("Name updated.");
      setEditing(false);
      // Refresh so the page heading, the navbar and the leaderboard all pick
      // up the new name instead of showing the old one until a hard reload.
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{currentName}</p>
          <p className="text-xs text-gray-400">
            This is the name shown on the leaderboard and to your teacher.
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="btn-secondary">
          Edit
        </button>
        {message && <p className="text-sm delta-up">{message}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label" htmlFor="fullName">
          Your name
        </label>
        <input
          id="fullName"
          type="text"
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          minLength={2}
          maxLength={80}
          required
          autoFocus
        />
        <p className="mt-1 text-xs text-gray-400">
          Letters, spaces, apostrophes and hyphens. Your teacher can see this.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving..." : "Save name"}
        </button>
        <button type="button" onClick={cancel} className="btn-secondary" disabled={loading}>
          Cancel
        </button>
      </div>
    </form>
  );
}
