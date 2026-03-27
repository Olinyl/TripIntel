import type { FlightOffer, TripIntent } from "@/lib/domain/types";
import type { FlightProvider } from "@/lib/providers/flight-provider";
import { DuffelFlightProvider } from "@/lib/providers/duffel/duffel-adapter";

export class CompositeFlightProvider implements FlightProvider {
  private duffel: FlightProvider;

  constructor(duffelProvider: FlightProvider = new DuffelFlightProvider()) {
    this.duffel = duffelProvider;
  }

  async searchFlights(intent: TripIntent): Promise<FlightOffer[]> {
    return this.duffel.searchFlights(intent);
  }
}

