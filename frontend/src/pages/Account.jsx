// frontend/src/pages/Account.jsx — Mon Compte étendu.
// Onglets : Commandes / Profil / Adresses / Sécurité.
// Remplace ENTIÈREMENT l'ancien Account.jsx.
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

const statusColor = {
  awaiting_etransfer: "bg-secondary",
  awaiting_crypto: "bg-secondary",
  paid: "bg-ink text-white",
  shipped: "bg-warning",
  delivered: "bg-ink text-white",
  pending: "bg-secondary",
};

const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

const EMPTY_ADDRESS = {
  label: "", full_name: "", address1: "", address2: "",
  city: "", province: "QC", postal_code: "", country: "CA", phone: "", is_default: false,
};

export default function Account() {
  useDocumentHead({ title: "My Account", path: "/account", noindex: true });
  const { user, logout, refresh } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState("orders");

  return (
    <div className="max-w-6xl mx-auto px-6 py-16" data-testid="account-page">
      <div className="flex items-end justify-between border-b border-ink pb-6 mb-8">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ACCOUNT</div>
          <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-2" data-testid="account-name">
            {user?.name}
          </h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{user?.email}</p>
        </div>
        <button onClick={logout} data-testid="account-logout" className="font-mono text-xs uppercase tracking-[0.25em] link-underline">
          {t("nav.logout")} →
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-ink/20 mb-10" data-testid="account-tabs">
        {[
          ["orders", t("account.orders")],
          ["profile", t("account.profile")],
          ["addresses", t("account.addresses")],
          ["security", t("account.security")],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`account-tab-${key}`}
            className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-3 -mb-px border-b-2 transition-colors ${
              tab === key ? "border-ink font-bold" : "border-transparent text-foreground/60 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && <OrdersTab t={t} />}
      {tab === "profile" && <ProfileTab t={t} user={user} refresh={refresh} />}
      {tab === "addresses" && <AddressesTab t={t} />}
      {tab === "security" && <SecurityTab t={t} logout={logout} navigate={navigate} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Orders */
function OrdersTab({ t }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api.get("/orders/mine").then((r) => setOrders(r.data)).catch(() => setOrders([]));
  }, []);
  if (orders === null) {
    return <p className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/50">{t("common.loading")}</p>;
  }
  if (orders.length === 0) {
    return (
      <div className="border border-ink p-8 text-center" data-testid="account-no-orders">
        <p className="text-foreground/70">{t("account.noOrders")}</p>
        <Link to="/catalog" className="inline-block mt-4 bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
          {t("nav.catalog")} →
        </Link>
      </div>
    );
  }
  return (
    <div className="border border-ink overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="bg-ink text-white">
          <tr>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.orderNumber")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.date")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Items</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.status")}</th>
            <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">{t("account.total")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-ink/15 hover:bg-secondary" data-testid={`order-row-${o.order_number}`}>
              <td className="px-4 py-4">
                <Link to={`/order/${o.id}`} className="font-bold link-underline">{o.order_number}</Link>
              </td>
              <td className="px-4 py-4 text-foreground/70">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-4">{o.items.length}</td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 uppercase tracking-[0.15em] text-[10px] ${statusColor[o.payment_status] || "bg-secondary"}`}>
                  {o.payment_status}
                </span>
              </td>
              <td className="px-4 py-4 text-right font-bold">${o.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------- Profile */
function ProfileTab({ t, user, refresh }) {
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const [emailForm, setEmailForm] = useState({ new_email: "", current_password: "" });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState("");

  const saveName = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/account/profile", { name });
      await refresh();
      toast.success(t("account.profileSaved"));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const requestEmailChange = async (e) => {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const { data } = await api.post("/account/email/request-change", emailForm);
      setEmailSentTo(data.sent_to);
      setEmailForm({ new_email: "", current_password: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-12 max-w-4xl">
      <form onSubmit={saveName} className="space-y-5" data-testid="profile-form">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.profile")}</h2>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.fullName")}
          </label>
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            data-testid="profile-name"
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
          />
        </div>
        <button type="submit" disabled={busy} data-testid="profile-save"
          className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
          {busy ? "…" : t("common.save")}
        </button>
      </form>

      <form onSubmit={requestEmailChange} className="space-y-5" data-testid="email-change-form">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.changeEmail")}</h2>
        {emailSentTo ? (
          <div className="border border-ink p-5 text-sm" data-testid="email-change-sent">
            <p className="font-bold">{t("account.emailSentTitle")}</p>
            <p className="text-foreground/70 mt-1">
              {t("account.emailSentBody")} <span className="font-mono">{emailSentTo}</span>
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
                {t("account.newEmail")}
              </label>
              <input
                type="email" required value={emailForm.new_email}
                onChange={(e) => setEmailForm({ ...emailForm, new_email: e.target.value })}
                data-testid="email-change-new"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
                {t("account.currentPassword")}
              </label>
              <input
                type="password" required value={emailForm.current_password}
                onChange={(e) => setEmailForm({ ...emailForm, current_password: e.target.value })}
                data-testid="email-change-password"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
              />
            </div>
            <button type="submit" disabled={emailBusy} data-testid="email-change-submit"
              className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 hover:bg-ink hover:text-white disabled:opacity-50">
              {emailBusy ? "…" : t("account.sendConfirmation")}
            </button>
            <p className="text-xs text-foreground/60">{t("account.emailChangeHint")}</p>
          </>
        )}
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- Addresses */
function AddressesTab({ t }) {
  const [addresses, setAddresses] = useState(null);
  const [editing, setEditing] = useState(null); // null | {…EMPTY_ADDRESS} | existing
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/account/addresses").then((r) => setAddresses(r.data)).catch(() => setAddresses([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing.id) await api.put(`/account/addresses/${editing.id}`, editing);
      else await api.post("/account/addresses", editing);
      setEditing(null);
      load();
      toast.success(t("account.addressSaved"));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t("account.addressDeleteConfirm"))) return;
    try {
      await api.delete(`/account/addresses/${id}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const setDefault = async (a) => {
    try {
      await api.put(`/account/addresses/${a.id}`, { ...a, is_default: true });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  if (addresses === null) {
    return <p className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/50">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.addresses")}</h2>
        {!editing && (
          <button onClick={() => setEditing({ ...EMPTY_ADDRESS })} data-testid="address-add"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3">
            + {t("account.addAddress")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="border border-ink p-6 mb-8 grid sm:grid-cols-2 gap-4" data-testid="address-form">
          <Field label={t("account.addressLabel")} value={editing.label}
                 onChange={(v) => setEditing({ ...editing, label: v })} testid="address-label" />
          <Field label={t("checkout.fullName")} value={editing.full_name} required
                 onChange={(v) => setEditing({ ...editing, full_name: v })} testid="address-fullname" />
          <Field label={t("checkout.address1")} value={editing.address1} required className="sm:col-span-2"
                 onChange={(v) => setEditing({ ...editing, address1: v })} testid="address-address1" />
          <Field label={t("checkout.address2")} value={editing.address2} className="sm:col-span-2"
                 onChange={(v) => setEditing({ ...editing, address2: v })} testid="address-address2" />
          <Field label={t("checkout.city")} value={editing.city} required
                 onChange={(v) => setEditing({ ...editing, city: v })} testid="address-city" />
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
              {t("checkout.province")}
            </label>
            <select value={editing.province} data-testid="address-province"
              onChange={(e) => setEditing({ ...editing, province: e.target.value })}
              className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none">
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Field label={t("checkout.postal")} value={editing.postal_code} required
                 onChange={(v) => setEditing({ ...editing, postal_code: v })} testid="address-postal" />
          <Field label={t("checkout.phone")} value={editing.phone}
                 onChange={(v) => setEditing({ ...editing, phone: v })} testid="address-phone" />
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] sm:col-span-2">
            <input type="checkbox" checked={editing.is_default} data-testid="address-default"
              onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
            {t("account.defaultAddress")}
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} data-testid="address-save"
              className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
              {busy ? "…" : t("common.save")}
            </button>
            <button type="button" onClick={() => setEditing(null)} data-testid="address-cancel"
              className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !editing ? (
        <div className="border border-ink p-8 text-center text-foreground/70" data-testid="addresses-empty">
          {t("account.noAddresses")}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {addresses.map((a) => (
            <div key={a.id} className={`border p-5 ${a.is_default ? "border-ink" : "border-ink/30"}`}
                 data-testid={`address-card-${a.id}`}>
              <div className="flex items-start justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                  {a.label || t("account.addressLabel")}
                  {a.is_default && <span className="ml-2 bg-ink text-white px-1.5 py-0.5">{t("account.default")}</span>}
                </div>
              </div>
              <div className="mt-2 text-sm">
                <div className="font-bold">{a.full_name}</div>
                <div>{a.address1}{a.address2 ? `, ${a.address2}` : ""}</div>
                <div>{a.city}, {a.province} {a.postal_code}</div>
                {a.phone && <div className="text-foreground/60">{a.phone}</div>}
              </div>
              <div className="flex gap-4 mt-4 font-mono text-[10px] uppercase tracking-[0.2em]">
                <button onClick={() => setEditing(a)} className="link-underline" data-testid={`address-edit-${a.id}`}>
                  {t("common.edit")}
                </button>
                {!a.is_default && (
                  <button onClick={() => setDefault(a)} className="link-underline" data-testid={`address-setdefault-${a.id}`}>
                    {t("account.makeDefault")}
                  </button>
                )}
                <button onClick={() => remove(a.id)} className="link-underline text-signal" data-testid={`address-delete-${a.id}`}>
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required = false, className = "", testid }) {
  return (
    <div className={className}>
      <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{label}</label>
      <input
        required={required} value={value || ""} onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Security */
function SecurityTab({ t, logout, navigate }) {
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) {
      toast.error(t("account.passwordMismatch"));
      return;
    }
    setPwBusy(true);
    try {
      await api.put("/account/password", {
        current_password: pw.current_password,
        new_password: pw.new_password,
      });
      // Le backend révoque toutes les autres sessions et repose un cookie
      // httpOnly frais pour CET appareil — rien à stocker côté JS.
      setPw({ current_password: "", new_password: "", confirm: "" });
      toast.success(t("account.passwordChanged"));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const logoutAll = async () => {
    try {
      await api.post("/auth/logout-all");
    } catch { /* ignore */ }
    localStorage.removeItem("fironova_token");
    logout();
    navigate("/login");
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    if (!window.confirm(t("account.deleteConfirm"))) return;
    setDelBusy(true);
    try {
      await api.post("/account/delete", { current_password: delPassword });
      localStorage.removeItem("fironova_token");
      toast.success(t("account.deleted"));
      logout();
      navigate("/");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-14">
      <form onSubmit={changePassword} className="space-y-5 max-w-md" data-testid="password-form">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.changePassword")}</h2>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.currentPassword")}
          </label>
          <input type="password" required value={pw.current_password} data-testid="password-current"
            onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.newPassword")}
          </label>
          <input type="password" required minLength={8} value={pw.new_password} data-testid="password-new"
            onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.confirmPassword")}
          </label>
          <input type="password" required minLength={8} value={pw.confirm} data-testid="password-confirm"
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
        </div>
        <button type="submit" disabled={pwBusy} data-testid="password-save"
          className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
          {pwBusy ? "…" : t("account.changePassword")}
        </button>
        <p className="text-xs text-foreground/60">{t("account.passwordHint")}</p>
      </form>

      <div className="max-w-md">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight mb-3">{t("account.sessions")}</h2>
        <p className="text-sm text-foreground/70 mb-4">{t("account.sessionsHint")}</p>
        <button onClick={logoutAll} data-testid="logout-all"
          className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 hover:bg-ink hover:text-white">
          {t("account.logoutAll")}
        </button>
      </div>

      <div className="max-w-md border-t border-signal/40 pt-10">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-signal mb-3">
          {t("account.dangerZone")}
        </h2>
        <p className="text-sm text-foreground/70 mb-4">{t("account.deleteHint")}</p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} data-testid="delete-account-reveal"
            className="border border-signal text-signal font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 hover:bg-signal hover:text-white">
            {t("account.deleteAccount")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-4" data-testid="delete-account-form">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
                {t("account.currentPassword")}
              </label>
              <input type="password" required value={delPassword} data-testid="delete-account-password"
                onChange={(e) => setDelPassword(e.target.value)}
                className="w-full border-b border-signal px-1 py-3 bg-transparent focus:outline-none" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={delBusy} data-testid="delete-account-confirm"
                className="bg-signal text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
                {delBusy ? "…" : t("account.deleteForever")}
              </button>
              <button type="button" onClick={() => { setShowDelete(false); setDelPassword(""); }}
                className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
