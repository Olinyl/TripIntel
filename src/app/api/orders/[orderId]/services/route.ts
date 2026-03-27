import { NextResponse } from "next/server";

import {
  addPostBookingServices,
  listAvailableOrderServices,
  type OrderServiceInput,
} from "@/lib/api/order-management";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ orderId: string }>;
}

interface Body {
  services?: unknown;
}

function isServicesArray(value: unknown): value is OrderServiceInput[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const service = item as Record<string, unknown>;
    return typeof service.id === "string" && typeof service.quantity === "number";
  });
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const services = await listAvailableOrderServices(orderId);
    return NextResponse.json({ services });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch available services.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const body = (await request.json()) as Body;

    if (!isServicesArray(body.services)) {
      return NextResponse.json({ error: "services payload is invalid." }, { status: 400 });
    }

    const order = await addPostBookingServices(orderId, body.services);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add post-booking services.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
