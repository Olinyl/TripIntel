import "server-only";

import { Duffel } from "@duffel/api";

type UnknownRecord = Record<string, unknown>;

export interface OrderServiceInput {
  id: string;
  quantity: number;
}

export interface ChangeSliceInput {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class?: "economy" | "premium_economy" | "business" | "first";
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

function getDuffelClient(): Duffel {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("DUFFEL_ACCESS_TOKEN is not configured.");
  }
  return new Duffel({ token });
}

export async function getDuffelOrder(orderId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orders.get(orderId);
  return asRecord(response.data);
}

export async function createAssistantClientKey(params: {
  userId: string;
  orderId?: string;
}): Promise<string> {
  const duffel = getDuffelClient();
  const payload = params.orderId
    ? { user_id: params.userId, order_id: params.orderId }
    : { user_id: params.userId };
  const response = await duffel.identity.componentClientKeys.create(payload);
  const key = asString(response.data?.component_client_key);
  if (!key) throw new Error("Unable to create assistant client key.");
  return key;
}

export async function createOrderCancellationQuote(orderId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orderCancellations.create({ order_id: orderId });
  return asRecord(response.data);
}

export async function confirmOrderCancellation(cancellationId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orderCancellations.confirm(cancellationId);
  return asRecord(response.data);
}

export async function listAvailableOrderServices(orderId: string): Promise<UnknownRecord[]> {
  const duffel = getDuffelClient();
  const response = await duffel.orders.getAvailableServices(orderId);
  const services = Array.isArray(response.data) ? response.data : [];
  return services.map((service) => asRecord(service));
}

export async function addPostBookingServices(orderId: string, services: OrderServiceInput[]): Promise<UnknownRecord> {
  if (services.length === 0) {
    throw new Error("At least one service must be selected.");
  }

  const availableServices = await listAvailableOrderServices(orderId);
  const serviceById = new Map<string, UnknownRecord>();
  availableServices.forEach((service) => {
    const id = asString(service.id);
    if (id) serviceById.set(id, service);
  });

  let currency = "USD";
  const total = services.reduce((sum, service) => {
    const matched = serviceById.get(service.id);
    if (!matched) return sum;
    const amount = asAmount(matched.total_amount, 0);
    currency = asString(matched.total_currency, currency);
    return sum + amount * Math.max(1, service.quantity);
  }, 0);

  if (total <= 0) {
    throw new Error("Selected services are invalid or have no payable amount.");
  }

  const duffel = getDuffelClient();
  const response = await duffel.orders.addServices(orderId, {
    payment: {
      type: "balance",
      currency,
      amount: toAmountString(total),
    },
    add_services: services.map((service) => ({
      id: service.id,
      quantity: Math.max(1, service.quantity),
    })),
  });

  return asRecord(response.data);
}

export async function createOrderChangeRequest(params: {
  orderId: string;
  removeSliceIds: string[];
  addSlices: ChangeSliceInput[];
}): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orderChangeRequests.create({
    order_id: params.orderId,
    slices: {
      remove: params.removeSliceIds.map((sliceId) => ({ slice_id: sliceId })),
      add: params.addSlices,
    },
  });
  return asRecord(response.data);
}

export async function getOrderChangeRequest(changeRequestId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orderChangeRequests.get(changeRequestId);
  return asRecord(response.data);
}

export async function createPendingOrderChange(selectedOrderChangeOfferId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orderChanges.create({
    selected_order_change_offer: selectedOrderChangeOfferId,
  });
  return asRecord(response.data);
}

export async function getOrderChange(orderChangeId: string): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const response = await duffel.orderChanges.get(orderChangeId);
  return asRecord(response.data);
}

export async function confirmOrderChange(params: {
  orderChangeId: string;
  amount?: string;
  currency?: string;
}): Promise<UnknownRecord> {
  const duffel = getDuffelClient();
  const hasPayment = Boolean(params.amount && params.currency);
  const response = await duffel.orderChanges.confirm(
    params.orderChangeId,
    hasPayment
      ? {
          payment: {
            type: "balance",
            amount: params.amount ?? "0.00",
            currency: params.currency ?? "USD",
          },
        }
      : {},
  );
  return asRecord(response.data);
}
