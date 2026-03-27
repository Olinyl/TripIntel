import { NextResponse } from "next/server";

import { getLiveFlightStatus } from "@/lib/api/flight-status";
import { getDuffelOrder } from "@/lib/api/order-management";

export const runtime = "nodejs";

type UnknownRecord = Record<string, unknown>;

interface Params {
  params: Promise<{ orderId: string }>;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function extractTrackableSegments(order: UnknownRecord): Array<{
  segmentKey: string;
  flightIata: string;
  departureTimeIso: string;
}> {
  const slices = Array.isArray(order.slices) ? order.slices : [];
  const candidates: Array<{ segmentKey: string; flightIata: string; departureTimeIso: string }> = [];

  slices.forEach((sliceValue, sliceIndex) => {
    const slice = asRecord(sliceValue);
    const segments = Array.isArray(slice.segments) ? slice.segments : [];

    segments.forEach((segmentValue, segmentIndex) => {
      const segment = asRecord(segmentValue);
      const marketingCarrier = asRecord(segment.marketing_carrier);
      const operatingCarrier = asRecord(segment.operating_carrier);
      const carrierCode =
        asString(marketingCarrier.iata_code) ||
        asString(operatingCarrier.iata_code);
      const flightNumber =
        asString(segment.marketing_carrier_flight_number) ||
        asString(segment.operating_carrier_flight_number);
      const departureTimeIso = asString(segment.departing_at);

      if (!carrierCode || !flightNumber || !departureTimeIso) {
        return;
      }

      candidates.push({
        segmentKey: `slice-${sliceIndex + 1}-segment-${segmentIndex + 1}`,
        flightIata: `${carrierCode}${flightNumber}`,
        departureTimeIso,
      });
    });
  });

  return candidates;
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { orderId } = await params;
    const order = await getDuffelOrder(orderId);
    const segments = extractTrackableSegments(order);

    const statuses = await Promise.all(
      segments.map((segment) => getLiveFlightStatus(segment)),
    );

    return NextResponse.json({ statuses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load live flight status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
