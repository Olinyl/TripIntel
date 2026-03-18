import { searchDuffelFlights } from "@/lib/api/flights";
import type { FlightOffer, TripIntent } from "@/lib/domain/types";
import type { FlightProvider } from "@/lib/providers/flight-provider";

export class DuffelFlightProvider implements FlightProvider {
  async searchFlights(intent: TripIntent): Promise<FlightOffer[]> {
    return searchDuffelFlights(intent);
  }
}

