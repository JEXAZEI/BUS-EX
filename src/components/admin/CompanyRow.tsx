"use client";

import { useState } from "react";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { DelistButton } from "@/components/admin/DelistButton";
import type { Company } from "@/lib/types";
import { companyPrice } from "@/lib/types";

export function CompanyRow({ company }: { company: Company }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {company.name} <span className="font-mono text-xs text-gray-400">{company.ticker}</span>
            {company.is_delisted && (
              <span className="ml-2 badge-danger">
                DELISTED
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 capitalize">{company.sector}</p>
          <p className="font-mono text-sm">${companyPrice(company).toFixed(2)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing((e) => !e)} className="btn-secondary">
            {editing ? "Close" : "Edit"}
          </button>
          <DelistButton companyId={company.id} isDelisted={company.is_delisted} />
        </div>
      </div>
      {editing && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          <CompanyForm company={company} onDone={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}
