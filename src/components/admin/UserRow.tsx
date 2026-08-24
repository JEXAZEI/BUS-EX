"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";

// Words picked to be unambiguous when read aloud across a classroom -- no
// homophones, no letters that sound alike, nothing that needs spelling out.
// A teacher resetting a password has to say the result to the student, which
// is exactly why the obvious choices ("student123") are the ones the
// denylist in validation.ts blocks; this gives them a safe alternative
// instead of a guessing game.
const SUGGEST_ADJECTIVES = [
  "Blue", "Swift", "Bright", "Quiet", "Brave", "Golden", "Silver", "Rapid",
  "Clever", "Sunny", "Mighty", "Nimble",
];
const SUGGEST_NOUNS = [
  "Falcon", "Comet", "Harbor", "Canyon", "Rocket", "Anchor", "Summit",
  "Meadow", "Lantern", "Compass", "Thunder", "Marble",
];

/** Adjective + Noun + 2 digits, e.g. "SwiftFalcon72" -- always 8+ chars and never on the denylist. */
function suggestPassword(): string {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  const digits = String(Math.floor(Math.random() * 90) + 10);
  return `${pick(SUGGEST_ADJECTIVES)}${pick(SUGGEST_NOUNS)}${digits}`;
}

export function UserRow({ user }: { user: Profile }) {
  const router = useRouter();
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function call(url: string, body: object) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    const ok = await call("/api/admin/users/reset-password", {
      userId: user.id,
      newPassword,
    });
    if (ok) {
      setMessage("Password reset");
      setNewPassword("");
      setShowReset(false);
    }
  }

  async function toggleActive() {
    await call("/api/admin/users/deactivate", { userId: user.id, active: !user.is_active });
  }

  async function deleteUser() {
    const ok = await call("/api/admin/users/delete", { userId: user.id });
    if (ok) setMessage("Account deleted");
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {user.full_name}{" "}
            <span className="font-mono text-xs font-normal text-gray-400">@{user.username}</span>{" "}
            <span className="text-xs font-normal capitalize text-gray-400">{user.role}</span>
            {!user.is_active && (
              <span className="ml-2 badge-muted">
                Inactive
              </span>
            )}
          </p>
          <p className="font-mono text-xs text-gray-400">${user.cash_balance.toFixed(2)} cash</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => setShowReset((s) => !s)} className="btn-secondary" disabled={loading}>
            Reset password
          </button>
          {user.role === "student" && (
            <button onClick={toggleActive} className="btn-secondary" disabled={loading}>
              {user.is_active ? "Deactivate" : "Reactivate"}
            </button>
          )}
        </div>
      </div>

      {showReset && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          <form onSubmit={resetPassword} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label">New password</label>
              <input
                className="input"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setNewPassword(suggestPassword());
                setError(null);
              }}
              className="btn-secondary"
              disabled={loading}
            >
              Suggest
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              Set
            </button>
          </form>
          {/* Kept directly under the form rather than at the bottom of the
              card: a rejected password ("too easy to guess") is only useful
              if the person who just typed it actually sees why. */}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <p className="mt-1 text-xs text-gray-400">
            Very common passwords (like &quot;student123&quot;) are rejected. Use Suggest for one
            that&apos;s easy to read aloud.
          </p>
        </div>
      )}

      {user.role === "student" && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-600 hover:underline">
              Permanently delete account
            </button>
          ) : (
            <div className="alert-danger p-2">
              <p className="mb-2 text-xs text-red-800 dark:text-red-300">
                This permanently deletes {user.full_name} (@{user.username}) and all their trade history. Cannot be
                undone.
              </p>
              <div className="flex gap-2">
                <button onClick={deleteUser} className="btn-danger" disabled={loading}>
                  Confirm delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary" disabled={loading}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* `error` is shared by every action on this card, but the reset form
          renders its own copy inline, so skip this one while that form is
          open or the same message would appear twice. */}
      {error && !showReset && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm delta-up">{message}</p>}
    </div>
  );
}
