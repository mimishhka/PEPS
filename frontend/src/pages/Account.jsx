// frontend/src/pages/Account.jsx — Mon Compte étendu (identité Fironova).
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

const statusColor = {
  awaiting_etransfer: "bg-ash/40 text-nordfjord",
  awaiting_crypto: "bg-ash/40 text-nordfjord",
  paid: "bg-nordfjord text-white",
  shipped: "bg-warning text-white",
  delivered: "bg-success text-white",
  pending: "bg-ash/40 text-nordfjord",
};

const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

const EMPTY_ADDRESS = {
  label: "", full_name: "", address1: "", address2: "",
  city: "", province: "QC", postal_code: "", country: "CA", phone: "", is_default: false,
};

export default function Account() {
  useDocumentHead({ title: "My Account", path: "/account", noindex: true });
  const { user, logout, refresh } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState("orders");

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-16" data-testid="account-page">
        <div className="flex items-end justify-between border-b border-ash pb-6 mb-8">
          <div>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-2">ACCOUNT</p>
            <h1 className="font-display text-[40px] font-bold text-nordfjord" data-testid="account-name">{user?.name}</h1>
            <p className="font-data text-xs text-glacier mt-1">{user?.email}</p>
          </div>
          <button onClick={logout} data-testid="account-logout" className="font-data text-xs uppercase tracking-[0.2em] text-glacier hover:text-nordfjord transition-colors">
            {t("nav.logout")} →
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-ash mb-10" data-testid="account-tabs">
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
              className={`font-data text-xs uppercase tracking-[0.18em] px-5 py-3 -mb-px border-b-2 transition-colors ${
                tab === key ? "border-nova text-nordfjord font-bold" : "border-transparent text-glacier hover:text-nordfjord"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "orders" && <OrdersTab t={t} lang={lang} />}
        {tab === "profile" && <ProfileTab t={t} user={user} refresh={refresh} />}
        {tab === "addresses" && <AddressesTab t={t} />}
        {tab === "security" && <SecurityTab t={t} logout={logout} navigate={navigate} />}
      </div>
    </div>
  );
}

/* Orders */
function OrdersTab({ t, lang }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api.get("/orders/mine").then((r) => setOrders(r.data)).catch(() => setOrders([]));
  }, []);
  if (orders === null) {
    return <p className="font-data text-xs uppercase tracking-[0.2em] text-glacier">{t("common.loading")}</p>;
  }
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-ash bg-white p-8 text-center" data-testid="account-no-orders">
        <p className="text-glacier">{t("account.noOrders")}</p>
        <Link to="/catalog" className="inline-block mt-4 btn-pill btn-nova">{t("nav.catalog")} →</Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-ash bg-white overflow-x-auto">
      <table className="w-full font-data text-xs">
        <thead className="bg-nordfjord text-white">
          <tr>
            <th className="px-4 py-3 text-left uppercase tracking-[0.16em]">{t("account.orderNumber")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.16em]">{t("account.date")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.16em]">Items</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.16em]">{t("account.status")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.16em]">{t("account.shipping") || "Expédition"}</th>
            <th className="px-4 py-3 text-right uppercase tracking-[0.16em]">{t("account.total")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-ash hover:bg-clinical" data-testid={`order-row-${o.order_number}`}>
              <td className="px-4 py-4">
                <Link to={`/order/${o.id}`} className="font-bold text-nordfjord hover:text-nova">{o.order_number}</Link>
              </td>
              <td className="px-4 py-4 text-glacier">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-4 text-nordfjord">{o.items.length}</td>
              <td className="px-4 py-4">
                <span className={`rounded-full px-2.5 py-1 uppercase tracking-[0.12em] text-[10px] ${statusColor[o.payment_status] || "bg-ash/40 text-nordfjord"}`}>
                  {o.payment_status}
                </span>
              </td>
              <td className="px-4 py-4">
                {(() => {
                  const info = o.shipping_info || {};
                  const pin = info.tracking_number;
                  const fs = o.fulfillment_status;
                  if (pin) {
                    return (
                      <a
                        href={`https://www.canadapost-postescanada.ca/track-reperage/${lang === "fr" ? "fr" : "en"}#/resultList?searchFor=${pin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-nova underline font-medium"
                        data-testid={`order-tracking-${o.order_number}`}
                      >
                        {pin}
                      </a>
                    );
                  }
                  const map = {
                    processing: lang === "fr" ? "En traitement" : "Processing",
                    packing: lang === "fr" ? "En préparation" : "Preparing",
                    packed: lang === "fr" ? "Prête à expédier" : "Ready to ship",
                    shipped: lang === "fr" ? "Expédiée" : "Shipped",
                    delivered: lang === "fr" ? "Livrée" : "Delivered",
                  };
                  return <span className="text-glacier">{map[fs] || "—"}</span>;
                })()}
              </td>
              <td className="px-4 py-4 text-right font-bold text-nordfjord">${o.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Profile */
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
        <h2 className="font-display text-2xl font-bold text-nordfjord">{t("account.profile")}</h2>
        <div>
          <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.fullName")}</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name"
            className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
        </div>
        <button type="submit" disabled={busy} data-testid="profile-save" className="btn-pill btn-nova disabled:opacity-50">
          {busy ? "…" : t("common.save")}
        </button>
      </form>

      <form onSubmit={requestEmailChange} className="space-y-5" data-testid="email-change-form">
        <h2 className="font-display text-2xl font-bold text-nordfjord">{t("account.changeEmail")}</h2>
        {emailSentTo ? (
          <div className="rounded-2xl border border-ash bg-white p-5 text-sm" data-testid="email-change-sent">
            <p className="font-bold text-nordfjord">{t("account.emailSentTitle")}</p>
            <p className="text-glacier mt-1">{t("account.emailSentBody")} <span className="font-data text-nordfjord">{emailSentTo}</span></p>
          </div>
        ) : (
          <>
            <div>
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.newEmail")}</label>
              <input type="email" required value={emailForm.new_email}
                onChange={(e) => setEmailForm({ ...emailForm, new_email: e.target.value })} data-testid="email-change-new"
                className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
            </div>
            <div>
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.currentPassword")}</label>
              <input type="password" required value={emailForm.current_password}
                onChange={(e) => setEmailForm({ ...emailForm, current_password: e.target.value })} data-testid="email-change-password"
                className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
            </div>
            <button type="submit" disabled={emailBusy} data-testid="email-change-submit" className="btn-pill btn-outline disabled:opacity-50">
              {emailBusy ? "…" : t("account.sendConfirmation")}
            </button>
            <p className="text-xs text-glacier">{t("account.emailChangeHint")}</p>
          </>
        )}
      </form>
    </div>
  );
}

