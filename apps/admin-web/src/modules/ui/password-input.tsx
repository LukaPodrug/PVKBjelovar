import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const visibilityLabel = isVisible ? "Sakrij lozinku" : "Prikaži lozinku";

  return (
    <div className="password-input-wrap">
      <input
        {...props}
        className={`${className} password-input-control`}
        type={isVisible ? "text" : "password"}
      />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visibilityLabel}
        aria-pressed={isVisible}
        title={visibilityLabel}
        onClick={() => setIsVisible((current) => !current)}
      >
        {isVisible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M2.1 12s3.6-6 9.9-6 9.9 6 9.9 6-3.6 6-9.9 6-9.9-6-9.9-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="m3 3 18 18" />
      <path d="M10.6 6.15A10.7 10.7 0 0 1 12 6c6.3 0 9.9 6 9.9 6a17.8 17.8 0 0 1-2.1 2.75M6.2 6.2C3.55 8.05 2.1 12 2.1 12s3.6 6 9.9 6c1.35 0 2.58-.28 3.67-.72" />
      <path d="M9.95 9.95A2.75 2.75 0 0 0 13.9 13.9" />
    </svg>
  );
}
