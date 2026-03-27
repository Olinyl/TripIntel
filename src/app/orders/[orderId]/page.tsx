import { redirect } from "next/navigation";

import { OrderManagementPanel } from "@/components/support/order-management-panel";
import { isAuthDisabled } from "@/lib/auth/mode";
import { getServerSupabaseClient } from "@/lib/supabase/server";

interface OrderPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  if (!isAuthDisabled()) {
    try {
      const supabase = await getServerSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        redirect("/login");
      }
    } catch {
      // Fall through to guest-mode experience when auth backend is unavailable.
    }
  }

  const { orderId } = await params;
  return <OrderManagementPanel orderId={orderId} />;
}
