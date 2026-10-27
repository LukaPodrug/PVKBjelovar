import type { SwimmingAbility } from "../core/types";

/** Same wording parents pick from on the landing signup form. */
export const swimmingAbilityLabels: Record<SwimmingAbility, string> = {
  CAN_SWIM: "Zna plivati",
  PARTIAL: "Djelomično, snalazi se u vodi",
  CANNOT_SWIM: "Ne zna plivati",
};

export function formatSwimmingAbility(value: SwimmingAbility | null | undefined) {
  return value ? swimmingAbilityLabels[value] : "Nije uneseno";
}

/** A player's swimming level; coaches update it as the kid improves. */
export function SwimmingAbilityField({
  value,
  onChange,
}: {
  value: SwimmingAbility | "";
  onChange: (value: SwimmingAbility | "") => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
        Plivanje
      </span>
      <select
        className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
        value={value}
        onChange={(event) => onChange(event.target.value as SwimmingAbility | "")}
      >
        <option value="">Nije uneseno</option>
        {(Object.keys(swimmingAbilityLabels) as SwimmingAbility[]).map((ability) => (
          <option key={ability} value={ability}>
            {swimmingAbilityLabels[ability]}
          </option>
        ))}
      </select>
    </label>
  );
}
