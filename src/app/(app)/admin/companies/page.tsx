import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { CompanyRow } from "@/components/admin/CompanyRow";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import type { Company } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Companies</h1>

      <CollapsibleCard title="Add a new company">
        <CompanyForm />
      </CollapsibleCard>

      <div className="space-y-2">
        {((companies ?? []) as Company[]).map((c) => (
          <CompanyRow key={c.id} company={c} />
        ))}
      </div>
    </div>
  );
}
