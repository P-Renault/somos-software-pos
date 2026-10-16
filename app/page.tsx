import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PosShell from "@/component/pos-shell";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const companyId = profile?.company_id ?? "";
  const { data: company } = companyId
    ? await supabase
        .from("companies")
        .select("name, tax_id")
        .eq("id", companyId)
        .maybeSingle()
    : { data: null };

  return (
    <PosShell
      user={{
        email: user.email ?? "",
        name:
          profile?.full_name ?? user.email?.split("@")[0] ?? "Usuario",
        role: profile?.role ?? "owner",
      }}
      company={{
        id: companyId,
        name: company?.name ?? "Mi empresa",
        taxId: company?.tax_id ?? "",
      }}
    />
  );
}
