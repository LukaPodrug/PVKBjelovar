/**
 * Badge text for a category that has no logo.
 *
 * A short name like "U12" reads better kept whole than reduced to a single letter, so anything up
 * to three characters is shown as-is and only longer names collapse to initials.
 */
export function createCategoryMonogram(name: string) {
  const trimmed = name.trim();

  if (trimmed.length <= 3) {
    return trimmed.toUpperCase();
  }

  return (
    trimmed
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PV"
  );
}
