import { useDeferredValue, useState } from "react";

interface SearchMultiSelectItem {
  id: string;
  label: string;
  meta: string;
  keywords?: string[];
}

interface SearchMultiSelectPanelProps {
  title: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  items: SearchMultiSelectItem[];
  selectedItems?: SearchMultiSelectItem[];
  selectedIds: string[];
  disabled?: boolean;
  isSearching?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onToggle: (id: string) => void;
}

export function SearchMultiSelectPanel({
  title,
  searchPlaceholder,
  noResultsLabel,
  items,
  selectedItems: selectedItemsOverride,
  selectedIds,
  disabled = false,
  isSearching = false,
  searchValue: controlledSearchValue,
  onSearchChange,
  onToggle,
}: SearchMultiSelectPanelProps) {
  const [internalSearchValue, setInternalSearchValue] = useState("");
  const searchValue = controlledSearchValue ?? internalSearchValue;
  const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
  const isServerFiltered = Boolean(onSearchChange);

  const selectedItems =
    selectedItemsOverride ?? items.filter((item) => selectedIds.includes(item.id));
  const matchingItems =
    deferredSearchValue.length > 0
      ? isServerFiltered
        ? items.slice(0, 8)
        : items
            .filter((item) => {
              const haystack = [item.label, item.meta, ...(item.keywords ?? [])]
                .join(" ")
                .toLowerCase();

              return haystack.includes(deferredSearchValue);
            })
            .slice(0, 8)
      : [];

  function handleSearchChange(value: string) {
    setInternalSearchValue(value);
    onSearchChange?.(value);
  }

  return (
    <div className={`border-2 border-line bg-white ${disabled ? "opacity-70" : ""}`}>
      <div className="border-b-2 border-line bg-bg px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{title}</p>
      </div>

      <div className="space-y-4 p-4">
        {selectedItems.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
              Odabrano
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedItems.map((item) => (
                <button
                  key={item.id}
                  className="flex items-start justify-between gap-3 border-2 border-line bg-panel px-3 py-3 text-left"
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(item.id)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold uppercase">{item.label}</span>
                    <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                      {item.meta}
                    </span>
                  </span>
                  <span className="ui-pill ui-pill--outline shrink-0">Ukloni</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
            Pretraga
          </span>
          <input
            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
            type="search"
            disabled={disabled}
            value={searchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>

        {deferredSearchValue.length === 0 ? null : isSearching ? (
          <div className="rounded-[18px] border border-dashed border-line bg-bg px-4 py-4 text-sm leading-7 text-muted">
            Pretraživanje...
          </div>
        ) : matchingItems.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-line bg-bg px-4 py-4 text-sm leading-7 text-muted">
            {noResultsLabel}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
              Rezultati
            </p>
            <div className="grid gap-3">
              {matchingItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);

                return (
                  <button
                  key={item.id}
                  className={`flex items-start justify-between gap-3 border-2 border-line px-3 py-3 text-left ${
                    isSelected ? "bg-panel" : "bg-surface"
                  }`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(item.id)}
                >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold uppercase">{item.label}</span>
                      <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                        {item.meta}
                      </span>
                    </span>
                    <span
                      className={`ui-pill shrink-0 ${
                        isSelected ? "ui-pill--panel" : "ui-pill--accent"
                      }`}
                    >
                      {isSelected ? "Odabrano" : "Dodaj"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
