import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

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
    <div className="min-h-[80vh] grid lg:grid-cols-2" data-testid="login-page">
      <div className="hidden lg:block relative bg-ink overflow-hidden">
        <img src="https://images.unsplash.com/photo-1616996691748-3f5f78093ab0?auto=format&fit=crop&w=1200&q=80" alt="Lab" className="absolute inset-0 w-full h-full object-cover opacity-60" style={{ filter: "grayscale(1) contrast(1.2)" }} />
        <div className="relative h-full p-12 flex flex-col justify-between text-white">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em]">// AUTH · FIRONOVA</div>
          <div>
            <h2 className="font-display text-5xl font-extrabold uppercase tracking-tight leading-[0.95]">
              Lab-grade<br/>peptides.<br/>Canadian.
            </h2>
            <p className="mt-4 text-white/70 max-w-md text-sm">{t("auth.welcomeSub")}</p>
          </div>
        </div>
      </div>
      <form onSubmit={onSubmit} className="p-8 lg:p-16 flex flex-col justify-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">01 · {t("auth.signin")}</div>
        <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-3">{t("auth.welcome")}</h1>
        <div className="mt-10 space-y-5 max-w-md">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("auth.email")}</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("auth.password")}</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
          </div>
          <button type="submit" disabled={busy} data-testid="login-submit" className="w-full bg-ink text-white font-mono text-xs uppercase tracking-[0.3em] py-4 hover:bg-foreground/85 disabled:opacity-50">
            {busy ? t("common.loading") : `${t("auth.signin")} →`}
          </button>
          <button type="button" onClick={() => {
              const next = new URLSearchParams(location.search).get("next") || location.state?.from || "/account";
              window.location.href = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
            }} className="w-full border border-ink text-foreground bg-transparent font-mono text-xs uppercase tracking-[0.3em] py-3 hover:bg-ink/5">
            {t("auth.signinWithGoogle") || "Sign in with Google"}
          </button>
          <p className="text-xs text-foreground/60 pt-4 border-t border-ink/15">
            {t("auth.noAccount")} <Link to="/register" className="font-bold underline" data-testid="link-register">{t("auth.signup")} →</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
