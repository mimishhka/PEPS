import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { useAuth } from "../contexts/AuthContext";
import { VialArt } from "../components/brand";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40);
}

const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Québec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];
const SHIPPING_FLAT = 20.0;
const FREE_SHIPPING_THRESHOLD = 200.0;

export default function Checkout() {
  useDocumentHead({ title: "Checkout", path: "/checkout", noindex: true });
  const navigate = useNavigate();
  const { lang, t } = useLang();
  const { user } = useAuth();
  const { items, subtotal, clear } = useCart();

  const [form, setForm] = useState({
    email: user?.email || "",
    full_name: user?.name || "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    province: "QC",
    postal_code: "",
    country: "CA",
  });
  const [paymentMethod, setPaymentMethod] = useState("interac");
  const [payCurrency, setPayCurrency] = useState("btc");
  const [ack, setAck] = useState({ a1: false, a2: false, a3: false });
  const [submitting, setSubmitting] = useState(false);
  const [coupon, setCoupon] = useState({ code: "", applied: null, error: "" });

  const [savedAddresses, setSavedAddresses] = useState([]);
  const applySavedAddress = (a) => {
    setForm((f) => ({
      ...f,
      full_name: a.full_name,
      phone: a.phone || "",
      address1: a.address1,
      address2: a.address2 || "",
      city: a.city,
      province: a.province,
      postal_code: a.postal_code,
      country: a.country || "CA",
    }));
  };
  useEffect(() => {
    if (!user) return;
    api.get("/account/addresses")
      .then((r) => {
        setSavedAddresses(r.data);
        const def = r.data.find((a) => a.is_default);
        if (def) applySavedAddress(def);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const discount = coupon.applied?.discount_amount || 0;
  const shipping = useMemo(() => (Math.max(0, subtotal - discount) >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT), [subtotal, discount]);
  const total = useMemo(() => +(Math.max(0, subtotal - discount) + shipping).toFixed(2), [subtotal, discount, shipping]);

  const applyCoupon = async () => {
    if (!coupon.code.trim()) return;
    try {
      const { data } = await api.post(`/coupons/validate?code=${encodeURIComponent(coupon.code.trim())}&subtotal=${subtotal}`);
      setCoupon({ code: data.code, applied: data, error: "" });
      toast.success(`Coupon ${data.code} applied — ${data.discount_type === "percent" ? data.value + "%" : "$" + data.value} off`);
    } catch (e) {
      setCoupon({ code: coupon.code, applied: null, error: formatApiError(e.response?.data?.detail) });
    }
  };
  const removeCoupon = () => setCoupon({ code: "", applied: null, error: "" });

  if (items.length === 0) {
    return (
      <div className="bg-clinical min-h-[70vh] flex flex-col items-center justify-center gap-6 p-16 text-center" data-testid="checkout-empty">
        <p className="text-glacier">{t("cart.empty")}</p>
        <button onClick={() => navigate("/catalog")} className="btn-pill btn-nova">
          {t("cart.keepShopping")} →
        </button>
      </div>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!ack.a1 || !ack.a2 || !ack.a3) {
      toast.error("Please confirm all compliance items.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/checkout", {
        items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, qty: i.qty })),
        email: form.email,
        shipping: {
          full_name: form.full_name,
          address1: form.address1,
          address2: form.address2,
          city: form.city,
          province: form.province,
          postal_code: form.postal_code,
          country: form.country,
          phone: form.phone,
        },
        payment_method: paymentMethod,
        pay_currency: payCurrency,
        coupon_code: coupon.applied?.code || null,
        origin_url: window.location.origin,
        accept_terms: ack.a3,
        confirm_age: ack.a1,
        confirm_research_use: ack.a2,
      });
      clear();
      if (paymentMethod === "stripe" && data.payment_info?.checkout_url) {
        window.location.href = data.payment_info.checkout_url;
        return;
      }
      navigate(`/order/${data.id}`, { state: { order: data } });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const payCard = (id, title, desc, testId) => (
    <button
      type="button"
      onClick={() => setPaymentMethod(id)}
      data-testid={testId}
      className={`p-5 text-left rounded-xl border-[1.5px] transition-colors ${paymentMethod === id ? "border-nova bg-nova/5" : "border-ash hover:border-nova"}`}
    >
      <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova">{paymentMethod === id ? "✓ SELECTED" : "SELECT"}</div>
      <div className="font-display text-lg font-bold mt-2 text-nordfjord">{title}</div>
      <div className="text-xs mt-1 text-glacier">{desc}</div>
    </button>
  );

  return (
    <div className="bg-clinical min-h-screen grid lg:grid-cols-[1.4fr_1fr]" data-testid="checkout-page">
      <form onSubmit={onSubmit} className="p-8 lg:p-12 space-y-12">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">CHECKOUT</p>
          <h1 className="font-display text-[40px] font-bold text-nordfjord">{t("checkout.title")}</h1>
        </div>

        <section className="space-y-4">
          <div className="font-data text-[11px] uppercase tracking-[0.2em] text-compliance">01 · {t("checkout.contact")}</div>
          <Input label={t("checkout.email")} required type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} testId="checkout-email" />
        </section>

        <section className="space-y-4">
          <div className="font-data text-[11px] uppercase tracking-[0.2em] text-compliance">02 · {t("checkout.shipping")}</div>
          {savedAddresses.length > 0 && (
            <div data-testid="saved-address-picker">
              <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("checkout.savedAddresses")}</div>
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => applySavedAddress(a)}
                    data-testid={`saved-address-${a.id}`}
                    className="rounded-full border border-ash px-4 py-2 font-data text-[10px] uppercase tracking-[0.14em] text-nordfjord hover:border-nova hover:text-nova"
                  >
                    {a.label || a.address1}{a.is_default ? " ★" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Input label={t("checkout.fullName")} required value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} testId="checkout-name" />
          <Input label={t("checkout.phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testId="checkout-phone" />
          <Input label={t("checkout.address1")} required value={form.address1} onChange={(v) => setForm({ ...form, address1: v })} testId="checkout-address1" />
          <Input label={t("checkout.address2")} value={form.address2} onChange={(v) => setForm({ ...form, address2: v })} testId="checkout-address2" />
          <div className="grid grid-cols-2 gap-4">
            <Input label={t("checkout.city")} required value={form.city} onChange={(v) => setForm({ ...form, city: v })} testId="checkout-city" />
            <Input label={t("checkout.postal")} required value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} testId="checkout-postal" />
          </div>
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("checkout.province")}</label>
            <select
              value={form.province}
              onChange={(e) => setForm({ ...form, province: e.target.value })}
              className="w-full rounded-full border border-ash px-5 py-3 bg-white font-data text-sm text-nordfjord focus:outline-none focus:border-nova"
              data-testid="checkout-province"
            >
              {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        </section>

        <section className="space-y-4">
          <div className="font-data text-[11px] uppercase tracking-[0.2em] text-compliance">03 · {t("checkout.payment")}</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {payCard("interac", t("checkout.interac"), t("checkout.interacDesc"), "payment-interac")}
            {payCard("stripe", "Card · Stripe", "Visa, Mastercard, Amex. Secure 3-D Secure checkout.", "payment-stripe")}
            {payCard("nowpayments", t("checkout.crypto"), t("checkout.cryptoDesc"), "payment-crypto")}
          </div>
          {paymentMethod === "nowpayments" && (
            <div>
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{t("checkout.payCurrency")}</label>
              <select
                value={payCurrency}
                onChange={(e) => setPayCurrency(e.target.value)}
                className="w-full rounded-full border border-ash px-5 py-3 bg-white font-data text-sm text-nordfjord focus:outline-none focus:border-nova"
                data-testid="checkout-pay-currency"
              >
                <option value="btc">Bitcoin (BTC)</option>
                <option
