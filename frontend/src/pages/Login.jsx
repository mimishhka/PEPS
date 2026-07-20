import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";

export default function Login() {
  useDocumentHead({ title: "Sign in", path: "/login", noindex: true });
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) {
      const next =
        new URLSearchParams(location.search).get("next") ||
        location.state?.from ||
        "/account";
      navigate(next, { replace: true });
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
              {t("auth.welcome") || "Welcome back."}
            </h2>
            <p className="mt-4 text-[#B7CADD] max-w-md">{t("auth.welcomeSub")}</p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="p-8 lg:p-16 flex flex-col justify-center">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">01 · {t("auth.signin")}</p>
        <h1 className="font-display text-[40px] font-bold text-nordfjord mb-10">{t("auth.welcome")}</h1>
        <div className="space-y-5 max-w-md">
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.email")}</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email"
              className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
          </div>
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("auth.password")}</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password"
              className="w-full rounded-full border border-ash px-5 py-3.5 bg-white text-nordfjord outline-none focus:border-nova" />
          </div>
          <button type="submit" disabled={busy} data-testid="login-submit" className="w-full btn-pill btn-nova disabled:opacity-50">
            {busy ? t("common.loading") : `${t("auth.signin")} →`}
          </button>
          <button type="button" onClick={() => {
              const next = new URLSearchParams(location.search).get("next") || location.state?.from || "/account";
              window.location.href = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
            }} className="w-full btn-pill btn-outline">
            {t("auth.signinWithGoogle") || "Sign in with Google"}
          </button>
          <p className="text-sm text-glacier pt-4 border-t border-ash">
            {t("auth.noAccount")} <Link to="/register" className="font-semibold text-nordfjord hover:text-nova" data-testid="link-register">{t("auth.signup")} →</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
