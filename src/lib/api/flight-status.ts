import "server-only";

type UnknownRecord = Record<string, unknown>;

export interface FlightStatusSnapshot {
  segmentKey: string;
  flightIata: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
  estimatedDeparture?: string;
  estimatedArrival?: string;
  departureGate?: string;
  arrivalGate?: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  delayMinutes?: number;
  status?: string;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toFlightDate(isoLike: string): string {
  const parsed = new Date(isoLike);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export async function getLiveFlightStatus(params: {
  segmentKey: string;
  flightIata: string;
  departureTimeIso: string;
}): Promise<FlightStatusSnapshot> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) {
    throw new Error("AVIATIONSTACK_API_KEY is not configured.");
  }

  const url = new URL("http://api.aviationstack.com/v1/flights");
  url.searchParams.set("access_key", apiKey);
  url.searchParams.set("flight_iata", params.flightIata);
  url.searchParams.set("flight_date", toFlightDate(params.departureTimeIso));
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Flight status lookup failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: unknown };
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const best = asRecord(rows[0]);
  const departure = asRecord(best.departure);
  const arrival = asRecord(best.arrival);

  return {
    segmentKey: params.segmentKey,
    flightIata: params.flightIata,
    scheduledDeparture: asString(departure.scheduled) || undefined,
    scheduledArrival: asString(arrival.scheduled) || undefined,
    estimatedDeparture: asString(departure.estimated) || undefined,
    estimatedArrival: asString(arrival.estimated) || undefined,
    departureGate: asString(departure.gate) || undefined,
    arrivalGate: asString(arrival.gate) || undefined,
    departureTerminal: asString(departure.terminal) || undefined,
    arrivalTerminal: asString(arrival.terminal) || undefined,
    delayMinutes: asNumber(departure.delay),
    status: asString(best.flight_status) || undefined,
  };
}
