// frontend/src/pages/StaffAccept.jsx — NOUVEAU fichier, route publique.
// Page ouverte depuis le lien d'invitation reçu par email. Le token à usage
// unique + TTL (72h côté backend) sert de preuve — pas besoin d'être connecté.
import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import useDocumentHead from "../hooks/useDocumentHead";

export default function StaffAccept() {
  useDocumentHead({ title: "Accept invitation", path: "/staff-accept", noindex: true });
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/staff/accept", { token, password });
      if (data.token) localStorage.setItem("fironova_token", data.token);
      setDone(true);
      await refresh();
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      toast.error(err.response?.data?.detail || "This invitation link is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" data-testid="staff-accept-missing-token">
        <p className="text-foreground/60">This link is missing its invitation code.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6" data-testid="staff-accept-page">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <div className="font-display font-extrabold text-2xl tracking-tight mb-1">
          FIRONOVA<span style={{ color: "#C20114" }}>.</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-8">
          // Team invitation
        </div>
        {done ? (
          <p className="text-foreground/70" data-testid="staff-accept-success">
            Access activated. Redirecting…
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-foreground/70">Set a password to activate your access.</p>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                data-testid="staff-accept-password"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Confirm password</label>
              <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                data-testid="staff-accept-confirm"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
            </div>
            <button type="submit" disabled={busy} data-testid="staff-accept-submit"
              className="w-full bg-ink text-white font-mono text-xs uppercase tracking-[0.3em] py-4 hover:bg-foreground/85 disabled:opacity-50">
              {busy ? "…" : "Activate access →"}
            </button>
          </div>
        )}
        <Link to="/" className="block mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/40 link-underline">
          ← Back to fironova.ca
        </Link>
      </form>
    </div>
  );
}
