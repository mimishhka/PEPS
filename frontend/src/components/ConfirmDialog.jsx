// frontend/src/components/ConfirmDialog.jsx
// Remplacement accessible des window.confirm() natifs : un provider global +
// un hook useConfirm() retournant une promesse (true = confirmé, false = annulé).
import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

const ConfirmContext = createContext(null);

const DEFAULT_TITLE = { fr: "Confirmer", en: "Confirm" };
const DEFAULT_CONFIRM = { fr: "Confirmer", en: "Confirm" };
const DEFAULT_CANCEL = { fr: "Annuler", en: "Cancel" };

export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOptions({
        title: opts.title,
        description: opts.description || "",
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        destructive: !!opts.destructive,
      });
    });
  }, []);

  const close = useCallback((result) => {
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => { if (!open) close(false); }}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title || DEFAULT_TITLE.en}</AlertDialogTitle>
            {options?.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {options?.cancelLabel || DEFAULT_CANCEL.en}
            </AlertDialogCancel>
            <AlertDialogAction
              className={options?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => close(true)}
            >
              {options?.confirmLabel || DEFAULT_CONFIRM.en}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
