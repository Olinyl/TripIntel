import { NextResponse } from "next/server";

import {
  createDuffelOrder,
  type PassengerInput,
  type SelectedServiceInput,
} from "@/lib/api/booking";

interface BookingBody {
  offerId?: unknown;
  passengers?: unknown;
  services?: unknown;
}

function isPassengerArray(value: unknown): value is PassengerInput[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const passenger = item as Record<string, unknown>;
    return (
      typeof passenger.id === "string" &&
      typeof passenger.given_name === "string" &&
      typeof passenger.family_name === "string" &&
      typeof passenger.born_on === "string" &&
      (passenger.gender === "m" || passenger.gender === "f") &&
      (passenger.title === "mr" || passenger.title === "mrs" || passenger.title === "ms") &&
      typeof passenger.email === "string" &&
      typeof passenger.phone_number === "string"
    );
  });
}

function isServicesArray(value: unknown): value is SelectedServiceInput[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const service = item as Record<string, unknown>;
    return typeof service.id === "string" && typeof service.quantity === "number";
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as BookingBody;
    const offerId = typeof body.offerId === "string" ? body.offerId : "";

    if (!offerId) {
      return NextResponse.json({ error: "offerId is required." }, { status: 400 });
    }

    if (!isPassengerArray(body.passengers)) {
      return NextResponse.json({ error: "passengers payload is invalid." }, { status: 400 });
    }

    const services = isServicesArray(body.services) ? body.services : [];

    const order = await createDuffelOrder({
      offerId,
      passengers: body.passengers,
      services,
    });

    return NextResponse.json({ order });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error ?? "");
    const message = rawMessage.trim() || "Failed to create booking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
