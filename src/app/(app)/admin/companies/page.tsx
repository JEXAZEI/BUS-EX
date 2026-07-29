import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db/client";
import { companies as companiesTable } from "@/lib/db/schema";
import { toCompany } from "@/lib/db/mappers";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { CompanyRow } from "@/components/admin/CompanyRow";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage() {
  await requireAdmin();
  const rows = await db.select().from(companiesTable).orderBy(asc(companiesTable.name));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Companies</h1>

      <CollapsibleCard title="Add a new company">
        <CompanyForm />
      </CollapsibleCard>

      <div className="space-y-2">
        {rows.map(toCompany).map((c) => (
          <CompanyRow key={c.id} company={c} />
        ))}
      </div>
    </div>
  );
}
