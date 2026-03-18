import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { SearchDashboard } from "@/components/search/search-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return <SearchDashboard userEmail={session.user.email ?? ""} />;
}
