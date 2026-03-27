import { NextResponse } from "next/server";

import {
  confirmOrderCancellation,
  createOrderCancellationQuote,
} from "@/lib/api/order-management";

export const runtime = "edge";

interface Params {
  params: Promise<{ orderId: string }>;
}

interface Body {
  action?: unknown;
  cancellationId?: unknown;
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const body = (await request.json()) as Body;
    const action = typeof body.action === "string" ? body.action : "quote";

    if (action === "confirm") {
      const cancellationId = typeof body.cancellationId === "string" ? body.cancellationId : "";
      if (!cancellationId) {
        return NextResponse.json({ error: "cancellationId is required to confirm." }, { status: 400 });
      }
      const cancellation = await confirmOrderCancellation(cancellationId);
      return NextResponse.json({ cancellation });
    }

    const cancellation = await createOrderCancellationQuote(orderId);
    return NextResponse.json({ cancellation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process cancellation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
