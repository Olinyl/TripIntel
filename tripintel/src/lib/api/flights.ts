import "server-only";

import { Duffel } from "@duffel/api";

import type { FlightOffer, TripIntent } from "@/lib/domain/types";

type UnknownRecord = Record<string, unknown>;
const DEFAULT_SUPPLIER_TIMEOUT_MS = 20000;
const DEFAULT_MAX_CONNECTIONS = 1;

function getDuffelClient(): Duffel {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("DUFFEL_ACCESS_TOKEN is not configured.");
  }
  return new Duffel({ token });
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getDuffelErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const errors = Array.isArray(record.errors) ? record.errors : [];
    const first = errors[0] && typeof errors[0] === "object"
      ? (errors[0] as Record<string, unknown>)
      : undefined;
    const title = first ? asString(first.title) : "";
    const detail = first ? asString(first.detail) : "";
    const code = first ? asString(first.code) : "";

    const combined = [title, detail, code].filter(Boolean).join(" - ");
    if (combined) return combined;
  }

  const fallback = String(error ?? "").trim();
  return fallback || "Duffel request failed.";
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asAmount(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function durationMinutesFromTimes(departureIso: string, arrivalIso: string): number {
  const departureMs = Date.parse(departureIso);
  const arrivalMs = Date.parse(arrivalIso);
  if (!Number.isFinite(departureMs) || !Number.isFinite(arrivalMs)) return 0;
  const diffMinutes = Math.round((arrivalMs - departureMs) / (1000 * 60));
  return diffMinutes > 0 ? diffMinutes : 0;
}

function parseIsoDurationMinutes(durationIso: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(durationIso.trim());
  if (!match) return 0;
  const days = match[1] ? Number(match[1]) : 0;
  const hours = match[2] ? Number(match[2]) : 0;
  const minutes = match[3] ? Number(match[3]) : 0;
  const seconds = match[4] ? Number(match[4]) : 0;
  return days * 24 * 60 + hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
}

function buildDuffelPassengers(intent: TripIntent): Array<Record<string, unknown>> {
  const passengerCount = Math.max(1, intent.passengers || 1);

  const shouldAttachLoyalty =
    Boolean(intent.useAmeliaTestProfile) ||
    Boolean(intent.loyaltyAirlineCode && intent.loyaltyAccountNumber);

  const loyaltyAirlineCode = intent.useAmeliaTestProfile
    ? "ZZ"
    : (intent.loyaltyAirlineCode ?? "").trim().toUpperCase();
  const loyaltyAccountNumber = intent.useAmeliaTestProfile
    ? "1234567890"
    : (intent.loyaltyAccountNumber ?? "").trim();

  return Array.from({ length: passengerCount }).map((_, index) => {
    const basePassenger: Record<string, unknown> = { type: "adult" };

    if (index === 0 && shouldAttachLoyalty && loyaltyAirlineCode && loyaltyAccountNumber) {
      return {
        ...basePassenger,
        given_name: intent.useAmeliaTestProfile ? "Amelia" : "Loyalty",
        family_name: intent.useAmeliaTestProfile ? "Earhart" : "Member",
        loyalty_programme_accounts: [
          {
            airline_iata_code: loyaltyAirlineCode,
            account_number: loyaltyAccountNumber,
          },
        ],
      };
    }

    return basePassenger;
  });
}

function mapOfferToFlightOffer(offerValue: unknown, intent: TripIntent): FlightOffer {
  const offer = asRecord(offerValue);
  const slices = Array.isArray(offer.slices) ? offer.slices : [];
  const firstSlice = asRecord(slices[0]);
  const rawSegments = Array.isArray(firstSlice.segments) ? firstSlice.segments : [];

  const segments = rawSegments.map((segmentValue) => {
    const segment = asRecord(segmentValue);
    const operatingCarrier = asRecord(segment.operating_carrier);
    const origin = asRecord(segment.origin);
    const destination = asRecord(segment.destination);
    const rawStops = Array.isArray(segment.stops) ? segment.stops : [];
    const stops = rawStops.map((stopValue) => {
      const stop = asRecord(stopValue);
      const stopAirport = asRecord(stop.airport);
      return {
        airportCode: asString(stopAirport.iata_code),
        durationMinutes: parseIsoDurationMinutes(asString(stop.duration)),
        departingAt: asString(stop.departing_at) || undefined,
      };
    }).filter((stop) => stop.airportCode);

    return {
      carrierCode: asString(operatingCarrier.iata_code, "ZZ"),
      flightNumber: asString(segment.operating_carrier_flight_number),
      origin: asString(origin.iata_code, intent.origin),
      destination: asString(destination.iata_code, intent.destination),
      departureTime: asString(segment.departing_at, intent.departureDate),
      arrivalTime: asString(segment.arriving_at, intent.departureDate),
      durationMinutes:
        asNumber(segment.duration_in_minutes) ||
        parseIsoDurationMinutes(asString(segment.duration)),
      ...(stops.length > 0 ? { stops } : {}),
    };
  });

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1] ?? firstSegment;
  const departureTime = firstSegment?.departureTime ?? intent.departureDate;
  const arrivalTime =
    lastSegment?.arrivalTime ?? firstSegment?.departureTime ?? intent.departureDate;

  const offerDurationMinutes =
    asNumber(offer.total_duration_in_minutes) ||
    parseIsoDurationMinutes(asString(offer.total_duration));
  const sliceDurationMinutes =
    asNumber(firstSlice.duration_in_minutes) ||
    parseIsoDurationMinutes(asString(firstSlice.duration));
  const segmentDurationMinutes = segments.reduce(
    (sum, segment) => sum + (Number.isFinite(segment.durationMinutes) ? segment.durationMinutes : 0),
    0,
  );
  const stopDurationMinutes = segments.reduce(
    (sum, segment) =>
      sum +
      (segment.stops ?? []).reduce(
        (segmentStopSum, stop) =>
          segmentStopSum + (Number.isFinite(stop.durationMinutes) ? stop.durationMinutes : 0),
        0,
      ),
    0,
  );
  const durationByTimestamps = durationMinutesFromTimes(departureTime, arrivalTime);
  const totalDurationMinutes =
    offerDurationMinutes ||
    sliceDurationMinutes ||
    segmentDurationMinutes + stopDurationMinutes ||
    durationByTimestamps;

  return {
    id: asString(offer.id, `${intent.origin}-${intent.destination}-${intent.departureDate}`),
    provider: "duffel",
    carrierCode: firstSegment?.carrierCode ?? "ZZ",
    flightNumber: firstSegment?.flightNumber ?? "",
    origin: firstSegment?.origin ?? intent.origin,
    destination: lastSegment?.destination ?? intent.destination,
    departureTime,
    arrivalTime,
    durationMinutes: totalDurationMinutes,
    price: asAmount(offer.total_amount),
    currency: asString(offer.total_currency, intent.currency ?? "USD"),
    cabin: intent.cabin ?? "economy",
    segments,
    totalEmissionsKg: asAmount(offer.total_emissions_kg) || undefined,
    bookingUrl: asString(offer.booking_url) || undefined,
    metadata: {
      raw: offer,
    },
  };
}

