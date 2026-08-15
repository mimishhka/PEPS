// frontend/src/pages/Account.jsx — Mon Compte étendu (identité Fironova).
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import useAffiliate from "../hooks/useAffiliate";
import { useConfirm } from "../components/ConfirmDialog";

// Statuts de paiement : couleur + libellé lisible bilingue.
const PAYMENT_STATUS = {
  awaiting_etransfer: { cls: "bg-warning/15 text-warning border border-warning/30", fr: "En attente · Interac", en: "Awaiting · Interac" },
  awaiting_crypto:    { cls: "bg-warning/15 text-warning border border-warning/30", fr: "En attente · crypto", en: "Awaiting · crypto" },
  pending:            { cls: "bg-ash/40 text-nordfjord border border-ash", fr: "En attente", en: "Pending" },
  paid:               { cls: "bg-nova/15 text-nova border border-nova/30", fr: "Payée", en: "Paid" },
  refunded:           { cls: "bg-glacier/15 text-glacier border border-glacier/30", fr: "Remboursée", en: "Refunded" },
  cancelled:          { cls: "bg-error/10 text-error border border-error/25", fr: "Annulée", en: "Cancelled" },
  expired:            { cls: "bg-error/10 text-error border border-error/25", fr: "Expirée", en: "Expired" },
  failed:             { cls: "bg-error/10 text-error border border-error/25", fr: "Échouée", en: "Failed" },
};
function paymentBadge(status, lang) {
  const s = PAYMENT_STATUS[status] || { cls: "bg-ash/40 text-nordfjord border border-ash", fr: status, en: status };
  return { cls: s.cls, label: lang === "fr" ? s.fr : s.en };
}
const FULFILL_LABEL = {
  processing: { fr: "En traitement", en: "Processing" },
  packing:    { fr: "En préparation", en: "Preparing" },
  packed:     { fr: "Prête à expédier", en: "Ready to ship" },
  shipped:    { fr: "Expédiée", en: "Shipped" },
  delivered:  { fr: "Livrée", en: "Delivered" },
  preorder:   { fr: "Précommande", en: "Pre-order" },
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

  const { affiliate } = useAffiliate(lang);
  const isActiveAffiliate = affiliate?.status === "active";

  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-16" data-testid="account-page">
        <div className="rounded-3xl border border-ash bg-white p-6 sm:p-7 mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="w-14 h-14 rounded-2xl bg-nordfjord text-white flex items-center justify-center font-display font-extrabold text-xl shrink-0"
              aria-hidden="true"
            >
              {(user?.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-data text-[10px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {lang === "fr" ? "MON COMPTE" : "MY ACCOUNT"}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-nordfjord leading-tight truncate" data-testid="account-name">{user?.name}</h1>
              <p className="font-data text-xs text-glacier mt-0.5 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={logout} data-testid="account-logout" className="font-data text-xs uppercase tracking-[0.2em] text-glacier hover:text-error transition-colors shrink-0">
            {t("nav.logout")} →
          </button>
        </div>

        {isActiveAffiliate && (
          <Link
            to="/affiliate"
            data-testid="account-affiliate-link"
            className="group rounded-2xl border border-nova/40 bg-gradient-to-br from-nova/8 to-transparent p-5 sm:p-6 mb-8 flex items-center gap-4 flex-wrap hover:border-nova hover:shadow-md transition"
          >
            <div className="w-11 h-11 rounded-xl bg-nova text-nordfjord flex items-center justify-center font-display font-extrabold text-lg shrink-0" aria-hidden="true">
              ★
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-data text-[10px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {lang === "fr" ? "PROGRAMME AFFILIÉ · ACTIF" : "AFFILIATE PROGRAM · ACTIVE"}
              </p>
              <p className="font-display text-lg font-bold text-nordfjord leading-tight">
                {lang === "fr" ? "Mon programme affilié" : "My affiliate program"}
              </p>
              <p className="font-data text-xs text-glacier mt-1">
                {lang === "fr"
                  ? <>Code : <span className="text-nordfjord font-bold">{affiliate.code}</span> · Consultez vos revenus, clics et meilleurs produits</>
                  : <>Code: <span className="text-nordfjord font-bold">{affiliate.code}</span> · Track your earnings, clicks and best-selling products</>}
              </p>
            </div>
            <span className="font-data text-xs font-semibold uppercase tracking-[0.18em] text-nordfjord group-hover:text-nova transition-colors shrink-0">
              {lang === "fr" ? "Ouvrir le tableau de bord" : "Open dashboard"} →
            </span>
          </Link>
        )}

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
        {tab === "security" && <SecurityTab t={t} user={user} logout={logout} navigate={navigate} />}
      </div>
    </div>
  );
}

/* Orders */
function OrderCard({ o, t, lang }) {
  const badge = paymentBadge(o.payment_status, lang);
  const pin = (o.shipping_info || {}).tracking_number;
  const fl = FULFILL_LABEL[o.fulfillment_status];
  return (
    <Link
      to={`/order/${o.id}`}
      data-testid={`order-row-${o.order_number}`}
      className="flex items-center gap-4 rounded-xl border border-ash bg-white px-4 py-3 hover:border-nova transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-nordfjord text-sm truncate">{o.order_number}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold font-data uppercase tracking-[0.08em] ${badge.cls}`}>{badge.label}</span>
        </div>
        <div className="font-data text-[11px] text-glacier mt-0.5 truncate">
          {new Date(o.created_at).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" })}
          {" · "}{o.items.length} {o.items.length > 1 ? (lang === "fr" ? "articles" : "items") : (lang === "fr" ? "article" : "item")}
          {pin ? (
            <> · <a href={`https://www.canadapost-postescanada.ca/track-reperage/${lang === "fr" ? "fr" : "en"}#/resultList?searchFor=${pin}`}
              target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="text-nova underline" data-testid={`order-tracking-${o.order_number}`}>{lang === "fr" ? "suivi" : "track"}</a></>
          ) : fl ? <> · {lang === "fr" ? fl.fr : fl.en}</> : null}
        </div>
      </div>
      <div className="font-display font-bold text-nordfjord text-sm shrink-0">${o.total.toFixed(2)}</div>
    </Link>
  );
}

function OrdersTab({ t, lang }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api.get("/orders/mine").then((r) => setOrders(r.data)).catch(() => setOrders([]));
  }, []);

  if (orders === null) {
    return (
      <div className="space-y-2" data-testid="account-orders-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-ash bg-white px-4 py-3 animate-pulse flex items-center gap-4">
            <div className="flex-1"><div className="h-3.5 w-32 bg-ash/50 rounded mb-2" /><div className="h-2.5 w-24 bg-ash/40 rounded" /></div>
            <div className="h-3.5 w-14 bg-ash/50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-ash bg-white p-10 text-center" data-testid="account-no-orders">
        <p className="font-display text-lg font-bold text-nordfjord">{lang === "fr" ? "Aucune commande pour l'instant" : "No orders yet"}</p>
        <p className="text-glacier mt-1">{t("account.noOrders")}</p>
        <Link to="/catalog" className="inline-block mt-5 btn-pill btn-nova">{t("nav.catalog")} →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="account-orders">
      {orders.map((o) => <OrderCard key={o.id} o={o} t={t} lang={lang} />)}
    </div>
  );
}

