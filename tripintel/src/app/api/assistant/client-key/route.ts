import { NextResponse } from "next/server";

import { createAssistantClientKey } from "@/lib/api/order-management";

interface Body {
  userId?: unknown;
  orderId?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Body;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const orderId = typeof body.orderId === "string" ? body.orderId : undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const componentClientKey = await createAssistantClientKey({ userId, orderId });
    return NextResponse.json({ componentClientKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create assistant client key.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
