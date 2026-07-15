import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface CategoryFilterItem {
  id: string;
  name: string;
  playerCount?: number;
}

interface CategoryFilterDropdownProps {
  categories: CategoryFilterItem[];
  extraOptions?: CategoryFilterItem[];
  selectedIds: string[];
  label?: string;
  emptyLabel?: string;
  hideClear?: boolean;
  onToggle: (id: string) => void;
  onClear: () => void;
}

interface SingleSelectDropdownProps {
  options: CategoryFilterItem[];
  selectedId: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}

export function CategoryFilterDropdown({
  categories,
  extraOptions = [],
  selectedIds,
  label = "Kategorije",
  emptyLabel = "Sve kategorije",
  hideClear = false,
  onToggle,
  onClear,
}: CategoryFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 280 });
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dropdownId = useId();
  const options = useMemo(() => [...extraOptions, ...categories], [categories, extraOptions]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIds.includes(option.id)),
    [options, selectedIds],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const trigger = dropdownRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const maxMenuHeight = 288;
      const menuWidth = Math.min(rect.width, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - menuWidth - 12),
      );
      const preferredTop = rect.bottom + 8;
      const opensAbove = preferredTop + maxMenuHeight > window.innerHeight - 12;
      const top = opensAbove
        ? Math.max(12, rect.top - maxMenuHeight - 8)
        : preferredTop;

      setMenuPosition({ left, top, width: menuWidth });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        !dropdownRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updateMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  if (options.length === 0) {
    return null;
  }

  const summary =
    selectedOptions.length === 0
      ? emptyLabel
      : selectedOptions.length === 1
        ? selectedOptions[0]?.name
        : `${selectedOptions.length} opcije odabrane`;

  return (
    <div ref={dropdownRef} className="relative min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
          {label}
        </label>
      </div>

      <div className="flex h-[52px] w-full items-center gap-2 rounded-[18px] border border-line bg-surface px-4 transition focus-within:bg-bg hover:bg-bg">
        {selectedOptions.length > 0 ? (
          <div className="category-filter-selected-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {selectedOptions.map((option) => (
              <span
                key={option.id}
                className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-panel px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink"
              >
                {option.name}
                <button
                  className="grid h-5 w-5 place-items-center rounded-full bg-white text-base font-black leading-none text-muted transition hover:text-ink"
                  type="button"
                  aria-label={`Ukloni ${option.name}`}
                  onClick={() => onToggle(option.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <button
            id={dropdownId}
            className="min-w-0 flex-1 text-left outline-none"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            <span className="block truncate text-[11px] font-bold uppercase tracking-[0.14em]">
              {summary}
            </span>
          </button>
        )}
        <button
          className={`relative h-8 w-8 shrink-0 rounded-full bg-panel transition ${
            isOpen ? "rotate-180" : ""
          }`}
          type="button"
          aria-label={isOpen ? "Zatvori filter kategorija" : "Otvori filter kategorija"}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span
            className="absolute left-1/2 top-[44%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b-2 border-r-2 border-accent"
            aria-hidden="true"
          />
        </button>
        {selectedOptions.length > 0 && !hideClear ? (
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-muted transition hover:text-ink"
            type="button"
            aria-label="Očisti filter kategorija"
            onClick={onClear}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v5" />
              <path d="M14 11v5" />
            </svg>
          </button>
        ) : null}
      </div>

      {isOpen
        ? createPortal(
            <div className="admin-shell category-filter-portal-root">
              <div
                ref={menuRef}
                className="z-50 overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_22px_60px_rgba(15,23,42,0.16)]"
                role="listbox"
                aria-multiselectable="true"
                style={{
                  left: menuPosition.left,
                  position: "fixed",
                  top: menuPosition.top,
                  width: menuPosition.width,
                }}
              >
                <div className="max-h-72 overflow-y-auto p-2">
                  {options.map((option) => {
                    const isSelected = selectedIds.includes(option.id);

                    return (
                      <button
                        key={option.id}
                        className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-3 text-left outline-none ${
                          isSelected ? "bg-panel" : "bg-white"
                        }`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => onToggle(option.id)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                              isSelected ? "border-accent bg-white" : "border-line bg-white"
                            }`}
                            aria-hidden="true"
                          >
                            {isSelected ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                            ) : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold uppercase">
                              {option.name}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function SingleSelectDropdown({
  options,
  selectedId,
  label,
  placeholder = "Odaberite opciju",
  disabled = false,
  onChange,
}: SingleSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 280 });
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dropdownId = useId();
  const selectedOption = options.find((option) => option.id === selectedId) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const trigger = dropdownRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const maxMenuHeight = 288;
      const menuWidth = Math.min(rect.width, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - menuWidth - 12),
      );
      const preferredTop = rect.bottom + 8;
      const opensAbove = preferredTop + maxMenuHeight > window.innerHeight - 12;
      const top = opensAbove
        ? Math.max(12, rect.top - maxMenuHeight - 8)
        : preferredTop;

      setMenuPosition({ left, top, width: menuWidth });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!dropdownRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    updateMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
          {label}
        </label>
      </div>

      <button
        id={dropdownId}
        className="flex h-[52px] w-full items-center gap-2 rounded-[18px] border border-line bg-surface px-4 text-left transition focus:bg-bg hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.14em]">
          {selectedOption?.name ?? placeholder}
        </span>
        <span
          className={`relative h-8 w-8 shrink-0 rounded-full bg-panel transition ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <span className="absolute left-1/2 top-[44%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b-2 border-r-2 border-accent" />
        </span>
      </button>

      {isOpen
        ? createPortal(
            <div className="admin-shell category-filter-portal-root">
              <div
                ref={menuRef}
                className="z-50 overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_22px_60px_rgba(15,23,42,0.16)]"
                role="listbox"
                style={{
                  left: menuPosition.left,
                  position: "fixed",
                  top: menuPosition.top,
                  width: menuPosition.width,
                }}
              >
                <div className="max-h-72 overflow-y-auto p-2">
                  {options.map((option) => {
                    const isSelected = option.id === selectedId;

                    return (
                      <button
                        key={option.id}
                        className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-3 text-left outline-none ${
                          isSelected ? "bg-panel" : "bg-white"
                        }`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(option.id);
                          setIsOpen(false);
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                              isSelected ? "border-accent bg-white" : "border-line bg-white"
                            }`}
                            aria-hidden="true"
                          >
                            {isSelected ? (
                              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                            ) : null}
                          </span>
                          <span className="block min-w-0 truncate text-sm font-bold uppercase">
                            {option.name}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
