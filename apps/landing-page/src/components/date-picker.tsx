import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

const weekDayLabels = ["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"];

export function DatePicker({
  value,
  onChange,
  className,
  disabled = false,
  required = false,
  placeholder = "dd.mm.yyyy.",
}: DatePickerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(formatDisplayDate(value));
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialMonth(value));
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, width: 330 });
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(formatDisplayDate(value));
    }

    if (value) {
      setVisibleMonth(getInitialMonth(value));
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePopoverPosition = () => {
      const controlRect = wrapperRef.current?.getBoundingClientRect();

      if (!controlRect) {
        return;
      }

      const width = Math.min(330, window.innerWidth - 24);
      const left = Math.min(Math.max(12, controlRect.left), window.innerWidth - width - 12);
      const preferredTop = controlRect.bottom + 8;
      const estimatedHeight = 360;
      const shouldOpenAbove = preferredTop + estimatedHeight > window.innerHeight - 12;
      const top = shouldOpenAbove
        ? Math.max(12, controlRect.top - estimatedHeight - 8)
        : preferredTop;

      setPopoverPosition({ top, left, width });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        !wrapperRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    updatePopoverPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  const handleDraftChange = (nextDraftValue: string) => {
    setDraftValue(nextDraftValue);

    if (nextDraftValue.trim() === "") {
      onChange("");
      return;
    }

    const parsedValue = parseDisplayDate(nextDraftValue);

    if (parsedValue) {
      onChange(parsedValue);
    } else {
      onChange("");
    }
  };

  const selectDate = (date: Date) => {
    const nextValue = toIsoDateValue(date);
    onChange(nextValue);
    setDraftValue(formatDisplayDate(nextValue));
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="date-picker">
      <div className="date-picker-control">
        <input
          className={`${className ?? ""} date-picker-input`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={draftValue}
          disabled={disabled}
          aria-required={required}
          onFocus={() => {
            setIsEditing(true);
            setIsOpen(true);
          }}
          onBlur={() => setIsEditing(false)}
          onChange={(event) => handleDraftChange(event.target.value)}
        />
        <button
          className="date-picker-toggle"
          type="button"
          disabled={disabled}
          aria-label="Otvori kalendar"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span aria-hidden="true">▦</span>
        </button>
      </div>

      {isOpen
        ? createPortal(
        <div className="landing-page date-picker-portal-root">
        <div
          ref={popoverRef}
          className="date-picker-popover"
          style={{
            position: "fixed",
            top: `${popoverPosition.top}px`,
            left: `${popoverPosition.left}px`,
            width: `${popoverPosition.width}px`,
          }}
        >
          <div className="date-picker-header">
            <button
              className="date-picker-nav date-picker-nav--year"
              type="button"
              aria-label="Prethodna godina"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear() - 1, current.getMonth(), 1),
                )
              }
            >
              ‹‹
            </button>
            <button
              className="date-picker-nav"
              type="button"
              aria-label="Prethodni mjesec"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
            >
              ‹
            </button>
            <p>{formatMonthLabel(visibleMonth)}</p>
            <button
              className="date-picker-nav"
              type="button"
              aria-label="Sljedeći mjesec"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
            >
              ›
            </button>
            <button
              className="date-picker-nav date-picker-nav--year"
              type="button"
              aria-label="Sljedeća godina"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear() + 1, current.getMonth(), 1),
                )
              }
            >
              ››
            </button>
          </div>

          <div className="date-picker-grid date-picker-weekdays">
            {weekDayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="date-picker-grid">
            {calendarDays.map((date) => {
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              const isOutsideMonth = date.getMonth() !== visibleMonth.getMonth();

              return (
                <button
                  key={date.toISOString()}
                  className={`date-picker-day ${isSelected ? "is-selected" : ""} ${
                    isOutsideMonth ? "is-outside" : ""
                  }`}
                  type="button"
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
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

function getInitialMonth(value: string) {
  const date = parseIsoDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDisplayDate(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})\.?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return toIsoDateValue(date);
}

function formatDisplayDate(value: string) {
  const date = parseIsoDate(value);

  if (!date) {
    return "";
  }

  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

function formatMonthLabel(date: Date) {
  return `${`${date.getMonth() + 1}`.padStart(2, "0")}.${date.getFullYear()}.`;
}

function toIsoDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_item, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
