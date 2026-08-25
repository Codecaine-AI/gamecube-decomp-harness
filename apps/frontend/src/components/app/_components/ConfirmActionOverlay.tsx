import { useEffect } from "react";
import { AlertTriangle } from "@/icons";
import { Button } from "@/components/primitives";

export type ConfirmTone = "default" | "primary" | "warning" | "danger";

export interface ConfirmActionRequest {
  message: string;
  confirmLabel: string;
  tone: ConfirmTone;
}

/**
 * In-UI replacement for window.confirm in operator action paths. Renders the
 * confirmation as a design-system panel over the app: the second click (on the
 * confirm button) fires the action, while Escape, the backdrop, or the cancel
 * button abort it. Never blocks the tab the way a native dialog does.
 */
export function ConfirmActionOverlay({
  onCancel,
  onConfirm,
  request,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  request: ConfirmActionRequest;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/70 p-4"
      onClick={onCancel}
      role="alertdialog"
    >
      <div
        className="w-full max-w-[440px] border border-line bg-panel p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-down">
          <AlertTriangle size={11} /> Confirm required
        </div>
        <p className="m-0 whitespace-pre-line text-xs leading-5 text-soft">{request.message}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button autoFocus onClick={onConfirm} tone={request.tone} type="button">
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
