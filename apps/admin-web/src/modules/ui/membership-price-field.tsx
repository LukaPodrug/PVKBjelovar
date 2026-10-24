/**
 * Individual monthly fee for a player. Left empty, the parent app suggests the player's category,
 * program or club fee instead, which is shown as the placeholder. During a free period nothing is
 * charged, and the fee here applies once it ends.
 */
export function MembershipPriceField({
  value,
  onChange,
  suggestedPriceCents,
  freeUntil,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestedPriceCents: number | null | undefined;
  freeUntil?: string | null;
}) {
  const suggestion =
    suggestedPriceCents === null || suggestedPriceCents === undefined
      ? null
      : formatEuroAmount(suggestedPriceCents);

  const feeHint = value.trim()
    ? "roditelji vide ovaj iznos u aplikaciji kod plaćanja."
    : suggestion
      ? `prazno znači predloženi iznos (${suggestion}).`
      : "prazno znači predloženi iznos kategorije ili kluba.";

  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
        Mjesečna članarina (€)
      </span>
      <input
        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={suggestion ? `Predloženo: ${suggestion}` : "Predložena članarina"}
      />
      <span className="mt-2 block text-xs text-muted">
        {freeUntil
          ? `Članarina je besplatna do ${formatIsoDate(freeUntil)}. Nakon toga ${feeHint}`
          : `${feeHint.charAt(0).toUpperCase()}${feeHint.slice(1)}`}
      </span>
    </label>
  );
}

/** Cents as an editable euro amount: 3000 -> "30", 3050 -> "30,50". */
export function centsToEuroInput(cents: number | null | undefined) {
  return cents === null || cents === undefined
    ? ""
    : (cents / 100).toFixed(2).replace(/\.00$/, "").replace(".", ",");
}

function formatIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}.${month}.${year}.`;
}

function formatEuroAmount(cents: number) {
  return new Intl.NumberFormat("hr-HR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
