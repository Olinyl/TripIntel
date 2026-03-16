export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export type TripType = "one_way" | "round_trip";

export interface TripIntent {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  tripType: TripType;
  passengers: number;
  cabin?: CabinClass;
  maxBudget?: number;
  currency?: string;
  vibeKeywords?: string[];
  flexibleDays?: number;
  loyaltyAirlineCode?: string;
  loyaltyAccountNumber?: string;
  useAmeliaTestProfile?: boolean;
}

export interface RouteKey {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  tripType: TripType;
}

export interface FlightOffer {
  id: string;
  provider: "duffel" | "aviationstack";
  carrierCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  price: number;
  currency: string;
  cabin: CabinClass;
  segments: Array<{
    carrierCode: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    durationMinutes: number;
    stops?: Array<{
      airportCode: string;
      durationMinutes: number;
      departingAt?: string;
    }>;
  }>;
  totalEmissionsKg?: number;
  /** True when the provider returned no price and a random estimate was substituted. */
  isEstimated?: boolean;
  /** True when schedules are generated locally to simulate future-date searches. */
  isMock?: boolean;
  /** Deep link to provider checkout when available. */
  bookingUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PriceTrend {
  recommendation: "BUY" | "WAIT" | "MONITOR" | "NEUTRAL";
  /** Coefficient of variation of historical prices, normalised to 0–1. */
  volatility: number;
  sampleSize: number;
  meanPrice?: number;
  medianPrice?: number;
  minObservedPrice?: number;
  maxObservedPrice?: number;
  /** Percentage delta between latest observed and historical median. */
  changeVsMedianPct?: number;
  /** Most recently observed price for this route. Used by the Sniper for alert evaluation. */
  latestPrice?: number;
  currency?: string;
}

/** Mirrors the `price_alerts` Supabase table row. Snake-case matches DB column names exactly. */
export interface PriceAlert {
  id: string;
  user_id: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string | null;
  trip_type?: TripType;
  one_way?: boolean;
  /** User-set price ceiling in `currency`. Alert fires when market price ≤ this value. */
  target_price?: number;
  baseline_price?: number;
  currency: string;
  /**
   * Extra leniency window expressed as a percentage above `target_price`.
   * 0 = trigger only at or below target; 5 = trigger if price is within 5 % above target.
   */
  threshold_pct?: number;
  threshold_delta_pct?: number;
  last_price?: number | null;
  notified_at?: string | null;
  is_active: boolean;
  created_at: string;
}

