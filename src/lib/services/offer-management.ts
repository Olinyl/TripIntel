type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asAmount(value: unknown, fallback = Number.POSITIVE_INFINITY): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getDurationMinutes(offer: UnknownRecord): number {
  const fromMinutes = offer.total_duration_in_minutes;
  if (typeof fromMinutes === "number" && Number.isFinite(fromMinutes) && fromMinutes > 0) {
    return fromMinutes;
  }

  const slices = Array.isArray(offer.slices) ? offer.slices : [];
  const firstSlice = asRecord(slices[0]);
  const sliceMinutes = firstSlice.duration_in_minutes;
  if (typeof sliceMinutes === "number" && Number.isFinite(sliceMinutes) && sliceMinutes > 0) {
    return sliceMinutes;
  }

  return Number.POSITIVE_INFINITY;
}

function getFareBrand(offer: UnknownRecord): string {
  const direct = asString(offer.fare_brand_name);
  if (direct) return direct;

  const metadata = asRecord(offer.metadata);
  const metadataBrand = asString(metadata.fare_brand_name);
  if (metadataBrand) return metadataBrand;

  const owner = asRecord(offer.owner);
  const ownerName = asString(owner.name);
  return ownerName ? `${ownerName} standard` : "Standard";
}

function computeBestValueScore(price: number, durationMinutes: number): number {
  const safePrice = Number.isFinite(price) ? price : 1_000_000;
  const safeDuration = Number.isFinite(durationMinutes) ? durationMinutes : 10_000;
  return safePrice + safeDuration * 0.42;
}

export function groupOffersByFareBrand(offers: unknown[]): Map<string, UnknownRecord[]> {
  const grouped = new Map<string, UnknownRecord[]>();

  offers.forEach((offerValue) => {
    const offer = asRecord(offerValue);
    const brand = getFareBrand(offer);
    const existing = grouped.get(brand) ?? [];
    existing.push(offer);
    grouped.set(brand, existing);
  });

  grouped.forEach((entries, brand) => {
    const sorted = [...entries].sort((left, right) => {
      const leftScore = computeBestValueScore(asAmount(left.total_amount), getDurationMinutes(left));
      const rightScore = computeBestValueScore(asAmount(right.total_amount), getDurationMinutes(right));
      return leftScore - rightScore;
    });
    grouped.set(brand, sorted);
  });

  return grouped;
}

export function groupAndSortOffersByBestValue(offers: unknown[]): UnknownRecord[] {
  const grouped = groupOffersByFareBrand(offers);
  const flattened = Array.from(grouped.values()).flat();

  return flattened.sort((left, right) => {
    const leftScore = computeBestValueScore(asAmount(left.total_amount), getDurationMinutes(left));
    const rightScore = computeBestValueScore(asAmount(right.total_amount), getDurationMinutes(right));
    return leftScore - rightScore;
  });
}

export function getOfferFareBrand(offer: unknown): string {
  return getFareBrand(asRecord(offer));
}

export function getOfferBestValueScore(offer: unknown): number {
  const normalized = asRecord(offer);
  return computeBestValueScore(asAmount(normalized.total_amount), getDurationMinutes(normalized));
}
