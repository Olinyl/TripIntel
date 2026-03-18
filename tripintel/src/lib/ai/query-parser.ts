import "server-only";

import { GoogleGenAI } from "@google/genai";

import type { CabinClass, TripIntent, TripType } from "@/lib/domain/types";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CABIN_VALUES: CabinClass[] = ["economy", "premium_economy", "business", "first"];
const TRIP_TYPE_VALUES: TripType[] = ["one_way", "round_trip"];

type UnknownRecord = Record<string, unknown>;

function parseModelJson(rawText: string): UnknownRecord {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model response is not a JSON object.");
  }
  return parsed as UnknownRecord;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function toOptionalNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : undefined;
}

function normalizeDate(value: unknown, fieldName: string): string {
  const date = toOptionalString(value);
  if (!date || !ISO_DATE_REGEX.test(date)) {
    throw new Error(`Invalid or missing ${fieldName}. Expected YYYY-MM-DD.`);
  }
  return date;
}

function toUtcDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftToFutureDate(isoDate: string): string {
  const parsed = toUtcDateOnly(isoDate);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (parsed >= todayUtc) {
    return isoDate;
  }

  const shifted = new Date(parsed);
  shifted.setUTCFullYear(todayUtc.getUTCFullYear());

  // If the same month/day has already passed this year, roll to next year.
  if (shifted < todayUtc) {
    shifted.setUTCFullYear(todayUtc.getUTCFullYear() + 1);
  }

  return toIsoDateOnly(shifted);
}

function normalizeTripIntent(payload: UnknownRecord): TripIntent {
  const origin = toOptionalString(payload.origin)?.toUpperCase();
  const destination = toOptionalString(payload.destination)?.toUpperCase();

  if (!origin || !destination) {
    throw new Error("Both origin and destination are required.");
  }

  const departureDate = shiftToFutureDate(normalizeDate(payload.departureDate, "departureDate"));

  const returnDateRaw = payload.returnDate;
  let returnDate: string | null | undefined;
  if (returnDateRaw === null || returnDateRaw === undefined || returnDateRaw === "") {
    returnDate = null;
  } else {
    returnDate = shiftToFutureDate(normalizeDate(returnDateRaw, "returnDate"));
    if (toUtcDateOnly(returnDate) < toUtcDateOnly(departureDate)) {
      const adjusted = toUtcDateOnly(departureDate);
      adjusted.setUTCDate(adjusted.getUTCDate() + 7);
      returnDate = toIsoDateOnly(adjusted);
    }
  }

  const tripTypeRaw = toOptionalString(payload.tripType) as TripType | undefined;
  const tripType = TRIP_TYPE_VALUES.includes(tripTypeRaw as TripType)
    ? (tripTypeRaw as TripType)
    : returnDate
      ? "round_trip"
      : "one_way";

  const passengers = toOptionalPositiveInt(payload.passengers) ?? 1;

  const cabinRaw = toOptionalString(payload.cabin) as CabinClass | undefined;
  const cabin = CABIN_VALUES.includes(cabinRaw as CabinClass) ? (cabinRaw as CabinClass) : undefined;

  const maxBudget =
    typeof payload.maxBudget === "number" && Number.isFinite(payload.maxBudget) && payload.maxBudget > 0
      ? payload.maxBudget
      : undefined;

  const currencyRaw = toOptionalString(payload.currency);
  const currency = currencyRaw ? currencyRaw.toUpperCase() : undefined;

  const vibeKeywords = Array.isArray(payload.vibeKeywords)
    ? payload.vibeKeywords
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : undefined;

  const flexibleDays = toOptionalNonNegativeInt(payload.flexibleDays);

  return {
    origin,
    destination,
    departureDate,
    returnDate,
    tripType,
    passengers,
    cabin,
    maxBudget,
    currency,
    vibeKeywords,
    flexibleDays,
  };
}

function createPrompt(query: string): string {
  return [
    "Convert the user travel request into one JSON object matching this TypeScript interface:",
    "TripIntent {",
    '  origin: string; // 3-letter IATA code, uppercase',
    '  destination: string; // 3-letter IATA code, uppercase',
    '  departureDate: string; // YYYY-MM-DD',
    '  returnDate?: string | null; // YYYY-MM-DD or null',
    '  tripType: "one_way" | "round_trip";',
    "  passengers: number; // integer >= 1",
    '  cabin?: "economy" | "premium_economy" | "business" | "first";',
    "  maxBudget?: number;",
    "  currency?: string; // 3-letter currency code",
    "  vibeKeywords?: string[];",
    "  flexibleDays?: number; // integer >= 0",
    "}",
    "",
    "Rules:",
    "- Output strict JSON only. No markdown or code fences.",
    "- Infer missing optional values only when confidence is high.",
    "- If return date is not provided, set returnDate to null and tripType to one_way.",
    "- Resolve dates to ISO format YYYY-MM-DD.",
    "",
    `User query: ${query}`,
  ].join("\n");
}

export async function parseNaturalLanguageQuery(query: string): Promise<TripIntent> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not configured.");
  }

  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Query is required.");
  }

  const ai = new GoogleGenAI({ apiKey });
  console.log("🧠 Gemini Engine: Active and processing query...");

  let text: string;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: createPrompt(trimmed) }] }],
    });
    text = response.text ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[QueryParser] Gemini generateContent failed:", message);
    if (stack) console.error(stack);
    throw new Error(`Gemini request failed: ${message}`);
  }

  try {
    const parsed = parseModelJson(text);
    return normalizeTripIntent(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse model response.";
    throw new Error(`Unable to parse query into TripIntent: ${message}`);
  }
}
