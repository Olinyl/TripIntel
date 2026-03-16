import "server-only";

import { Duffel } from "@duffel/api";

import { getOfferDetails } from "@/lib/api/flights";

type UnknownRecord = Record<string, unknown>;

export interface PassengerInput {
  id: string;
  given_name: string;
  family_name: string;
  born_on: string;
  gender: "m" | "f";
  title: "mr" | "mrs" | "ms";
  email: string;
  phone_number: string;
}

export interface SelectedServiceInput {
  id: string;
  quantity: number;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asAmount(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toAmountString(value: number): string {
  return value.toFixed(2);
}

function computeOrderAmount(offer: UnknownRecord, services: SelectedServiceInput[]): string {
  const baseAmount = asAmount(offer.total_amount, 0);
  if (!services.length) {
    return toAmountString(baseAmount);
  }

  const availableServices = Array.isArray(offer.available_services)
    ? offer.available_services
    : [];
  const serviceById = new Map<string, UnknownRecord>();
  availableServices.forEach((entry) => {
    const service = asRecord(entry);
    const id = asString(service.id);
    if (id) serviceById.set(id, service);
  });

  const servicesTotal = services.reduce((sum, service) => {
    const matched = serviceById.get(service.id);
    if (!matched) return sum;
    const amount = asAmount(matched.total_amount, 0);
    return sum + amount * Math.max(1, service.quantity);
  }, 0);

  return toAmountString(baseAmount + servicesTotal);
}

function getDuffelClient(): Duffel {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("DUFFEL_ACCESS_TOKEN is not configured.");
  }
  return new Duffel({ token });
}

async function createDuffelCustomerUser(duffel: Duffel, passenger: PassengerInput): Promise<string | undefined> {
  try {
    const created = await duffel.identity.customerUsers.create({
      email: passenger.email,
      given_name: passenger.given_name,
      family_name: passenger.family_name,
      phone_number: passenger.phone_number,
    });
    const id = asString(created.data?.id);
    return id || undefined;
  } catch {
    return undefined;
  }
}

export async function createDuffelOrder(params: {
  offerId: string;
  passengers: PassengerInput[];
  services?: SelectedServiceInput[];
}): Promise<UnknownRecord> {
  const { offerId, passengers, services = [] } = params;
  if (!offerId) {
    throw new Error("offerId is required.");
  }

  if (!Array.isArray(passengers) || passengers.length === 0) {
    throw new Error("At least one passenger is required.");
  }

  const offer = await getOfferDetails(offerId);
  const totalAmount = computeOrderAmount(offer, services);
  const totalCurrency = asString(offer.total_currency, "USD");

  if (!totalAmount) {
    throw new Error("Offer total amount is missing. Please refresh and select a new offer.");
  }

  const duffel = getDuffelClient();
  const leadPassenger = passengers[0];
  const customerUserId = leadPassenger
    ? await createDuffelCustomerUser(duffel, leadPassenger)
    : undefined;

  const orderResponse = await duffel.orders.create({
    selected_offers: [offerId],
    type: "instant",
    passengers,
    ...(customerUserId ? { users: [customerUserId] } : {}),
    ...(services.length > 0 ? { services } : {}),
    payments: [
      {
        type: "balance",
        amount: totalAmount,
        currency: totalCurrency,
      },
    ],
  });

  return asRecord(orderResponse.data);
}
