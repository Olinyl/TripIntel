import { NextResponse } from "next/server";

import { getDuffelOrder } from "@/lib/api/order-management";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ orderId: string }>;
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const order = await getDuffelOrder(orderId);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
