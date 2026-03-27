import { NextResponse } from "next/server";

import { getOrderChangeRequest } from "@/lib/api/order-management";

export const runtime = "edge";

interface Params {
  params: Promise<{ changeRequestId: string }>;
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { changeRequestId } = await params;
    const changeRequest = await getOrderChangeRequest(changeRequestId);
    return NextResponse.json({ changeRequest });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch order change request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
