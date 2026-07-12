import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";

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
      <div className="p-16 text-center" data-testid="checkout-empty">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/60">{t("cart.empty")}</p>
        <button onClick={() => navigate("/catalog")} className="mt-6 bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-4">
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
      // Stripe: redirect to hosted checkout
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

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] border-b border-ink" data-testid="checkout-page">
      <form onSubmit={onSubmit} className="p-8 lg:p-12 space-y-12 border-r border-ink/15">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// CHECKOUT</div>
          <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-3">{t("checkout.title")}</h1>
        </div>

        {/* Contact */}
        <section className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50">01 · {t("checkout.contact")}</div>
          <Input label={t("checkout.email")} required type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} testId="checkout-email" />
        </section>

        {/* Shipping */}
        <section className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50">02 · {t("checkout.shipping")}</div>
          <Input label={t("checkout.fullName")} required value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} testId="checkout-name" />
          <Input label={t("checkout.phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testId="checkout-phone" />
          <Input label={t("checkout.address1")} required value={form.address1} onChange={(v) => setForm({ ...form, address1: v })} testId="checkout-address1" />
          <Input label={t("checkout.address2")} value={form.address2} onChange={(v) => setForm({ ...form, address2: v })} testId="checkout-address2" />
          <div className="grid grid-cols-2 gap-4">
            <Input label={t("checkout.city")} required value={form.city} onChange={(v) => setForm({ ...form, city: v })} testId="checkout-city" />
            <Input label={t("checkout.postal")} required value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} testId="checkout-postal" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("checkout.province")}</label>
            <select
              value={form.province}
              onChange={(e) => setForm({ ...form, province: e.target.value })}
              className="w-full border-b border-ink px-1 py-3 bg-transparent font-mono text-sm focus:outline-none"
              data-testid="checkout-province"
            >
              {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        </section>

        {/* Payment */}
        <section className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50">03 · {t("checkout.payment")}</div>
          <div className="grid sm:grid-cols-3 gap-0 border border-ink">
            <button
              type="button"
              onClick={() => setPaymentMethod("interac")}
              data-testid="payment-interac"
              className={`p-5 text-left border-r border-ink ${paymentMethod === "interac" ? "bg-ink text-white" : "bg-white"}`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.25em]">{paymentMethod === "interac" ? "✓ SELECTED" : "SELECT"}</div>
              <div className="font-display text-lg font-bold mt-2">{t("checkout.interac")}</div>
              <div className="text-xs mt-1 opacity-80">{t("checkout.interacDesc")}</div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("stripe")}
              data-testid="payment-stripe"
              className={`p-5 text-left border-r border-ink ${paymentMethod === "stripe" ? "bg-ink text-white" : "bg-white"}`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.25em]">{paymentMethod === "stripe" ? "✓ SELECTED" : "SELECT"}</div>
              <div className="font-display text-lg font-bold mt-2">Card · Stripe</div>
              <div className="text-xs mt-1 opacity-80">Visa, Mastercard, Amex. Secure 3-D Secure checkout.</div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("nowpayments")}
              data-testid="payment-crypto"
              className={`p-5 text-left ${paymentMethod === "nowpayments" ? "bg-ink text-white" : "bg-white"}`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.25em]">{paymentMethod === "nowpayments" ? "✓ SELECTED" : "SELECT"}</div>
              <div className="font-display text-lg font-bold mt-2">{t("checkout.crypto")}</div>
              <div className="text-xs mt-1 opacity-80">{t("checkout.cryptoDesc")}</div>
            </button>
          </div>
          {paymentMethod === "nowpayments" && (
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{t("checkout.payCurrency")}</label>
              <select
                value={payCurrency}
                onChange={(e) => setPayCurrency(e.target.value)}
                className="w-full border-b border-ink px-1 py-3 bg-transparent font-mono text-sm focus:outline-none"
                data-testid="checkout-pay-currency"
              >
                <option value="btc">Bitcoin (BTC)</option>
                <option value="eth">Ethereum (ETH)</option>
                <option value="usdttrc20">Tether (USDT · TRC-20)</option>
                <option value="usdterc20">Tether (USDT · ERC-20)</option>
                <option value="ltc">Litecoin (LTC)</option>
                <option value="sol">Solana (SOL)</option>
              </select>
            </div>
          )}
        </section>

        {/* Compliance */}
        <section className="space-y-4 bg-secondary p-6 border border-ink/20">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-signal" style={{ color: "#E51919" }}>04 · COMPLIANCE — REQUIRED</div>
          <Checkbox checked={ack.a1} onChange={(c) => setAck({ ...ack, a1: c })} label={t("checkout.ack1")} testId="ack-age" />
          <Checkbox checked={ack.a2} onChange={(c) => setAck({ ...ack, a2: c })} label={t("checkout.ack2")} testId="ack-research" />
          <Checkbox checked={ack.a3} onChange={(c) => setAck({ ...ack, a3: c })} label={t("checkout.ack3")} testId="ack-terms" />
        </section>

        <button
          type="submit"
          disabled={submitting}
          data-testid="place-order-btn"
          className="w-full bg-ink text-white font-mono text-sm uppercase tracking-[0.3em] py-5 hover:bg-foreground/85 disabled:opacity-50"
        >
          {submitting ? t("checkout.processing") : `${t("checkout.placeOrder")} · $${total.toFixed(2)} CAD →`}
        </button>
      </form>

      {/* SUMMARY */}
      <aside className="p-8 lg:p-12 bg-secondary" data-testid="checkout-summary">
        <h3 className="font-display text-xl font-bold uppercase tracking-tight">{t("common.total")}</h3>
        <ul className="mt-6 divide-y divide-ink/15">
          {items.map((i) => {
            const name = lang === "fr" ? i.name_fr : i.name_en;
            return (
              <li key={i.product_id} className="grid grid-cols-[60px_1fr_auto] gap-3 py-3" data-testid={`summary-item-${i.slug}`}>
                <img src={i.image_url} alt={name} className="aspect-square object-cover bg-white" style={{ filter: "grayscale(0.4)" }} />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">{i.qty}× · {i.slug}</div>
                  <div className="font-bold text-sm">{name}</div>
                </div>
                <div className="font-bold text-sm">${(i.price_cad * i.qty).toFixed(2)}</div>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 border-t border-ink/20 pt-4 space-y-2 font-mono text-sm">
          <div className="flex justify-between"><span className="text-foreground/60 uppercase tracking-[0.15em] text-xs">{t("common.subtotal")}</span><span data-testid="summary-subtotal">${subtotal.toFixed(2)}</span></div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-700" data-testid="summary-discount">
              <span className="uppercase tracking-[0.15em] text-xs">DISCOUNT ({coupon.applied.code})</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-foreground/60 uppercase tracking-[0.15em] text-xs">{t("common.shipping")}</span>
            <span data-testid="summary-shipping">{shipping === 0 ? (lang === "fr" ? "GRATUIT" : "FREE") : `$${shipping.toFixed(2)}`}</span>
          </div>
          {shipping > 0 && (
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/50" data-testid="free-shipping-hint">
              {lang === "fr"
                ? `Livraison gratuite dès ${FREE_SHIPPING_THRESHOLD.toFixed(0)} $ — plus que $${(FREE_SHIPPING_THRESHOLD - Math.max(0, subtotal - discount)).toFixed(2)}`
                : `Free shipping at $${FREE_SHIPPING_THRESHOLD.toFixed(0)} — only $${(FREE_SHIPPING_THRESHOLD - Math.max(0, subtotal - discount)).toFixed(2)} to go`}
            </div>
          )}
        </div>

        {/* Coupon */}
        <div className="mt-4 pt-4 border-t border-ink/10" data-testid="coupon-section">
          {!coupon.applied ? (
            <div className="space-y-2">
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60">Coupon code</label>
              <div className="flex gap-2">
                <input
                  value={coupon.code}
                  onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase(), error: "" })}
                  placeholder="FIRONOVA10"
                  data-testid="coupon-input"
                  className="flex-1 border border-ink/20 px-3 py-2 text-sm font-mono uppercase"
                />
                <button type="button" onClick={applyCoupon} data-testid="apply-coupon" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 hover:bg-foreground/80">
                  Apply
                </button>
              </div>
              {coupon.error && <div className="font-mono text-[11px] text-red-600" data-testid="coupon-error">{coupon.error}</div>}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-600 px-3 py-2" data-testid="coupon-applied">
              <div className="text-sm">
                <span className="font-mono font-bold">{coupon.applied.code}</span> applied · ${discount.toFixed(2)} off
              </div>
              <button type="button" onClick={removeCoupon} className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-700">Remove</button>
            </div>
          )}
        </div>
        <div className="mt-4 border-t-2 border-ink pt-4 flex justify-between items-end">
          <span className="font-mono uppercase tracking-[0.2em] text-xs">{t("common.total")} CAD</span>
          <span className="font-display text-3xl font-extrabold" data-testid="summary-total">${total.toFixed(2)}</span>
        </div>
      </aside>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, testId }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{label}{required && " *"}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full border-b border-ink px-1 py-3 bg-transparent text-sm focus:outline-none focus:border-signal"
      />
    </div>
  );
}

function Checkbox({ checked, onChange, label, testId }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        className="mt-1 w-4 h-4 accent-ink"
      />
      <span className="text-xs leading-relaxed">{label}</span>
    </label>
  );
}
