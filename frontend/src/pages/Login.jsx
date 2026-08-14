import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";
import { sanitizeRedirectTarget } from "../lib/redirects";

export default function Login() {
  useDocumentHead({ title: "Sign in", path: "/login", noindex: true });
  const { t, lang } = useLang();
  const { login, requestMagic } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const nextParam = new URLSearchParams(location.search).get("next") || "";
  const isAdminLogin = nextParam.includes("ops-portal");
  const [mode, setMode] = useState("password"); // magic | password — password est le défaut le plus attendu
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const nextUrl = () => sanitizeRedirectTarget(
    new URLSearchParams(location.search).get("next") || location.state?.from || "/account",
    "/account"
  );

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) navigate(nextUrl(), { replace: true });
    else toast.error(res.error);
  };

  const onMagicSubmit = async (e) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) { toast.error(t("auth.email") || "Email requis"); return; }
    setBusy(true);
    const res = await requestMagic({ email: normalized, create: false, lang });
    setBusy(false);
    if (res.ok) {
      setMagicSent(true);
      toast.success(t("auth.magicSent") || "Lien envoyé ! Vérifiez votre email.");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-[85vh] grid lg:grid-cols-2 bg-clinical" data-testid="login-page">
      <div className="hidden lg:block relative bg-nordfjord overflow-hidden">
        <MolecularMesh opacity={0.3} />
        <div className="relative h-full p-12 flex flex-col justify-between text-clinical">
          <div className="flex items-center gap-3">
            <FnMark size={28} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={17} color="#F7FAFC" />
          </div>
          <div>
            <h2 className="font-display text-[44px] font-bold tracking-[-0.02em] leading-[1.05]">
              {isAdminLogin ? (lang === "fr" ? "Espace OPS." : "OPS access.") : (t("auth.welcome") || "Welcome back.")}
            </h2>
            <p className="mt-4 text-[#B7CADD] max-w-md">
              {isAdminLogin
                ? (lang === "fr" ? "Console d'administration réservée au personnel Fironova." : "Fironova staff administration console.")
                : t("auth.welcomeSub")}
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 lg:p-16 flex flex-col justify-center">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4 flex items-center gap-2">
          {isAdminLogin && <Lock size={12} strokeWidth={2.2} />}
          {isAdminLogin ? (lang === "fr" ? "ACCÈS OPS" : "OPS ACCESS") : `01 · ${t("auth.signin")}`}
        </p>
        <h1 className="font-display text-[40px] font-bold text-nordfjord mb-8">
          {isAdminLogin ? "FIRONOVA OPS" : t("auth.welcome")}
        </h1>

        <div className="max-w-md">
          {!isAdminLogin && (
            <div className="inline-flex rounded-full border border-ash bg-white p-1 mb-8" role="tablist" aria-label="Sign in method">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "magic"}
                aria-controls="login-panel-magic"
                onClick={() => { setMode("magic"); setMagicSent(false); }}
                data-testid="login-tab-magic"
                className={`px-5 py-2 rounded-full text-sm font-semibold transition ${mode === "magic" ? "bg-nordfjord text-clinical" : "text-compliance hover:text-nordfjord"}`}
              >
                {t("auth.magicTab") || "Lien magique"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "password"}
                aria-controls="login-panel-password"
                onClick={() => setMode("password")}
                data-testid="login-tab-password"
                className={`px-5 py-2 rounded-full text-sm font-semibold transition ${mode === "password" ? "bg-nordfjord text-clinical" : "text-compliance hover:text-nordfjord"}`}
              >
                {t("auth.passwordTab") || "Mot de passe"}
              </button>
            </div>
          )}

          {!isAdminLogin && mode === "magic" ? (
            magicSent ? (
              <div className="rounded-3xl border border-nova/40 bg-nova/5 p-6" data-testid="magic-sent">
                <p className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-2">Fironova · Magic Link</p>
                <h3 className="font-display text-[20px] font-bold text-nordfjord mb-2">
                  {t("auth.magicCheckTitle") || "Vérifiez votre boîte mail"}
                </h3>
                <p className="text-sm text-glacier mb-4">
                  {(t("auth.magicCheckSub") || "Un lien de connexion a été envoyé à {email}.").replace("{email}", email)}
                </p>
                <button type="button" onClick={() => setMagicSent(false)} className="text-sm font-semibold text-nordfjord hover:text-nova">
                  {t("auth.magicResend") || "Renvoyer ou changer d'email"}
                </button>
              </div>
            ) : (
              <form onSubmit={onMagicSubmit} className="space-y-5">
                <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" data-testid="honeypot" />
                <p className="text-sm text-glacier">
                  {t("auth.magicLinkSub") || "Connexion rapide et sans mot de passe pour clients Fironova."}
                </p>
                <div>
                  <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2" htmlFor="login-f1">{t("auth.email")}</label>
                  <input id="login-f1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-magic-email"
                    className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
                </div>
                <button type="submit" disabled={busy} data-testid="login-magic-submit" className="w-full btn-pill btn-nova disabled:opacity-50">
                  {busy ? t("common.loading") : `${t("auth.magicSend") || "Envoyer le lien"} →`}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={onPasswordSubmit} className="space-y-5">
              {isAdminLogin && (
                <p className="text-sm text-glacier">
                  {lang === "fr"
                    ? "Connectez-vous avec vos identifiants administrateur."
                    : "Sign in with your administrator credentials."}
                </p>
              )}
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2" htmlFor="login-f2">{t("auth.email")}</label>
                <input id="login-f2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2" htmlFor="login-f3">{t("auth.password")}</label>
                <input id="login-f3" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password"
                  className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
                {!isAdminLogin && (
                  <div className="text-right mt-2">
                    <Link to="/forgot-password" data-testid="login-forgot-password-link"
                      className="font-data text-[12px] text-nova hover:text-nordfjord transition">
                      {lang === "fr" ? "Mot de passe oublié ?" : "Forgot password?"}
                    </Link>
                  </div>
                )}
              </div>
              <button type="submit" disabled={busy} data-testid="login-submit" className="w-full btn-pill btn-nova disabled:opacity-50">
                {busy ? t("common.loading") : `${t("auth.signin")} →`}
              </button>
            </form>
          )}

          {!isAdminLogin && (
            <p className="text-sm text-glacier pt-6 mt-6 border-t border-ash">
              {t("auth.noAccount")}{" "}
              <Link to="/register" className="font-semibold text-nordfjord hover:text-nova" data-testid="link-register">
                {t("auth.signup")} →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
