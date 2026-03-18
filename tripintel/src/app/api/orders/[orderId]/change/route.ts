import { NextResponse } from "next/server";

import {
  createOrderChangeRequest,
  type ChangeSliceInput,
} from "@/lib/api/order-management";

interface Params {
  params: Promise<{ orderId: string }>;
}

interface Body {
  removeSliceIds?: unknown;
  addSlices?: unknown;
}

function isAddSlices(value: unknown): value is ChangeSliceInput[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const slice = item as Record<string, unknown>;
    return (
      typeof slice.origin === "string" &&
      typeof slice.destination === "string" &&
      typeof slice.departure_date === "string"
    );
  });
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const body = (await request.json()) as Body;

    if (!Array.isArray(body.removeSliceIds) || !body.removeSliceIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "removeSliceIds must be a string array." }, { status: 400 });
    }

    if (!isAddSlices(body.addSlices)) {
      return NextResponse.json({ error: "addSlices payload is invalid." }, { status: 400 });
    }

    const changeRequest = await createOrderChangeRequest({
      orderId,
      removeSliceIds: body.removeSliceIds,
      addSlices: body.addSlices,
    });

    return NextResponse.json({ changeRequest });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order change request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