/* Addresses */
function AddressesTab({ t }) {
  const [addresses, setAddresses] = useState(null);
  const [editing, setEditing] = useState(null);
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
    return <p className="font-data text-xs uppercase tracking-[0.2em] text-glacier">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold text-nordfjord">{t("account.addresses")}</h2>
        {!editing && (
          <button onClick={() => setEditing({ ...EMPTY_ADDRESS })} data-testid="address-add" className="btn-pill btn-nova">
            + {t("account.addAddress")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="rounded-2xl border border-ash bg-white p-6 mb-8 grid sm:grid-cols-2 gap-4" data-testid="address-form">
          <Field label={t("account.addressLabel")} value={editing.label} onChange={(v) => setEditing({ ...editing, label: v })} testid="address-label" />
          <Field label={t("checkout.fullName")} value={editing.full_name} required onChange={(v) => setEditing({ ...editing, full_name: v })} testid="address-fullname" />
          <Field label={t("checkout.address1")} value={editing.address1} required className="sm:col-span-2" onChange={(v) => setEditing({ ...editing, address1: v })} testid="address-address1" />
          <Field label={t("checkout.address2")} value={editing.address2} className="sm:col-span-2" onChange={(v) => setEditing({ ...editing, address2: v })} testid="address-address2" />
          <Field label={t("checkout.city")} value={editing.city} required onChange={(v) => setEditing({ ...editing, city: v })} testid="address-city" />
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("checkout.province")}</label>
            <select value={editing.province} data-testid="address-province"
              onChange={(e) => setEditing({ ...editing, province: e.target.value })}
              className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord focus:outline-none focus:border-nova">
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Field label={t("checkout.postal")} value={editing.postal_code} required onChange={(v) => setEditing({ ...editing, postal_code: v })} testid="address-postal" />
          <Field label={t("checkout.phone")} value={editing.phone} onChange={(v) => setEditing({ ...editing, phone: v })} testid="address-phone" />
          <label className="flex items-center gap-2 font-data text-xs uppercase tracking-[0.14em] text-nordfjord sm:col-span-2">
            <input type="checkbox" checked={editing.is_default} data-testid="address-default"
              onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} className="accent-[#00B8D4]" />
            {t("account.defaultAddress")}
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} data-testid="address-save" className="btn-pill btn-nova disabled:opacity-50">
              {busy ? "…" : t("common.save")}
            </button>
            <button type="button" onClick={() => setEditing(null)} data-testid="address-cancel" className="btn-pill btn-outline">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !editing ? (
        <div className="rounded-2xl border border-ash bg-white p-8 text-center text-glacier" data-testid="addresses-empty">
          {t("account.noAddresses")}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {addresses.map((a) => (
            <div key={a.id} className={`rounded-2xl border bg-white p-5 ${a.is_default ? "border-nova" : "border-ash"}`} data-testid={`address-card-${a.id}`}>
              <div className="flex items-start justify-between">
                <div className="font-data text-[10px] uppercase tracking-[0.16em] text-compliance">
                  {a.label || t("account.addressLabel")}
                  {a.is_default && <span className="ml-2 rounded-full bg-nordfjord text-white px-2 py-0.5">{t("account.default")}</span>}
                </div>
              </div>
              <div className="mt-2 text-sm text-nordfjord">
                <div className="font-bold">{a.full_name}</div>
                <div>{a.address1}{a.address2 ? `, ${a.address2}` : ""}</div>
                <div>{a.city}, {a.province} {a.postal_code}</div>
                {a.phone && <div className="text-glacier">{a.phone}</div>}
              </div>
              <div className="flex gap-4 mt-4 font-data text-[10px] uppercase tracking-[0.16em]">
                <button onClick={() => setEditing(a)} className="text-glacier hover:text-nordfjord" data-testid={`address-edit-${a.id}`}>
                  {t("common.edit")}
                </button>
                {!a.is_default && (
                  <button onClick={() => setDefault(a)} className="text-glacier hover:text-nordfjord" data-testid={`address-setdefault-${a.id}`}>
                    {t("account.makeDefault")}
                  </button>
                )}
                <button onClick={() => remove(a.id)} className="text-error hover:opacity-70" data-testid={`address-delete-${a.id}`}>
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
      <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{label}</label>
      <input required={required} value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={testid}
        className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
    </div>
  );
}

/* Security */
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
        <h2 className="font-display text-2xl font-bold text-nordfjord">{t("account.changePassword")}</h2>
        <div>
          <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.currentPassword")}</label>
          <input type="password" required value={pw.current_password} data-testid="password-current"
            onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
            className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
        </div>
        <div>
          <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.newPassword")}</label>
          <input type="password" required minLength={8} value={pw.new_password} data-testid="password-new"
            onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
            className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
        </div>
        <div>
          <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.confirmPassword")}</label>
          <input type="password" required minLength={8} value={pw.confirm} data-testid="password-confirm"
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
        </div>
        <button type="submit" disabled={pwBusy} data-testid="password-save" className="btn-pill btn-nova disabled:opacity-50">
          {pwBusy ? "…" : t("account.changePassword")}
        </button>
        <p className="text-xs text-glacier">{t("account.passwordHint")}</p>
      </form>

      <div className="max-w-md">
        <h2 className="font-display text-2xl font-bold text-nordfjord mb-3">{t("account.sessions")}</h2>
        <p className="text-sm text-glacier mb-4">{t("account.sessionsHint")}</p>
        <button onClick={logoutAll} data-testid="logout-all" className="btn-pill btn-outline">
          {t("account.logoutAll")}
        </button>
      </div>

      <div className="max-w-md border-t border-error/40 pt-10">
        <h2 className="font-display text-2xl font-bold text-error mb-3">{t("account.dangerZone")}</h2>
        <p className="text-sm text-glacier mb-4">{t("account.deleteHint")}</p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} data-testid="delete-account-reveal"
            className="rounded-full border-[1.5px] border-error text-error font-data text-xs uppercase tracking-[0.2em] px-6 py-3 hover:bg-error hover:text-white transition-colors">
            {t("account.deleteAccount")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-4" data-testid="delete-account-form">
            <div>
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.currentPassword")}</label>
              <input type="password" required value={delPassword} data-testid="delete-account-password"
                onChange={(e) => setDelPassword(e.target.value)}
                className="w-full rounded-full border border-error px-5 py-3 bg-white text-nordfjord outline-none" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={delBusy} data-testid="delete-account-confirm"
                className="rounded-full bg-error text-white font-data text-xs uppercase tracking-[0.2em] px-6 py-3 disabled:opacity-50">
                {delBusy ? "…" : t("account.deleteForever")}
              </button>
              <button type="button" onClick={() => { setShowDelete(false); setDelPassword(""); }} className="btn-pill btn-outline">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
