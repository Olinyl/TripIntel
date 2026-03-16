import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/search/checkout-form";
import { getOfferDetails, getSeatMapsForOffer } from "@/lib/api/flights";
import { getServerSupabaseClient } from "@/lib/supabase/server";

interface CheckoutPageProps {
  params: Promise<{ offerId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { offerId } = await params;
  const { returnTo } = await searchParams;
  const [offer, seatMaps] = await Promise.all([
    getOfferDetails(offerId),
    getSeatMapsForOffer(offerId),
  ]);

  return (
    <CheckoutForm
      offerId={offerId}
      offer={offer}
      seatMaps={seatMaps}
      userEmail={session.user.email ?? ""}
      returnTo={typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : "/dashboard"}
    />
  );
}
