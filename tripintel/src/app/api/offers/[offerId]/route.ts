import { NextResponse } from "next/server";

import { getOfferDetails } from "@/lib/api/flights";

interface RouteParams {
  params: Promise<{ offerId: string }>;
}

export async function GET(_: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { offerId } = await params;
    if (!offerId) {
      return NextResponse.json({ error: "offerId is required." }, { status: 400 });
    }

    const offer = await getOfferDetails(offerId);
    return NextResponse.json({ offer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch offer details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
