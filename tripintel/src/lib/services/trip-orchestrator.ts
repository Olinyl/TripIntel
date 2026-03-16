import type { FlightOffer, TripIntent } from "@/lib/domain/types";
import { CompositeFlightProvider } from "@/lib/providers/composite-flight-provider";
import type { FlightProvider } from "@/lib/providers/flight-provider";

export interface TripOrchestratorResult {
  flights: FlightOffer[];
}

export class TripOrchestrator {
  private flightProvider: FlightProvider;

  constructor(flightProvider: FlightProvider = new CompositeFlightProvider()) {
    this.flightProvider = flightProvider;
  }

  async search(intent: TripIntent): Promise<TripOrchestratorResult> {
    const flights = await this.flightProvider.searchFlights(intent);
    return {
      flights,
    };
  }
}

