import { CheckoutForm } from "@/components/search/checkout-form";
import { getOfferDetails, getSeatMapsForOffer } from "@/lib/api/flights";
import { getServerSupabaseClient } from "@/lib/supabase/server";

interface CheckoutPageProps {
  params: Promise<{ offerId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  let sessionEmail = "";
  let isAuthenticated = false;

  try {
    const supabase = await getServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      isAuthenticated = true;
      sessionEmail = session.user.email ?? "";
    }
  } catch {
    isAuthenticated = false;
    sessionEmail = "";
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
      userEmail={sessionEmail}
      isAuthenticated={isAuthenticated}
      returnTo={typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : "/dashboard"}
    />
  );
}
