import { NextResponse } from "next/server";

import { confirmOrderChange } from "@/lib/api/order-management";

interface Params {
  params: Promise<{ orderChangeId: string }>;
}

interface Body {
  amount?: unknown;
  currency?: unknown;
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderChangeId } = await params;
    const body = (await request.json()) as Body;

    const amount = typeof body.amount === "string" ? body.amount : undefined;
    const currency = typeof body.currency === "string" ? body.currency : undefined;

    const orderChange = await confirmOrderChange({
      orderChangeId,
      amount,
      currency,
    });
    return NextResponse.json({ orderChange });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm order change.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
