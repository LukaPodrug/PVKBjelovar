import { useState } from "react";
import { useDebouncedValue } from "./use-debounced-value";

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
  className?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onAction?: () => void;
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
  className,
  actionLabel,
  actionDisabled = false,
  searchValue: controlledSearchValue,
  onSearchChange,
  onAction,
  onToggle,
}: SearchMultiSelectPanelProps) {
  const [internalSearchValue, setInternalSearchValue] = useState("");
  const searchValue = controlledSearchValue ?? internalSearchValue;
  const debouncedSearchValue = useDebouncedValue(searchValue.trim().toLowerCase());
  const isServerFiltered = Boolean(onSearchChange);

  const selectedItems =
    selectedItemsOverride ?? items.filter((item) => selectedIds.includes(item.id));
  const matchingItems =
    debouncedSearchValue.length > 0
      ? isServerFiltered
        ? items.slice(0, 8)
        : items
            .filter((item) => {
              const haystack = [item.label, item.meta, ...(item.keywords ?? [])]
                .join(" ")
                .toLowerCase();

              return haystack.includes(debouncedSearchValue);
            })
            .slice(0, 8)
      : [];

  function handleSearchChange(value: string) {
    setInternalSearchValue(value);
    onSearchChange?.(value);
  }

  return (
    <div className={`${className ?? "border-2 border-line bg-white"} ${disabled ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3 border-b-2 border-line bg-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{title}</p>
        {actionLabel && onAction ? (
          <button
            className="ui-pill ui-pill-button ui-pill--accent self-start sm:self-auto"
            type="button"
            disabled={disabled || actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
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

        {debouncedSearchValue.length === 0 ? null : isSearching ? (
          <div className="rounded-[18px] border border-dashed border-line bg-bg px-4 py-4">
            <div className="grid animate-pulse gap-3">
              <div className="h-5 w-32 rounded-full bg-panel" />
              <div className="h-10 rounded-[14px] bg-panel" />
              <div className="h-10 rounded-[14px] bg-panel" />
            </div>
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
                  className={`flex items-center justify-between gap-3 border-2 border-line px-3 py-3 text-left ${
                    isSelected ? "bg-panel" : "bg-surface"
                  }`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(item.id)}
                >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold uppercase">{item.label}</span>
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

        {selectedItems.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
              Odabrano
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[18px] border-2 border-line bg-panel px-3 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold uppercase">{item.label}</span>
                  </span>
                  <button
                    className="ui-pill ui-pill-button ui-pill--outline shrink-0"
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(item.id)}
                  >
                    Ukloni
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
