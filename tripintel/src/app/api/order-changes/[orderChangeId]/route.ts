import { NextResponse } from "next/server";

import { getOrderChange } from "@/lib/api/order-management";

export const runtime = "edge";

interface Params {
  params: Promise<{ orderChangeId: string }>;
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderChangeId } = await params;
    const orderChange = await getOrderChange(orderChangeId);
    return NextResponse.json({ orderChange });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch order change.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
