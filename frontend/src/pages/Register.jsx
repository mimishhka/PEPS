import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";
import { sanitizeRedirectTarget } from "../lib/redirects";

export default function Register() {
  useDocumentHead({ title: "Register", path: "/register", noindex: true });
  const { t, lang } = useLang();
  const { register, requestMagic } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("magic"); // magic | password
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!agree) { toast.error(t("auth.mustAgree") || "Vous devez accepter les conditions."); return; }
    if (form.password.length < 8) { toast.error(t("auth.pwMin") || "Mot de passe : 8 caractères minimum."); return; }
    setBusy(true);
    const res = await register(form.name, form.email, form.password);
    setBusy(false);
    if (res.ok) {
      if (res.data?.verification_sent) setVerifyPending(true);
      else navigate(sanitizeRedirectTarget("/account", "/account"), { replace: true });
    } else toast.error(res.error);
  };

  const onMagicSubmit = async (e) => {
    e.preventDefault();
    if (!agree) { toast.error(t("auth.mustAgree") || "Vous devez accepter les conditions."); return; }
    const normalized = form.email.trim().toLowerCase();
    if (!normalized) { toast.error(t("auth.email") || "Email requis"); return; }
    setBusy(true);
    const res = await requestMagic({ email: normalized, name: form.name, create: true, lang });
    setBusy(false);
    if (res.existing) {
      // Aucun courriel n'est parti : afficher « vérifiez votre boîte » ferait
      // attendre un message qui ne viendra pas. On oriente vers la connexion,
      // en gardant l'adresse saisie pour éviter de la retaper.
      navigate(`/login?email=${encodeURIComponent(normalized)}&existing=1`);
      toast.info(lang === "fr"
        ? "Cette adresse a déjà un compte. Connectez-vous."
        : "This address already has an account. Please sign in.");
      return;
    }
    if (res.ok) {
      setMagicSent(true);
      toast.success(t("auth.magicSent") || "Lien envoyé ! Vérifiez votre email.");
    } else {
      toast.error(res.error);
    }
  };

  const consent = (
    <label className="flex items-start gap-3 text-sm text-glacier cursor-pointer select-none">
      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="register-agree"
        className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-ash accent-nova" />
      <span>
        {t("auth.agreePrefix") || "J'accepte les"}{" "}
        <Link to="/compliance" className="font-semibold text-nordfjord hover:text-nova">{t("auth.terms") || "conditions d'utilisation"}</Link>
        {" "}{t("auth.and") || "et la"}{" "}
        <Link to="/privacy" className="font-semibold text-nordfjord hover:text-nova">{t("auth.privacy") || "politique de confidentialité"}</Link>.
        {" "}<span className="text-compliance">{t("auth.ruoConsent") || "Je confirme avoir 18 ans et plus. Produits pour la recherche uniquement (RUO)."}</span>
      </span>
    </label>
  );

  return (
    <div className="min-h-[85vh] grid lg:grid-cols-2 bg-clinical" data-testid="register-page">
      <div className="hidden lg:block relative bg-nordfjord overflow-hidden">
        <MolecularMesh opacity={0.3} />
        <div className="relative h-full p-12 flex flex-col justify-between text-clinical">
          <div className="flex items-center gap-3">
            <FnMark size={28} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={17} color="#F7FAFC" />
          </div>
          <div>
            <h2 className="font-display text-[44px] font-bold tracking-[-0.02em] leading-[1.05]">
              {t("auth.signup") || "Join the network."}
            </h2>
            <p className="mt-4 text-[#B7CADD] max-w-md">{t("auth.registerSub")}</p>
          </div>
        </div>
      </div>

      <div className="p-8 lg:p-16 flex flex-col justify-center">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
          02 · {t("auth.signup")}
        </p>
        <h1 className="font-display text-[40px] font-bold text-nordfjord mb-8">{t("auth.signup")}</h1>

        <div className="max-w-md">
          <div className="inline-flex rounded-full border border-ash bg-white p-1 mb-8" role="tablist">
            <button type="button" onClick={() => { setMode("magic"); setMagicSent(false); }} data-testid="register-tab-magic"
              className={`px-5 py-2 rounded-full text-sm font-semibold transition ${mode === "magic" ? "bg-nordfjord text-clinical" : "text-compliance hover:text-nordfjord"}`}>
              {t("auth.magicTab") || "Lien magique"}
            </button>
            <button type="button" onClick={() => setMode("password")} data-testid="register-tab-password"
              className={`px-5 py-2 rounded-full text-sm font-semibold transition ${mode === "password" ? "bg-nordfjord text-clinical" : "text-compliance hover:text-nordfjord"}`}>
              {t("auth.passwordTab") || "Mot de passe"}
            </button>
          </div>

          {mode === "password" && verifyPending ? (
            <div className="rounded-3xl border border-nova/40 bg-nova/5 p-6" data-testid="register-verify-pending">
              <p className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-2">Fironova · Activation</p>
              <h3 className="font-display text-[20px] font-bold text-nordfjord mb-2">
                {t("auth.magicCheckTitle") || "Vérifiez votre boîte mail"}
              </h3>
              <p className="text-sm text-glacier mb-4">
                {(t("auth.magicCheckSubSignup") || "Un lien d'activation a été envoyé à {email}.").replace("{email}", form.email)}
              </p>
              <button type="button" onClick={() => setVerifyPending(false)} className="text-sm font-semibold text-nordfjord hover:text-nova">
                {t("auth.magicResend") || "Renvoyer ou changer d'email"}
              </button>
            </div>
          ) : mode === "magic" && magicSent ? (
            <div className="rounded-3xl border border-nova/40 bg-nova/5 p-6" data-testid="register-magic-sent">
              <p className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-2">Fironova · Magic Link</p>
              <h3 className="font-display text-[20px] font-bold text-nordfjord mb-2">
                {t("auth.magicCheckTitle") || "Vérifiez votre boîte mail"}
              </h3>
              <p className="text-sm text-glacier mb-4">
                {(t("auth.magicCheckSubSignup") || "Un lien d'activation a été envoyé à {email}.").replace("{email}", form.email)}
              </p>
              <button type="button" onClick={() => setMagicSent(false)} className="text-sm font-semibold text-nordfjord hover:text-nova">
                {t("auth.magicResend") || "Renvoyer ou changer d'email"}
              </button>
            </div>
          ) : mode === "magic" ? (
            <form onSubmit={onMagicSubmit} className="space-y-5">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" data-testid="honeypot" />
              <p className="text-sm text-glacier">
                {t("auth.magicSignupSub") || "Créez votre compte sans mot de passe — on vous envoie un lien d'activation."}
              </p>
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.name")}</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="register-magic-name"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.email")}</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="register-magic-email"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
              {consent}
              <button type="submit" disabled={busy} data-testid="register-magic-submit" className="w-full btn-pill btn-nova disabled:opacity-50">
                {busy ? t("common.loading") : `${t("auth.magicCreate") || "Créer mon compte"} →`}
              </button>
            </form>
          ) : (
            <form onSubmit={onPasswordSubmit} className="space-y-5">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" data-testid="honeypot" />
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.name")}</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="register-name"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.email")}</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="register-email"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.password")} (≥ 8)</label>
                <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="register-password"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
              {consent}
              <button type="submit" disabled={busy} data-testid="register-submit" className="w-full btn-pill btn-nova disabled:opacity-50">
                {busy ? t("common.loading") : `${t("auth.signup")} →`}
              </button>
            </form>
          )}

          <p className="text-sm text-glacier pt-6 mt-6 border-t border-ash">
            {t("auth.hasAccount")}{" "}
            <Link to="/login" className="font-semibold text-nordfjord hover:text-nova" data-testid="link-login">
              {t("auth.signin")} →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
