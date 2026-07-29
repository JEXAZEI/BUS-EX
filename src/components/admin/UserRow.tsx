"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/supabase/types";

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
            @{user.username}{" "}
            <span className="text-xs font-normal capitalize text-gray-400">{user.role}</span>
            {!user.is_active && (
              <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
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
        <form onSubmit={resetPassword} className="mt-3 flex items-end gap-2 border-t border-gray-100 pt-3">
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
          <button type="submit" className="btn-primary" disabled={loading}>
            Set
          </button>
        </form>
      )}

      {user.role === "student" && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-600 hover:underline">
              Permanently delete account
            </button>
          ) : (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2">
              <p className="mb-2 text-xs text-red-800">
                This permanently deletes @{user.username} and all their trade history. Cannot be
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-up">{message}</p>}
    </div>
  );
}