export async function searchDuffelFlights(intent: TripIntent): Promise<FlightOffer[]> {
  const duffel = getDuffelClient();
  const slicesPayload = [
    {
      origin: intent.origin,
      destination: intent.destination,
      departure_date: intent.departureDate,
      departure_time: null,
      arrival_time: null,
    },
    ...(intent.returnDate
      ? [
          {
            origin: intent.destination,
            destination: intent.origin,
            departure_date: intent.returnDate,
            departure_time: null,
            arrival_time: null,
          },
        ]
      : []),
  ];

  let offerRequestResponse: { data: unknown };
  try {
    offerRequestResponse = await duffel.offerRequests.create({
      slices: slicesPayload,
      passengers: buildDuffelPassengers(intent) as never,
      cabin_class: intent.cabin ?? "economy",
      max_connections: DEFAULT_MAX_CONNECTIONS,
      return_offers: true,
      supplier_timeout: DEFAULT_SUPPLIER_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Error(`Duffel offer request failed: ${getDuffelErrorMessage(error)}`);
  }

  const offerRequest = asRecord(offerRequestResponse.data);
  const offers = Array.isArray(offerRequest.offers) ? offerRequest.offers : [];

  return offers.map((offerValue) => mapOfferToFlightOffer(offerValue, intent));
}

export async function getSeatMapsForOffer(offerId: string): Promise<unknown[]> {
  const duffel = getDuffelClient();
  try {
    const response = await duffel.seatMaps.get({ offer_id: offerId });
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    throw new Error(`Duffel seat map retrieval failed: ${getDuffelErrorMessage(error)}`);
  }
}

export async function getOfferDetails(offerId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  let response: { data: unknown };
  try {
    response = await duffel.offers.get(offerId, { return_available_services: true });
  } catch (error) {
    throw new Error(`Duffel offer retrieval failed: ${getDuffelErrorMessage(error)}`);
  }
  return asRecord(response.data);
}
