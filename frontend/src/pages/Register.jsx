import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";

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

      <form onSubmit={onSubmit} className="p-8 lg:p-16 flex flex-col justify-center">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">02 · {t("auth.signup")}</p>
        <h1 className="font-display text-[40px] font-bold text-nordfjord mb-10">{t("auth.signup")}</h1>
        <div className="space-y-5 max-w-md">
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
          <button type="submit" disabled={busy} data-testid="register-submit" className="w-full btn-pill btn-nova disabled:opacity-50">
            {busy ? t("common.loading") : `${t("auth.signup")} →`}
          </button>
          <p className="text-sm text-glacier pt-4 border-t border-ash">
            {t("auth.hasAccount")} <Link to="/login" className="font-semibold text-nordfjord hover:text-nova" data-testid="link-login">{t("auth.signin")} →</Link>
          </p>
        </div>
      </form>
    </div>
  );
}
