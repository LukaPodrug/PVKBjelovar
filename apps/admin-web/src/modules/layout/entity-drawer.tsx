import { type ReactNode, useEffect, useId } from "react";

interface EntityDrawerProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}

export function EntityDrawer({
  open,
  title,
  eyebrow,
  description,
  closeLabel = "Zatvori",
  onClose,
  children,
}: EntityDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
      />

      <aside
        className="entity-drawer-panel absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-hidden border-l border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(243,247,251,0.98)_100%)] shadow-[0_28px_64px_rgba(15,23,42,0.2)] sm:w-[min(96vw,1040px)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-white/92 px-5 py-4 backdrop-blur-md sm:px-6 sm:py-5">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                {eyebrow}
              </p>
            ) : null}
            <h3 id={titleId} className="mt-2 text-2xl font-bold text-ink sm:text-[2rem]">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                {description}
              </p>
            ) : null}
          </div>

          <button
            className="ui-pill ui-pill-button ui-pill--outline shrink-0"
            type="button"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <div className="space-y-4">{children}</div>
        </div>
      </aside>
    </div>
  );
}
