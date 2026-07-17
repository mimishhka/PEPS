// frontend/src/components/AdminGate.jsx — NOUVEAU fichier.
// Passerelle affichée AVANT le login admin. Un visiteur qui tombe sur l'URL
// admin obscure sans connaître le code ne voit même pas d'écran de login —
// juste ce petit formulaire neutre, indiscernable d'une page d'erreur.
// La vraie barrière de sécurité reste le JWT + rôle admin côté backend sur
// /api/admin/* ; ceci n'est qu'une couche de dissuasion/obscurité en plus,
// utile tant qu'il n'y a pas de sous-domaine séparé.
import { useState, useEffect } from "react";
import api from "../lib/api";

const GATE_KEY = "fironova_admin_gate_ok";

export default function AdminGate({ children }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem(GATE_KEY) === "1");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (ok) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api.get("/admin/autologin")
      .then(() => {
        if (!cancelled) {
          sessionStorage.setItem(GATE_KEY, "1");
          setOk(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => { cancelled = true; };
  }, [ok]);

  if (checking) return null;
  if (ok) return children;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/admin/gate/verify", { code });
      sessionStorage.setItem(GATE_KEY, "1");
      setOk(true);
    } catch {
      // Message volontairement vague — ne pas confirmer qu'un système
      // d'authentification existe derrière ce formulaire.
      setError("Not found.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-gate-page">
      <form onSubmit={submit} className="w-full max-w-xs" data-testid="admin-gate-form">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          placeholder="····"
          data-testid="admin-gate-code"
          className="w-full border-b border-ink/30 px-1 py-3 bg-transparent text-center tracking-[0.3em] focus:outline-none focus:border-ink"
        />
        <button type="submit" disabled={busy} className="sr-only">Submit</button>
        {error && <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/40">{error}</p>}
      </form>
    </div>
  );
}
