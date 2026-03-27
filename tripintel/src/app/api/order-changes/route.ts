import { NextResponse } from "next/server";

import { createPendingOrderChange } from "@/lib/api/order-management";

export const runtime = "edge";

interface Body {
  selectedOrderChangeOfferId?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Body;
    const selectedOrderChangeOfferId =
      typeof body.selectedOrderChangeOfferId === "string" ? body.selectedOrderChangeOfferId : "";

    if (!selectedOrderChangeOfferId) {
      return NextResponse.json({ error: "selectedOrderChangeOfferId is required." }, { status: 400 });
    }

    const orderChange = await createPendingOrderChange(selectedOrderChangeOfferId);
    return NextResponse.json({ orderChange });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create pending order change.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
