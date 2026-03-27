import { getServerSupabaseClient } from "@/lib/supabase/server";
import { SearchDashboard } from "@/components/search/search-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let sessionEmail: string | null = null;
  try {
    const supabase = await getServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    sessionEmail = session?.user.email ?? null;
  } catch {
    sessionEmail = null;
  }

  return <SearchDashboard userEmail={sessionEmail} isAuthenticated={Boolean(sessionEmail)} />;
}
