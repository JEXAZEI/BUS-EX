"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DelistButton({ companyId, isDelisted }: { companyId: string; isDelisted: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await fetch("/api/admin/companies/delist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, delisted: !isDelisted }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={toggle} className={isDelisted ? "btn-primary" : "btn-danger"} disabled={loading}>
      {loading ? "..." : isDelisted ? "Relist" : "Delist"}
    </button>
  );
}
