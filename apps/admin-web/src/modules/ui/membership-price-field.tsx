/**
 * Individual monthly fee for a player. Left empty, the parent app suggests the player's program fee
 * or the club membership fee instead, which is shown as the placeholder.
 */
export function MembershipPriceField({
  value,
  onChange,
  suggestedPriceCents,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestedPriceCents: number | null | undefined;
}) {
  const suggestion =
    suggestedPriceCents === null || suggestedPriceCents === undefined
      ? null
      : formatEuroAmount(suggestedPriceCents);

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
        {value.trim()
          ? "Ovaj iznos roditelji vide u aplikaciji kod plaćanja."
          : suggestion
            ? `Prazno: roditelji vide predloženi iznos (${suggestion}).`
            : "Prazno: roditelji vide predloženi iznos programa ili kluba."}
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

function formatEuroAmount(cents: number) {
  return new Intl.NumberFormat("hr-HR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
