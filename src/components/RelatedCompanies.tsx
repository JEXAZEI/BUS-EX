import Link from "next/link";
import { CompanyAvatar } from "@/components/CompanyAvatar";

interface RelatedCompany {
  id: string;
  name: string;
  ticker: string;
  price: number;
  pctChange: number;
}

export function RelatedCompanies({ companies }: { companies: RelatedCompany[] }) {
  if (companies.length === 0) return null;

  return (
    <div className="card">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Related
      </h2>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
        {companies.map((c) => {
          const up = c.pctChange >= 0;
          return (
            <li key={c.id}>
              <Link
                href={`/company/${c.id}`}
                className="-mx-1 flex items-center justify-between rounded px-1 py-2 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CompanyAvatar name={c.name} ticker={c.ticker} className="h-7 w-7 text-xs" />
                  <span className="truncate">
                    <span className="font-medium">{c.name}</span>{" "}
                    <span className="font-mono text-xs text-gray-400">{c.ticker}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="mono-nums">${c.price.toFixed(2)}</span>
                  <span
                    className={`mono-nums inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      up
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                  >
                    {up ? "▲" : "▼"} {Math.abs(c.pctChange).toFixed(1)}%
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
