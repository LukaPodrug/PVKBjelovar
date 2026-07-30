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
  const [activePart, setActivePart] = useState<"hour" | "minute">("hour");
  const [pickerDraft, setPickerDraft] = useState(() => parseTime(value) ?? { hour: 18, minute: 0 });
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, width: 360 });
  const parsedTime = useMemo(() => parseTime(value), [value]);

  useEffect(() => {
    setDraftValue(value);

    if (parsedTime) {
      setPickerDraft(parsedTime);
    }
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

      const width = Math.min(360, window.innerWidth - 24);
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
        setDraftValue(value);
        setPickerDraft(parsedTime ?? { hour: 18, minute: 0 });
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
  }, [isOpen, parsedTime, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActivePart("hour");
    setPickerDraft(parsedTime ?? { hour: 18, minute: 0 });
  }, [isOpen, parsedTime]);

  const handleDraftChange = (nextDraftValue: string) => {
    setDraftValue(nextDraftValue);

    if (nextDraftValue.trim() === "") {
      onChange("");
      return;
    }

    const parsedValue = normalizeTime(nextDraftValue);

    if (parsedValue) {
      onChange(parsedValue);
      setPickerDraft(parseTime(parsedValue) ?? { hour: 18, minute: 0 });
    }
  };

  const selectTimePart = (part: "hour" | "minute", nextValue: number) => {
    const nextDraft =
      part === "hour"
        ? { ...pickerDraft, hour: nextValue }
        : { ...pickerDraft, minute: nextValue };
    const nextTime = formatTime(nextDraft.hour, nextDraft.minute);

    setPickerDraft(nextDraft);
    setDraftValue(nextTime);

    if (part === "hour") {
      setActivePart("minute");
    }
  };

  const cancelPicker = () => {
    setDraftValue(value);
    setPickerDraft(parsedTime ?? { hour: 18, minute: 0 });
    setIsOpen(false);
  };

  const commitPicker = () => {
    const nextTime = formatTime(pickerDraft.hour, pickerDraft.minute);

    onChange(nextTime);
    setDraftValue(nextTime);
    setIsOpen(false);
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
                <div className="time-picker-card-header">
                  <span>Odabir vremena</span>
                  <div className="time-picker-time-display" aria-label="Odabrano vrijeme">
                    <button
                      className={`time-picker-time-part ${activePart === "hour" ? "is-active" : ""}`}
                      type="button"
                      aria-label="Odaberi sate"
                      onClick={() => setActivePart("hour")}
                    >
                      {String(pickerDraft.hour).padStart(2, "0")}
                    </button>
                    <strong>:</strong>
                    <button
                      className={`time-picker-time-part ${activePart === "minute" ? "is-active" : ""}`}
                      type="button"
                      aria-label="Odaberi minute"
                      onClick={() => setActivePart("minute")}
                    >
                      {String(pickerDraft.minute).padStart(2, "0")}
                    </button>
                  </div>
                </div>

                <TimeClockFace
                  activePart={activePart}
                  selectedHour={pickerDraft.hour}
                  selectedMinute={pickerDraft.minute}
                  onSelect={(nextValue) => selectTimePart(activePart, nextValue)}
                />

                <div className="time-picker-actions">
                  <button className="time-picker-text-button" type="button" onClick={cancelPicker}>
                    Odustani
                  </button>
                  <button className="time-picker-text-button" type="button" onClick={commitPicker}>
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function TimeClockFace({
  activePart,
  selectedHour,
  selectedMinute,
  onSelect,
}: {
  activePart: "hour" | "minute";
  selectedHour: number;
  selectedMinute: number;
  onSelect: (value: number) => void;
}) {
  const isHourMode = activePart === "hour";
  const options = isHourMode ? hourOptions : minuteOptions;
  const selectedValue = isHourMode ? selectedHour : selectedMinute;
  const selectedAngle = getClockAngle(activePart, selectedValue);
  const selectedRadius = getClockRadius(activePart, selectedValue);

  return (
    <div
      className={`time-picker-clock-face time-picker-clock-face--${activePart}`}
      role="group"
      aria-label={isHourMode ? "Odabir sata" : "Odabir minuta"}
    >
      <div className="time-picker-clock-hand-wrap" aria-hidden="true">
        <span
          className="time-picker-clock-hand"
          style={{
            transform: `rotate(${selectedAngle}deg)`,
            width: `calc(var(--clock-size) * ${selectedRadius})`,
          }}
        />
        <span className="time-picker-clock-pin" />
      </div>

      {options.map((option) => {
        const isSelected = selectedValue === option;
        const showLabel = isHourMode || option % 5 === 0 || isSelected;
        const angle = getClockAngle(activePart, option);
        const radius = getClockRadius(activePart, option);
        const transform = `rotate(${angle}deg) translate(calc(var(--clock-size) * ${radius})) rotate(${-angle}deg)`;

        return (
          <button
            key={option}
            className={`time-picker-clock-option ${
              isSelected ? "is-selected" : ""
            } ${showLabel ? "has-label" : "is-tick"}`}
            style={{ transform }}
            type="button"
            aria-label={`${isHourMode ? "Sat" : "Minute"}: ${String(option).padStart(2, "0")}`}
            onClick={() => onSelect(option)}
          >
            {showLabel ? String(option).padStart(2, "0") : ""}
          </button>
        );
      })}
    </div>
  );
}

function getClockAngle(part: "hour" | "minute", value: number) {
  const units = part === "hour" ? 12 : 60;
  return (((value % units) / units) * 360) - 90;
}

function getClockRadius(part: "hour" | "minute", value: number) {
  if (part === "hour") {
    return value < 12 ? 0.42 : 0.29;
  }

  return 0.42;
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