/* Profile */
function ProfileTab({ t, user, refresh }) {
  const pwLess = !!user?.passwordless;
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
      const payload = pwLess ? { new_email: emailForm.new_email } : emailForm;
      const { data } = await api.post("/account/email/request-change", payload);
      setEmailSentTo(data.sent_to);
      setEmailForm({ new_email: "", current_password: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5 max-w-4xl">
      <form onSubmit={saveName} className="rounded-2xl border border-ash bg-white p-6 space-y-5 self-start" data-testid="profile-form">
        <h2 className="font-display text-lg font-bold text-nordfjord">{t("account.profile")}</h2>
        <div>
          <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.fullName")}</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name"
            className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
        </div>
        <button type="submit" disabled={busy} data-testid="profile-save" className="btn-pill btn-nova disabled:opacity-50">
          {busy ? "…" : t("common.save")}
        </button>
      </form>

      <form onSubmit={requestEmailChange} className="rounded-2xl border border-ash bg-white p-6 space-y-5 self-start" data-testid="email-change-form">
        <h2 className="font-display text-lg font-bold text-nordfjord">{t("account.changeEmail")}</h2>
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
            {!pwLess && (
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.currentPassword")}</label>
                <input type="password" required value={emailForm.current_password}
                  onChange={(e) => setEmailForm({ ...emailForm, current_password: e.target.value })} data-testid="email-change-password"
                  className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
              </div>
            )}
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
  const confirm = useConfirm();
  const [addresses, setAddresses] = useState([]);
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
    if (!await confirm({ title: t("account.addressDeleteConfirm"), destructive: true, confirmLabel: t("common.delete") || "Delete", cancelLabel: t("common.cancel") || "Cancel" })) return;
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
        <h2 className="font-display text-lg font-bold text-nordfjord">{t("account.addresses")}</h2>
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
function SecurityTab({ t, user, logout, navigate }) {
  const confirm = useConfirm();
  const pwLess = !!user?.passwordless;
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
        ...(pwLess ? {} : { current_password: pw.current_password }),
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
    logout();
    navigate("/login");
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    if (!await confirm({ title: t("account.deleteConfirm"), destructive: true, confirmLabel: t("common.delete") || "Delete", cancelLabel: t("common.cancel") || "Cancel" })) return;
    setDelBusy(true);
    try {
      await api.post("/account/delete", pwLess ? {} : { current_password: delPassword });
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
    <div className="max-w-2xl space-y-5">
      <form onSubmit={changePassword} className="rounded-2xl border border-ash bg-white p-6 space-y-5" data-testid="password-form">
        <h2 className="font-display text-lg font-bold text-nordfjord">
          {pwLess ? (t("account.setPassword") || "Définir un mot de passe / Set a password") : t("account.changePassword")}
        </h2>
        {pwLess && (
          <p className="text-sm text-glacier">
            {t("account.setPasswordHint") || "Votre compte utilise les liens de connexion. Définissez un mot de passe pour aussi vous connecter avec. / Your account uses sign-in links. Set a password to also sign in with one."}
          </p>
        )}
        {!pwLess && (
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.currentPassword")}</label>
            <input type="password" required value={pw.current_password} data-testid="password-current"
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
              className="w-full rounded-full border border-ash px-5 py-3 bg-white text-nordfjord outline-none focus:border-nova" />
          </div>
        )}
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
          {pwBusy ? "…" : (pwLess ? (t("account.setPassword") || "Définir / Set") : t("account.changePassword"))}
        </button>
        <p className="text-xs text-glacier">{t("account.passwordHint")}</p>
      </form>

      <div className="rounded-2xl border border-ash bg-white p-6">
        <h2 className="font-display text-lg font-bold text-nordfjord mb-3">{t("account.sessions")}</h2>
        <p className="text-sm text-glacier mb-4">{t("account.sessionsHint")}</p>
        <button onClick={logoutAll} data-testid="logout-all" className="btn-pill btn-outline">
          {t("account.logoutAll")}
        </button>
      </div>

      <div className="rounded-2xl border border-error/30 bg-error/[0.03] p-6">
        <h2 className="font-display text-lg font-bold text-error mb-3">{t("account.dangerZone")}</h2>
        <p className="text-sm text-glacier mb-4">{t("account.deleteHint")}</p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} data-testid="delete-account-reveal"
            className="rounded-full border-[1.5px] border-error text-error font-data text-xs uppercase tracking-[0.2em] px-6 py-3 hover:bg-error hover:text-white transition-colors">
            {t("account.deleteAccount")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-4" data-testid="delete-account-form">
            {!pwLess && (
              <div>
                <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("account.currentPassword")}</label>
                <input type="password" required value={delPassword} data-testid="delete-account-password"
                  onChange={(e) => setDelPassword(e.target.value)}
                  className="w-full rounded-full border border-error px-5 py-3 bg-white text-nordfjord outline-none" />
              </div>
            )}
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
