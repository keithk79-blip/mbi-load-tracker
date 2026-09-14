import { sanitizeTruck } from "../lib/truck";

type TruckEntryProps = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
  hint?: string;
};

export function TruckEntry({
  value,
  onChange,
  onSubmit,
  submitLabel = "Find",
  autoFocus = false,
  hint = "Type the unit number or broker code.",
}: TruckEntryProps) {
  return (
    <div className="truck-entry">
      <label className="truck-kb-label">
        Truck
        <input
          className="truck-kb-input"
          value={value}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="e.g. 418 or VZ"
          aria-label="Truck or broker code"
          onChange={(e) => onChange(sanitizeTruck(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value) onSubmit();
          }}
        />
      </label>
      <p className="field-hint tight">{hint} Enter to continue.</p>
      <button
        type="button"
        className="btn-primary"
        disabled={!value}
        onClick={onSubmit}
      >
        {submitLabel}
      </button>
    </div>
  );
}
