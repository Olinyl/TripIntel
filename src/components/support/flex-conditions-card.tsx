"use client";

type UnknownRecord = Record<string, unknown>;

interface FlexConditionsCardProps {
  title: string;
  source: UnknownRecord;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function formatPenalty(amount: unknown, currency: unknown): string {
  const amountText = asString(amount);
  const currencyText = asString(currency);

  if (!amountText) return "Penalty unknown";
  if (amountText === "0.00" || amountText === "0") return "No penalty";
  return `${currencyText || ""} ${amountText}`.trim();
}

function describeCondition(conditionValue: unknown, typeLabel: string): string {
  if (conditionValue === null || conditionValue === undefined) {
    return `${typeLabel}: unknown`;
  }

  const condition = asRecord(conditionValue);
  const allowed = condition.allowed;

  if (allowed === false) {
    return `${typeLabel}: not allowed`;
  }

  if (allowed === true) {
    return `${typeLabel}: allowed (${formatPenalty(condition.penalty_amount, condition.penalty_currency)})`;
  }

  return `${typeLabel}: unknown`;
}

export function FlexConditionsCard({ title, source }: FlexConditionsCardProps) {
  const conditions = asRecord(source.conditions);
  const slices = Array.isArray(source.slices) ? source.slices : [];

  const topLevelChange = describeCondition(conditions.change_before_departure, "Changes");
  const topLevelRefund = describeCondition(conditions.refund_before_departure, "Refunds");

  const sliceRows = slices
    .map((sliceValue, index) => {
      const slice = asRecord(sliceValue);
      const origin = asString(asRecord(slice.origin).iata_code, "?");
      const destination = asString(asRecord(slice.destination).iata_code, "?");
      const sliceConditions = asRecord(slice.conditions);
      const changeText = describeCondition(sliceConditions.change_before_departure, "Changes");

      return {
        id: asString(slice.id, `slice-${index}`),
        route: `${origin} -> ${destination}`,
        changeText,
      };
    })
    .filter((slice) => slice.route !== "? -> ?");

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <p className="mt-2 text-xs text-zinc-300">{topLevelChange}</p>
      <p className="mt-1 text-xs text-zinc-300">{topLevelRefund}</p>
      <p className="mt-2 text-[11px] text-zinc-500">
        Airline conditions may still include fare difference charges and can change after departure.
      </p>

      {sliceRows.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-black/30 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Slice-level change rules</p>
          {sliceRows.map((slice) => (
            <p key={slice.id} className="text-xs text-zinc-300">
              {slice.route}: {slice.changeText}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
