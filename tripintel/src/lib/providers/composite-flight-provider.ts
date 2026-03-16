import type { FlightOffer, TripIntent } from "@/lib/domain/types";
import type { FlightProvider } from "@/lib/providers/flight-provider";
import { DuffelFlightProvider } from "@/lib/providers/duffel/duffel-adapter";
import { AviationStackFlightProvider } from "@/lib/providers/aviationstack/aviation-stack-adapter";

export class CompositeFlightProvider implements FlightProvider {
  private duffel: FlightProvider;
  private aviationStack: FlightProvider;

  constructor(
    duffelProvider: FlightProvider = new DuffelFlightProvider(),
    aviationStackProvider: FlightProvider = new AviationStackFlightProvider(),
  ) {
    this.duffel = duffelProvider;
    this.aviationStack = aviationStackProvider;
  }

  async searchFlights(intent: TripIntent): Promise<FlightOffer[]> {
    try {
      const duffelOffers = await this.duffel.searchFlights(intent);
      if (duffelOffers.length > 0) {
        return duffelOffers;
      }
    } catch {
      // Intentionally swallow Duffel failures and fall back to AviationStack.
    }

    return this.aviationStack.searchFlights(intent);
  }
}

