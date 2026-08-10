import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";
import api, { formatApiError } from "../lib/api";

// Doit rester aligné avec PASSWORD_COMPLEXITY_RE côté backend.
const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export default function ResetPassword() {
  useDocumentHead({ title: "Reset password", path: "/reset-password", noindex: true });
  const { lang } = useLang();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error(lang === "fr" ? "Lien invalide ou expiré." : "Invalid or expired link.");
      return;
    }
    if (!PW_RE.test(password)) {
      toast.error(lang === "fr"
        ? "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial."
        : "Password must be at least 8 characters with uppercase, lowercase, a number, and a special character.");
      return;
    }
    if (password !== confirm) {
      toast.error(lang === "fr" ? "Les mots de passe ne correspondent pas." : "Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      if (typeof refresh === "function") await refresh();
      toast.success(lang === "fr" ? "Mot de passe réinitialisé ✓" : "Password reset ✓");
      navigate("/account", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[85vh] grid place-items-center bg-clinical px-6" data-testid="reset-password-page">
      <div className="relative w-full max-w-md rounded-3xl border border-ash bg-white p-10 overflow-hidden">
        <div className="absolute inset-0 opacity-10"><MolecularMesh opacity={0.4} /></div>
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-8">
            <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={16} color="#0B2E4F" />
          </div>

          {!token ? (
            <div className="text-center" data-testid="reset-invalid">
              <h1 className="font-display text-2xl font-bold text-nordfjord mb-3">
                {lang === "fr" ? "Lien invalide" : "Invalid link"}
              </h1>
              <p className="text-sm text-glacier leading-relaxed mb-8">
                {lang === "fr"
                  ? "Ce lien de réinitialisation est manquant ou incomplet. Demandez-en un nouveau."
                  : "This reset link is missing or incomplete. Request a new one."}
              </p>
              <Link to="/forgot-password" className="btn-pill btn-outline inline-block" data-testid="reset-request-new">
                {lang === "fr" ? "Demander un nouveau lien" : "Request a new link"}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-nordfjord mb-2 text-center">
                {lang === "fr" ? "Nouveau mot de passe" : "New password"}
              </h1>
              <p className="text-sm text-glacier leading-relaxed mb-8 text-center">
                {lang === "fr"
                  ? "Choisissez un nouveau mot de passe pour votre compte."
                  : "Choose a new password for your account."}
              </p>
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">
                    {lang === "fr" ? "Nouveau mot de passe" : "New password"}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    data-testid="reset-password"
                    className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova"
                  />
                </div>
                <div>
                  <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">
                    {lang === "fr" ? "Confirmer le mot de passe" : "Confirm password"}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    data-testid="reset-password-confirm"
                    className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova"
                  />
                </div>
                <p className="font-data text-[11px] text-glacier leading-relaxed">
                  {lang === "fr"
                    ? "Min. 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial."
                    : "Min. 8 characters, with uppercase, lowercase, a number and a special character."}
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="reset-submit"
                  className="w-full btn-pill btn-nova disabled:opacity-50"
                >
                  {busy
                    ? (lang === "fr" ? "Réinitialisation…" : "Resetting…")
                    : (lang === "fr" ? "Réinitialiser le mot de passe" : "Reset password")}
                </button>
              </form>
              <p className="text-sm text-glacier pt-6 mt-6 border-t border-ash text-center">
                <Link to="/login" className="text-nova hover:text-nordfjord transition" data-testid="reset-back-link">
                  {lang === "fr" ? "← Retour à la connexion" : "← Back to sign in"}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
