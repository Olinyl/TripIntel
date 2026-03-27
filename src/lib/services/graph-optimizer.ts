import type { TripIntent } from "@/lib/domain/types";

/**
 * Hardcoded proximity table mapping an airport IATA code to its
 * regional alternatives.  Expand as needed when more test routes are added.
 */
const NEARBY_AIRPORTS: Readonly<Record<string, string[]>> = {
  // San Francisco Bay Area
  SFO: ["OAK", "SJC"],
  OAK: ["SFO", "SJC"],
  SJC: ["SFO", "OAK"],
  // New York metro
  JFK: ["EWR", "LGA"],
  EWR: ["JFK", "LGA"],
  LGA: ["JFK", "EWR"],
  // London
  LHR: ["LGW", "STN"],
  LGW: ["LHR", "STN"],
  STN: ["LHR", "LGW"],
  // Los Angeles metro
  LAX: ["BUR", "SNA", "ONT"],
  BUR: ["LAX", "SNA"],
  SNA: ["LAX", "BUR"],
  ONT: ["LAX", "BUR"],
  // Chicago
  ORD: ["MDW"],
  MDW: ["ORD"],
  // Paris
  CDG: ["ORY"],
  ORY: ["CDG"],
  // Tokyo
  NRT: ["HND"],
  HND: ["NRT"],
  // Dallas–Fort Worth
  DFW: ["DAL"],
  DAL: ["DFW"],
  // Miami / Fort Lauderdale
  MIA: ["FLL"],
  FLL: ["MIA"],
  // Washington D.C.
  DCA: ["IAD", "BWI"],
  IAD: ["DCA", "BWI"],
  BWI: ["DCA", "IAD"],
};

export class GraphOptimizer {
  /**
   * Returns the IATA codes of airports near `origin`.
   * Returns an empty array when no alternatives are known.
   */
  findAlternativeAirports(origin: string): string[] {
    return NEARBY_AIRPORTS[origin.toUpperCase()] ?? [];
  }

  /**
   * Builds a `TripIntent` for each nearby origin airport, preserving all
   * other search parameters from the base intent.
   */
  buildAlternativeIntents(baseIntent: TripIntent): TripIntent[] {
    return this.findAlternativeAirports(baseIntent.origin).map((altOrigin) => ({
      ...baseIntent,
      origin: altOrigin,
    }));
  }
}
