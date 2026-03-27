import type { FlightOffer, TripIntent } from "@/lib/domain/types";

export interface FlightProvider {
  searchFlights(intent: TripIntent): Promise<FlightOffer[]>;
}

