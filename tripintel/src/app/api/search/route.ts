import { NextResponse } from "next/server";

import { parseNaturalLanguageQuery } from "@/lib/ai/query-parser";
import { TripOrchestrator } from "@/lib/services/trip-orchestrator";

interface SearchBody {
  query?: unknown;
  loyaltyAirlineCode?: unknown;
  loyaltyAccountNumber?: unknown;
  useAmeliaTestProfile?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SearchBody;
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json({ error: "A non-empty query string is required." }, { status: 400 });
    }

    const intent = await parseNaturalLanguageQuery(query);
    const loyaltyAirlineCode =
      typeof body.loyaltyAirlineCode === "string" ? body.loyaltyAirlineCode.trim().toUpperCase() : "";
    const loyaltyAccountNumber =
      typeof body.loyaltyAccountNumber === "string" ? body.loyaltyAccountNumber.trim() : "";
    const useAmeliaTestProfile = body.useAmeliaTestProfile === true;

    if (useAmeliaTestProfile || (loyaltyAirlineCode && loyaltyAccountNumber)) {
      intent.loyaltyAirlineCode = useAmeliaTestProfile ? "ZZ" : loyaltyAirlineCode;
      intent.loyaltyAccountNumber = useAmeliaTestProfile ? "1234567890" : loyaltyAccountNumber;
      intent.useAmeliaTestProfile = useAmeliaTestProfile;
    }

    const orchestrator = new TripOrchestrator();
    const result = await orchestrator.search(intent);

    return NextResponse.json({
      intent,
      ...result,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error ?? "");
    const message = rawMessage.trim() || "Unexpected search error.";
    const status = message.startsWith("Unable to parse query") || message === "Query is required." ? 400 : 500;

    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
