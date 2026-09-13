import type { Ref } from "react";
import { useDriverNameSuggestions } from "../hooks/useDriverNameSuggestions";

type DriverNameInputProps = {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  "aria-label"?: string;
};

export function DriverNameInput({
  value,
  onChange,
  id,
  className = "text-input",
  placeholder = "Driver name",
  autoFocus = false,
  inputRef,
  "aria-label": ariaLabel,
}: DriverNameInputProps) {
  const matches = useDriverNameSuggestions(value);

  return (
    <div className="driver-name-field">
      <input
        ref={inputRef}
        id={id}
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />
      {matches.length ? (
        <div className="vac-suggest" role="listbox" aria-label="Driver name suggestions">
          {matches.map((item) => (
            <button
              key={item}
              type="button"
              className="vac-suggest-btn"
              role="option"
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
