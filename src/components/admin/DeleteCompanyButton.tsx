"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCompanyButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete company");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-red-600 hover:underline">
        Delete
      </button>
    );
  }

  return (
    <div className="mt-2 w-full">
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
        Permanently delete {companyName}? Only possible if it has no trade history yet.
      </p>
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={del} className="btn-danger" disabled={loading}>
          {loading ? "Deleting..." : "Confirm delete"}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-secondary" disabled={loading}>
          Cancel
        </button>
      </div>
    </div>
  );
}
