type ChipProps = {
  label: string;
  selected?: boolean;
  invalid?: boolean;
  muted?: boolean;
  onClick?: () => void;
};

export function Chip({
  label,
  selected = false,
  invalid = false,
  muted = false,
  onClick,
}: ChipProps) {
  const classes = [
    "chip",
    selected ? "chip-selected" : "",
    invalid ? "chip-invalid" : "",
    muted ? "chip-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={selected}
      onClick={onClick}
    >
      {invalid ? <s>{label}</s> : label}
    </button>
  );
}
