import type { FlightOffer, RouteKey, TripIntent } from "@/lib/domain/types";
import type { FlightProvider } from "@/lib/providers/flight-provider";
import { getFromCache, makeCacheKey, setInCache } from "@/lib/infra/caching/memory-cache";

const AVIATIONSTACK_API_URL = "http://api.aviationstack.com/v1/flights";
const AVIATIONSTACK_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function calculateDurationMinutes(departureIso: string, arrivalIso: string): number {
  const departureMs = Date.parse(departureIso);
  const arrivalMs = Date.parse(arrivalIso);
  if (!Number.isFinite(departureMs) || !Number.isFinite(arrivalMs)) {
    return 0;
  }

  const diffMinutes = Math.round((arrivalMs - departureMs) / (1000 * 60));
  return diffMinutes > 0 ? diffMinutes : 0;
}

function createMockOffers(intent: TripIntent, count = 10): FlightOffer[] {
  const departureDate = new Date(`${intent.departureDate}T00:00:00Z`);
  const baseDuration = 180;

  return Array.from({ length: count }).map((_, index) => {
    const departureHour = 6 + (index % 10);
    const departureMinute = (index % 4) * 15;
    const departureTime = new Date(departureDate);
    departureTime.setUTCHours(departureHour, departureMinute, 0, 0);

    const durationMinutes = baseDuration + index * 28 + (index % 3) * 17;
    const arrivalTime = new Date(departureTime.getTime() + durationMinutes * 60 * 1000);

    return {
      id: `mock-${intent.origin}-${intent.destination}-${intent.departureDate}-${index + 1}`,
      provider: "aviationstack",
      carrierCode: "AC",
      flightNumber: String(900 + index),
      origin: intent.origin,
      destination: intent.destination,
      departureTime: departureTime.toISOString(),
      arrivalTime: arrivalTime.toISOString(),
      durationMinutes,
      price: 0,
      currency: intent.currency ?? "USD",
      cabin: intent.cabin ?? "economy",
      segments: [
        {
          carrierCode: "AC",
          flightNumber: String(900 + index),
          origin: intent.origin,
          destination: intent.destination,
          departureTime: departureTime.toISOString(),
          arrivalTime: arrivalTime.toISOString(),
          durationMinutes,
        },
      ],
      isMock: true,
      metadata: {
        source: "mock-data",
      },
    };
  });
}

export class AviationStackFlightProvider implements FlightProvider {
  async searchFlights(intent: TripIntent): Promise<FlightOffer[]> {
    const apiKey = process.env.AVIATIONSTACK_API_KEY;

    if (!apiKey) {
      throw new Error("AVIATIONSTACK_API_KEY is not configured.");
    }

    const routeKey: RouteKey = {
      origin: intent.origin,
      destination: intent.destination,
      departureDate: intent.departureDate,
      returnDate: intent.returnDate ?? undefined,
      tripType: intent.tripType,
    };

    const cacheKey = makeCacheKey([
      "aviationstack",
      routeKey.origin,
      routeKey.destination,
      routeKey.departureDate,
      routeKey.returnDate,
      routeKey.tripType,
      intent.cabin ?? "economy",
      intent.passengers,
    ]);

    const cached = getFromCache<FlightOffer[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = new URL(AVIATIONSTACK_API_URL);
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("dep_iata", intent.origin);
    url.searchParams.set("arr_iata", intent.destination);
    url.searchParams.set("flight_date", intent.departureDate);
    url.searchParams.set("limit", "10");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`AviationStack search failed with status ${response.status}`);
    }

    const json = (await response.json()) as { data?: unknown };
    const data = Array.isArray(json.data) ? json.data : [];

    const offers: FlightOffer[] = data.map((flightValue, index) => {
      const flight = asRecord(flightValue);
      const departure = asRecord(flight.departure);
      const arrival = asRecord(flight.arrival);
      const airline = asRecord(flight.airline);
      const flightInfo = asRecord(flight.flight);
      const departureTime = asString(departure.scheduled, intent.departureDate);
      const arrivalTime = asString(arrival.scheduled, departureTime);
      const durationMinutes = calculateDurationMinutes(departureTime, arrivalTime);

      return {
        id: asString(flightInfo.iata, String(index)),
        provider: "aviationstack",
        carrierCode: asString(airline.iata),
        flightNumber: asString(flightInfo.number),
        origin: asString(departure.iata, intent.origin),
        destination: asString(arrival.iata, intent.destination),
        departureTime,
        arrivalTime,
        durationMinutes,
        price: 0,
        currency: intent.currency ?? "USD",
        cabin: intent.cabin ?? "economy",
        segments: [
          {
            carrierCode: asString(airline.iata),
            flightNumber: asString(flightInfo.number),
            origin: asString(departure.iata, intent.origin),
            destination: asString(arrival.iata, intent.destination),
            departureTime,
            arrivalTime,
            durationMinutes,
          },
        ],
        metadata: {
          raw: flight,
        },
      };
    });

    const hasValidScheduleData = offers.some((offer) => offer.durationMinutes > 0);
    const finalOffers = hasValidScheduleData ? offers : createMockOffers(intent, 10);

    setInCache(cacheKey, finalOffers, AVIATIONSTACK_TTL_MS);
    return finalOffers;
  }
}

