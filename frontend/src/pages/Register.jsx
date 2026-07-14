import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

export default function Register() {
  useDocumentHead({ title: "Register", path: "/register", noindex: true });
  const { t } = useLang();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const res = await register(form.name, form.email, form.password);
    setBusy(false);
    if (res.ok) navigate("/account", { replace: true });
    else toast.error(res.error);
  };

  return (
    <div className="min-h-[80vh] grid lg:grid-cols-2" data-testid="register-page">
      <div className="hidden lg:block relative bg-ink overflow-hidden">
        <img src="https://images.unsplash.com/photo-1616996691748-3f5f78093ab0?auto=format&fit=crop&w=1200&q=80" alt="Lab" className="absolute inset-0 w-full h-full object-cover opacity-60" style={{ filter: "grayscale(1) contrast(1.2)" }} />
        <div className="relative h-full p-12 flex flex-col justify-between text-white">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em]">// AUTH · FIRONOVA</div>
          <div>
            <h2 className="font-display text-5xl font-extrabold uppercase tracking-tight leading-[0.95]">
              Join the<br/>research<br/>network.
            </h2>
            <p className="mt-4 text-white/70 max-w-md text-sm">{t("auth.registerSub")}</p>
          </div>
        </div>
      </div>
      <form onSubmit={onSubmit} className="p-8 lg:p-16 flex flex-col justify-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">02 · {t("auth.signup")}</div>
        <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-3">{t("auth.signup")}</h1>
        <div className="mt-10 space-y-5 max-w-md">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("auth.name")}</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="register-name" className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("auth.email")}</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="register-email" className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("auth.password")} (≥ 8)</label>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="register-password" className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
          </div>
          <button type="submit" disabled={busy} data-testid="register-submit" className="w-full bg-ink text-white font-mono text-xs uppercase tracking-[0.3em] py-4 hover:bg-foreground/85 disabled:opacity-50">
            {busy ? t("common.loading") : `${t("auth.signup")} →`}
          </button>
          <p className="text-xs text-foreground/60 pt-4 border-t border-ink/15">
            {t("auth.hasAccount")} <Link to="/login" className="font-bold underline" data-testid="link-login">{t("auth.signin")} →</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
