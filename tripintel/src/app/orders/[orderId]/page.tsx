import { redirect } from "next/navigation";

import { OrderManagementPanel } from "@/components/support/order-management-panel";
import { getServerSupabaseClient } from "@/lib/supabase/server";

interface OrderPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { orderId } = await params;
  return <OrderManagementPanel orderId={orderId} />;
}
