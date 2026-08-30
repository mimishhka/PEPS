import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";
import api, { formatApiError } from "../lib/api";

export default function ForgotPassword() {
  useDocumentHead({ title: "Reset password", path: "/forgot-password", noindex: true });
  const { lang } = useLang();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      toast.error(lang === "fr" ? "Courriel requis" : "Email required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: normalized, lang });
      setSent(true);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[85vh] grid place-items-center bg-clinical px-6" data-testid="forgot-password-page">
      <div className="relative w-full max-w-md rounded-3xl border border-ash bg-white p-10 overflow-hidden">
        <div className="absolute inset-0 opacity-10"><MolecularMesh opacity={0.4} /></div>
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-8">
            <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={16} color="#0B2E4F" />
          </div>

          {sent ? (
            <div className="text-center" data-testid="forgot-password-sent">
              <h1 className="font-display text-2xl font-bold text-nordfjord mb-3">
                {lang === "fr" ? "Vérifiez votre courriel" : "Check your email"}
              </h1>
              <p className="text-sm text-glacier leading-relaxed mb-8">
                {lang === "fr"
                  ? "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Il expire dans 30 minutes."
                  : "If an account exists for that address, a reset link has been sent. It expires in 30 minutes."}
              </p>
              <Link to="/login" className="btn-pill btn-outline inline-block" data-testid="forgot-back-to-login">
                {lang === "fr" ? "Retour à la connexion" : "Back to sign in"}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-nordfjord mb-2 text-center">
                {lang === "fr" ? "Mot de passe oublié" : "Forgot password"}
              </h1>
              <p className="text-sm text-glacier leading-relaxed mb-8 text-center">
                {lang === "fr"
                  ? "Entrez votre courriel et nous vous enverrons un lien pour réinitialiser votre mot de passe."
                  : "Enter your email and we'll send you a link to reset your password."}
              </p>
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">
                    {lang === "fr" ? "Courriel" : "Email"}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    data-testid="forgot-email"
                    className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  data-testid="forgot-submit"
                  className="w-full btn-pill btn-nova disabled:opacity-50"
                >
                  {busy
                    ? (lang === "fr" ? "Envoi…" : "Sending…")
                    : (lang === "fr" ? "Envoyer le lien" : "Send reset link")}
                </button>
              </form>
              <p className="text-xs text-glacier leading-relaxed mt-5 text-center">
                {lang === "fr"
                  ? "Pas de mot de passe ? Votre compte a peut-être été activé par lien magique. Connectez-vous depuis l'onglet « Lien magique » de la page de connexion."
                  : "No password? Your account may have been activated by magic link. Sign in from the \"Magic link\" tab on the sign-in page."}
              </p>
              <p className="text-sm text-glacier pt-4 mt-5 border-t border-ash text-center">
                <Link to="/login" className="text-nova hover:text-nordfjord transition" data-testid="forgot-back-link">
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
