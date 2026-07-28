import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { useAuth } from "../contexts/AuthContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import { VialArt } from "../components/brand";
import { Plus } from "lucide-react";

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
  const { couponSectionEnabled } = useSiteConfig();
  const [suggestions, setSuggestions] = useState([]);

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

  // Cross-sell: fetch featured products not already in the cart
  useEffect(() => {
    let cancelled = false;
    api.get("/products", { params: { featured: true } })
      .then((r) => {
        if (cancelled) return;
        const inCart = new Set(items.map((i) => i.product_id));
        setSuggestions((r.data || []).filter((p) => !inCart.has(p.id)).slice(0, 3));
      })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [items]);

  const cheapestVariantPrice = (p) => {
    const vs = p.variants || [];
    if (!vs.length) return p.price_cad ?? 0;
    return vs.reduce((m, v) => {
      const sale = v.sale_price && v.sale_price < v.price ? v.sale_price : v.price;
      return sale < m ? sale : m;
    }, Infinity);
  };

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
{!user && (
          <section className="space-y-4 bg-nova/5 border border-nova/20 rounded-2xl p-6">
            <div className="font-data text-[11px] uppercase tracking-[0.2em] text-nova">00 · SIGN IN OR CREATE ACCOUNT</div>
            <p className="text-sm text-glacier">{lang === "fr" ? "Créer un compte pour suivre vos commandes et activer les adresses enregistrées." : "Create an account to track your orders and enable saved addresses."}</p>
            <div className="flex gap-3">
              <Link
                to="/login"
                data-testid="checkout-login-link"
                className="flex-1 rounded-full border border-ash px-4 py-3 font-data text-[11px] font-semibold uppercase tracking-[0.16em] text-nordfjord hover:border-nova hover:text-nova text-center transition-colors"
              >
                {lang === "fr" ? "Se connecter" : "Sign In"}
              </Link>
              <Link
                to="/register"
                data-testid="checkout-register-link"
                className="flex-1 rounded-full bg-nova text-nordfjord px-4 py-3 font-data text-[11px] font-semibold uppercase tracking-[0.16em] hover:bg-[#00A3BC] text-center transition-colors"
              >
                {lang === "fr" ? "Créer un compte" : "Create Account"}
              </Link>
            </div>
          </section>
        )}

        
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
                <option value="eth">Ethereum (ETH)</option>
                <option value="usdttrc20">Tether (USDT · TRC-20)</option>
                <option value="usdterc20">Tether (USDT · ERC-20)</option>
                <option value="ltc">Litecoin (LTC)</option>
                <option value="sol">Solana (SOL)</option>
              </select>
            </div>
          )}
        </section>

        <section className="space-y-4 bg-nordfjord text-clinical p-6 rounded-2xl">
          <div className="font-data text-[11px] uppercase tracking-[0.2em] text-nova">04 · COMPLIANCE — REQUIRED</div>
          <Checkbox checked={ack.a1} onChange={(c) => setAck({ ...ack, a1: c })} label={t("checkout.ack1")} testId="ack-age" />
          <Checkbox checked={ack.a2} onChange={(c) => setAck({ ...ack, a2: c })} label={t("checkout.ack2")} testId="ack-research" />
          <Checkbox checked={ack.a3} onChange={(c) => setAck({ ...ack, a3: c })} label={t("checkout.ack3")} testId="ack-terms" />
        </section>

        <button
          type="submit"
          disabled={submitting}
        {couponSectionEnabled && (
          <div className="mt-4 pt-4 border-t border-ash" data-testid="coupon-section">
            {!coupon.applied ? (
              <div className="space-y-2">
            {submitting ? t("checkout.processing") : `${t("checkout.placeOrder")} · $${total.toFixed(2)} CAD →`}
        </button>
      </form>

      <aside className="p-8 lg:p-12 bg-white border-l border-ash" data-testid="checkout-summary">
        <h3 className="font-display text-xl font-bold text-nordfjord">{t("common.total")}</h3>
        <ul className="mt-6 divide-y divide-ash">
          {items.map((i) => {
            const name = lang === "fr" ? i.name_fr : i.name_en;
            return (
              <li key={i.product_id} className="grid grid-cols-[60px_1fr_auto] gap-3 py-3 items-center" data-testid={`summary-item-${i.slug}`}>
                <div className="aspect-square rounded-lg overflow-hidden"><VialArt hue={hueFor(i.slug)} className="w-full h-full" /></div>
                <div>
                  <div className="font-data text-[10px] uppercase tracking-[0.16em] text-compliance">{i.qty}× · {i.slug}</div>
                  <div className="font-bold text-sm text-nordfjord">{name}</div>
                </div>
                <div className="font-data font-bold text-sm text-nordfjord">${(i.price_cad * i.qty).toFixed(2)}</div>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 border-t border-ash pt-4 space-y-2 font-data text-sm">
          </div>
        
        {suggestions.length > 0 && (
          <div className="mt-6 pt-6 border-t border-ash" data-testid="checkout-cross-sell">
            <p className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-4">
              {lang === "fr" ? "Pourrait aussi vous intéresser" : "You might also like"}
            </p>
            <div className="space-y-3">
              {suggestions.map((p) => {
                const pname = lang === "fr" ? p.name_fr : p.name_en;
                const price = cheapestVariantPrice(p);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-clinical hover:bg-ash/20 transition-colors" data-testid={`checkout-cross-sell-${p.slug}`}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                      <VialArt hue={hueFor(p.slug)} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/product/${p.slug}`}
                        className="font-display font-bold text-xs text-nordfjord hover:text-nova transition-colors truncate block"
                      >
                        {pname}
                      </Link>
                      <div className="font-data text-[10px] text-glacier">
                        {lang === "fr" ? "dès" : "from"} ${price.toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSuggestions((prev) => prev.filter((s) => s.id !== p.id)); navigate(`/product/${p.slug}`); }}
                      className="shrink-0 rounded-full border border-ash w-9 h-9 flex items-center justify-center text-nordfjord hover:border-nova hover:text-nova hover:bg-nova/5 transition-colors"
                      aria-label={lang === "fr" ? "Voir le produit" : "View product"}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 border-t-2 border-nordfjord pt-6text-glacier uppercase tracking-[0.14em] text-xs">{t("common.subtotal")}</span><span className="text-nordfjord" data-testid="summary-subtotal">${subtotal.toFixed(2)}</span></div>
          {discount > 0 && (
            <div className="flex justify-between text-success" data-testid="summary-discount">
              <span className="uppercase tracking-[0.14em] text-xs">DISCOUNT ({coupon.applied.code})</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-glacier uppercase tracking-[0.14em] text-xs">{t("common.shipping")}</span>
            <span className="text-nordfjord" data-testid="summary-shipping">{shipping === 0 ? (lang === "fr" ? "GRATUIT" : "FREE") : `$${shipping.toFixed(2)}`}</span>
          </div>
          {shipping > 0 && (
            <div className="font-data text-[10px] uppercase tracking-[0.14em] text-compliance" data-testid="free-shipping-hint">
              {lang === "fr"
                ? `Livraison gratuite dès ${FREE_SHIPPING_THRESHOLD.toFixed(0)} $ — plus que $${(FREE_SHIPPING_THRESHOLD - Math.max(0, subtotal - discount)).toFixed(2)}`
                : `Free shipping at $${FREE_SHIPPING_THRESHOLD.toFixed(0)} — only $${(FREE_SHIPPING_THRESHOLD - Math.max(0, subtotal - discount)).toFixed(2)} to go`}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-ash" data-testid="coupon-section">
          {!coupon.applied ? (
            <div className="space-y-2">
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance">Coupon code</label>
              <div className="flex gap-2">
                <input
                  value={coupon.code}
                  onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase(), error: "" })}
                  placeholder="FIRONOVA10"
                  data-testid="coupon-input"
                  className="flex-1 rounded-full border border-ash px-4 py-2 text-sm font-data uppercase text-nordfjord outline-none focus:border-nova"
                />
                <button type="button" onClick={applyCoupon} data-testid="apply-coupon" className="btn-pill btn-outline">
                  Apply
                </button>
              </div>
              {coupon.error && <div className="font-data text-[11px] text-error" data-testid="coupon-error">{coupon.error}</div>}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-success/10 border border-success px-3 py-2" data-testid="coupon-applied">
              <div className="text-sm text-nordfjord">
                <span className="font-data font-bold">{coupon.applied.code}</span> applied · ${discount.toFixed(2)} off
              </div>
              <button type="button" onClick={removeCoupon} className="font-data text-xs uppercase tracking-[0.16em] text-success">Remove</button>
            </div>
          )}
        </div>
        <div className="mt-4 border-t-2 border-nordfjord pt-4 flex justify-between items-end">
          <span className="font-data uppercase tracking-[0.16em] text-xs text-glacier">{t("common.total")} CAD</span>
          <span className="font-display text-3xl font-bold text-nordfjord" data-testid="summary-total">${total.toFixed(2)}</span>
        </div>
      </aside>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, testId }) {
  return (
    <div>
      <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{label}{required && " *"}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-full border border-ash px-5 py-3 bg-white text-sm text-nordfjord outline-none focus:border-nova"
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
        className="mt-0.5 w-4 h-4 accent-[#00B8D4]"
      />
      <span className="text-xs leading-relaxed text-[#B7CADD]">{label}</span>
    </label>
  );
}

