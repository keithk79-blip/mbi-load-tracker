import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Viewport-centered confirm; not tied to list/form scroll position. */
export function ConfirmOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return createPortal(
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <div className="delete-confirm confirm-overlay-card">{children}</div>
    </div>,
    document.body,
  );
}
