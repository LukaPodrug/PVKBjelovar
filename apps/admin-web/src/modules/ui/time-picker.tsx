import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

const hourOptions = Array.from({ length: 24 }, (_, index) => index);
const minuteOptions = Array.from({ length: 60 }, (_, index) => index);
const quickTimes = ["08:00", "09:00", "12:00", "16:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

export function TimePicker({
  value,
  onChange,
  className,
  disabled = false,
  required = false,
  placeholder = "hh:mm",
}: TimePickerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, width: 400 });
  const parsedTime = useMemo(() => parseTime(value), [value]);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePopoverPosition = () => {
      const controlRect = wrapperRef.current?.getBoundingClientRect();

      if (!controlRect) {
        return;
      }

      const width = Math.min(400, window.innerWidth - 24);
      const left = Math.min(Math.max(12, controlRect.left), window.innerWidth - width - 12);
      const preferredTop = controlRect.bottom + 8;
      const estimatedHeight = 520;
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

    const parsedValue = normalizeTime(nextDraftValue);

    if (parsedValue) {
      onChange(parsedValue);
    }
  };

  const selectTimePart = (part: "hour" | "minute", nextValue: number) => {
    const current = parsedTime ?? { hour: 18, minute: 0 };
    const nextTime =
      part === "hour"
        ? formatTime(nextValue, current.minute)
        : formatTime(current.hour, nextValue);

    onChange(nextTime);
    setDraftValue(nextTime);
  };

  const selectTime = (nextTime: string) => {
    onChange(nextTime);
    setDraftValue(nextTime);
  };

  const shiftHours = (amount: number) => {
    const current = parsedTime ?? { hour: 18, minute: 0 };
    const nextHour = (current.hour + amount + 24) % 24;
    selectTime(formatTime(nextHour, current.minute));
  };

  const shiftMinutes = (amount: number) => {
    const current = parsedTime ?? { hour: 18, minute: 0 };
    const totalMinutes = (current.hour * 60 + current.minute + amount + 24 * 60) % (24 * 60);
    const nextTime = formatTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
    selectTime(nextTime);
  };

  return (
    <div ref={wrapperRef} className="date-picker time-picker">
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
          onFocus={() => setIsOpen(true)}
          onChange={(event) => handleDraftChange(event.target.value)}
        />
        <button
          className="date-picker-toggle"
          type="button"
          disabled={disabled}
          aria-label="Otvori odabir vremena"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span aria-hidden="true">◷</span>
        </button>
      </div>

      {isOpen
        ? createPortal(
            <div className="admin-shell date-picker-portal-root">
              <div
                ref={popoverRef}
                className="date-picker-popover time-picker-popover"
                style={{
                  position: "fixed",
                  top: `${popoverPosition.top}px`,
                  left: `${popoverPosition.left}px`,
                  width: `${popoverPosition.width}px`,
                }}
              >
                <div className="time-picker-hero">
                  <div className="time-picker-preview">
                    <span>Odabrano vrijeme</span>
                    <strong>
                      {parsedTime ? formatTime(parsedTime.hour, parsedTime.minute) : "--:--"}
                    </strong>
                  </div>
                  <div className="time-picker-step-grid" aria-label="Brzo pomicanje vremena">
                    <button
                      className="time-picker-step"
                      type="button"
                      aria-label="Smanji vrijeme za jedan sat"
                      onClick={() => shiftHours(-1)}
                    >
                      -1 h
                    </button>
                    <button
                      className="time-picker-step"
                      type="button"
                      aria-label="Povećaj vrijeme za jedan sat"
                      onClick={() => shiftHours(1)}
                    >
                      +1 h
                    </button>
                    <button
                      className="time-picker-step"
                      type="button"
                      aria-label="Smanji vrijeme za jednu minutu"
                      onClick={() => shiftMinutes(-1)}
                    >
                      -1 min
                    </button>
                    <button
                      className="time-picker-step"
                      type="button"
                      aria-label="Povećaj vrijeme za jednu minutu"
                      onClick={() => shiftMinutes(1)}
                    >
                      +1 min
                    </button>
                  </div>
                </div>

                <div className="time-picker-manual-hint">
                  Možete i upisati točno vrijeme, npr. 21:37.
                </div>

                <div className="time-picker-presets" aria-label="Brzi odabir vremena">
                  {quickTimes.map((time) => (
                    <button
                      key={time}
                      className={`time-picker-preset ${value === time ? "is-selected" : ""}`}
                      type="button"
                      onClick={() => selectTime(time)}
                    >
                      {time}
                    </button>
                  ))}
                </div>

                <div className="time-picker-dials">
                  <TimeDial
                    label="Sati"
                    kind="hours"
                    options={hourOptions}
                    selectedValue={parsedTime?.hour ?? null}
                    onSelect={(hour) => selectTimePart("hour", hour)}
                  />
                  <TimeDial
                    label="Minute"
                    kind="minutes"
                    options={minuteOptions}
                    selectedValue={parsedTime?.minute ?? null}
                    onSelect={(minute) => selectTimePart("minute", minute)}
                  />
                </div>

                <button
                  className="time-picker-done"
                  type="button"
                  onClick={() => setIsOpen(false)}
                >
                  Gotovo
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function TimeDial({
  label,
  kind,
  options,
  selectedValue,
  onSelect,
}: {
  label: string;
  kind: "hours" | "minutes";
  options: number[];
  selectedValue: number | null;
  onSelect: (value: number) => void;
}) {
  const isHourDial = kind === "hours";
  const centerValue =
    selectedValue === null ? "--" : String(selectedValue).padStart(2, "0");

  return (
    <div className={`time-picker-dial time-picker-dial--${kind}`} role="group" aria-label={label}>
      <div className="time-picker-dial-center" aria-hidden="true">
        <strong>{centerValue}</strong>
        <span>{label}</span>
      </div>

      {options.map((option) => {
        const isSelected = selectedValue === option;
        const showLabel = isHourDial || option % 5 === 0 || isSelected;
        const angle = ((option / options.length) * 360) - 90;
        const hourRadius = option < 12 ? 0.38 : 0.5;
        const radius = isHourDial ? hourRadius : 0.45;
        const transform = `rotate(${angle}deg) translate(calc(var(--dial-size) * ${radius})) rotate(${-angle}deg)`;

        return (
          <button
            key={option}
            className={`time-picker-dial-option ${
              isSelected ? "is-selected" : ""
            } ${showLabel ? "has-label" : "is-tick"}`}
            style={{ transform }}
            type="button"
            aria-label={`${label}: ${String(option).padStart(2, "0")}`}
            onClick={() => onSelect(option)}
          >
            {showLabel ? String(option).padStart(2, "0") : ""}
          </button>
        );
      })}
    </div>
  );
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function normalizeTime(value: string) {
  const match = /^(\d{1,2}):?(\d{0,2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number((match[2] || "0").padEnd(2, "0"));

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return formatTime(hour, minute);
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
