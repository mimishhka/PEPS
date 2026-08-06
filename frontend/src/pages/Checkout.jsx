import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

function normalizePostal(country, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (country === "CA") return v.toUpperCase().replace(/\s+/g, "").replace(/(.{3})/, "$1 ").trim();
  if (country === "US") return v.replace(/[^0-9\-]/g, "").slice(0, 10);
  return v;
}

function validateAddress(a, lang) {
  const req = (k, label) => (!String(a[k] || "").trim() ? `${label} ${lang === "fr" ? "est requis" : "is required"}` : null);
  const errs = [
    req("full_name", lang === "fr" ? "Nom" : "Full name"),
    req("line1", lang === "fr" ? "Adresse" : "Address"),
    req("city", lang === "fr" ? "Ville" : "City"),
    req("postal_code", lang === "fr" ? "Code postal" : "Postal code"),
    req("country", lang === "fr" ? "Pays" : "Country"),
  ].filter(Boolean);

  if (a.country === "CA" && a.postal_code) {
    const ok = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(a.postal_code);
    if (!ok) errs.push(lang === "fr" ? "Code postal canadien invalide" : "Invalid Canadian postal code");
  }
  if (a.country === "US" && a.postal_code) {
    const ok = /^\d{5}(-\d{4})?$/.test(a.postal_code);
    if (!ok) errs.push(lang === "fr" ? "Code ZIP invalide" : "Invalid ZIP code");
  }
  return errs;
}

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { lang } = useLang();
  const nav = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [acceptRuO, setAcceptRuO] = useState(false);
  const [acceptPolicy, setAcceptPolicy] = useState(false);

  const [ship, setShip] = useState({
    full_name: "",
    line1: "",
    line2: "",
    city: "",
    province: "",
    postal_code: "",
    country: "CA",
  });

  const [billSame, setBillSame] = useState(true);
  const [bill, setBill] = useState({
    full_name: "",
    line1: "",
    line2: "",
    city: "",
    province: "",
    postal_code: "",
    country: "CA",
  });

  // Anti-dup click / back-forward resubmission guard
  const [idempotencyKey] = useState(() => {
    const rand = Math.random().toString(36).slice(2);
    return `chk_${Date.now()}_${rand}`;
  });

  const canSubmit = useMemo(() => {
    if (!items?.length) return false;
    if (!acceptRuO || !acceptPolicy) return false;
    if (!/^\S+@\S+\.\S+$/.test(email)) return false;
    const se = validateAddress(ship, lang);
    if (se.length) return false;
    if (!billSame) {
      const be = validateAddress(bill, lang);
      if (be.length) return false;
    }
    return true;
  }, [items, acceptRuO, acceptPolicy, email, ship, bill, billSame, lang]);

  useEffect(() => {
    // Keep billing country aligned initially; user can change when billSame=false
    if (billSame) setBill((b) => ({ ...b, country: ship.country }));
  }, [ship.country, billSame]);

  const lineTotal = (it) => {
    const v = it.variant || null;
    const isPre = !!(v && v.preorder_enabled && (v.stock <= 0 || v.badge_coa_pending || v.badge_coming_soon));
    const sale = !!(v && v.sale_price && v.sale_price < v.price);
    const price = v ? (isPre && v.preorder_price ? v.preorder_price : sale ? v.sale_price : v.price) : it.price_cad;
    return Number(price || 0) * Number(it.qty || 1);
  };

  const total = useMemo(() => {
    const computed = (items || []).reduce((s, it) => s + lineTotal(it), 0);
    return Number(computed.toFixed(2));
  }, [items]);

  const submit = async () => {
    if (!canSubmit || submitting) return;

    const shipNorm = { ...ship, postal_code: normalizePostal(ship.country, ship.postal_code) };
    const billRaw = billSame ? shipNorm : bill;
    const billNorm = { ...billRaw, postal_code: normalizePostal(billRaw.country, billRaw.postal_code) };

    const se = validateAddress(shipNorm, lang);
    const be = validateAddress(billNorm, lang);
    if (se.length || (!billSame && be.length)) {
      toast.error([...(se || []), ...(!billSame ? be : [])][0]);
      return;
    }

    const payload = {
      email: email.trim(),
      shipping_address: shipNorm,
      billing_address: billNorm,
      agree_research_use_only: !!acceptRuO,
      agree_policy: !!acceptPolicy,
      // Explicit items structure expected by backend
      items: (items || []).map((it) => ({
        product_id: it.id,
        variant_id: it.variant?.id || null,
        qty: Number(it.qty || 1),
      })),
    };

    setSubmitting(true);
    try {
      const r = await api.post("/checkout", payload, {
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      });
      const { order_id, payment_url } = r.data || {};
      if (!order_id || !payment_url) throw new Error("Malformed checkout response");
      clear();
      window.location.assign(payment_url);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail || err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (!items?.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center" data-testid="checkout-empty">
        <h1 className="font-display text-3xl font-bold text-nordfjord mb-3">
          {lang === "fr" ? "Votre panier est vide" : "Your cart is empty"}
        </h1>
        <p className="text-glacier mb-8">
          {lang === "fr"
            ? "Ajoutez des composés avant de passer au paiement."
            : "Add compounds before proceeding to checkout."}
        </p>
        <Link to="/catalog" className="btn-pill btn-nova">
          {lang === "fr" ? "Explorer le catalogue" : "Browse catalog"}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-clinical min-h-screen" data-testid="checkout-page">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 grid lg:grid-cols-[1.1fr_.9fr] gap-8">
        <section className="space-y-6">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.22em] text-compliance mb-2">
              {lang === "fr" ? "PAIEMENT SÉCURISÉ" : "SECURE CHECKOUT"}
            </p>
            <h1 className="font-display text-4xl font-bold text-nordfjord">
              {lang === "fr" ? "Finaliser la commande" : "Complete your order"}
            </h1>
          </div>

          <div className="rounded-2xl border border-ash bg-white p-5">
            <h2 className="font-display text-xl font-bold text-nordfjord mb-4">{lang === "fr" ? "Contact" : "Contact"}</h2>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={lang === "fr" ? "votre@courriel.com" : "you@email.com"}
              data-testid="checkout-email"
              className="w-full rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
            />
          </div>

          <div className="rounded-2xl border border-ash bg-white p-5">
            <h2 className="font-display text-xl font-bold text-nordfjord mb-4">
              {lang === "fr" ? "Adresse de livraison" : "Shipping address"}
            </h2>
            <AddressForm value={ship} setValue={setShip} lang={lang} prefix="shipping" />
          </div>

          <div className="rounded-2xl border border-ash bg-white p-5">
            <label className="flex items-center gap-2 text-sm text-nordfjord mb-4">
              <input
                type="checkbox"
                checked={billSame}
                onChange={(e) => setBillSame(e.target.checked)}
                data-testid="checkout-bill-same"
              />
              {lang === "fr" ? "Adresse de facturation identique" : "Billing same as shipping"}
            </label>

            {!billSame && (
              <>
                <h2 className="font-display text-xl font-bold text-nordfjord mb-4">
                  {lang === "fr" ? "Adresse de facturation" : "Billing address"}
                </h2>
                <AddressForm value={bill} setValue={setBill} lang={lang} prefix="billing" />
              </>
            )}
          </div>

          <div className="rounded-2xl border border-ash bg-white p-5 space-y-3">
            <label className="flex items-start gap-2 text-sm text-nordfjord">
              <input
                type="checkbox"
                checked={acceptRuO}
                onChange={(e) => setAcceptRuO(e.target.checked)}
                data-testid="checkout-accept-ruo"
                className="mt-1"
              />
              <span>
                {lang === "fr"
                  ? "Je confirme que ces produits sont destinés à un usage de recherche uniquement (RUO)."
                  : "I confirm these products are for Research Use Only (RUO)."}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-nordfjord">
              <input
                type="checkbox"
                checked={acceptPolicy}
                onChange={(e) => setAcceptPolicy(e.target.checked)}
                data-testid="checkout-accept-policy"
                className="mt-1"
              />
              <span>
                {lang === "fr" ? "J'accepte la politique de confidentialité et les conditions." : "I accept the privacy policy and terms."}
              </span>
            </label>
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-ash bg-white p-5 sticky top-24" data-testid="checkout-summary">
            <h2 className="font-display text-xl font-bold text-nordfjord mb-4">
              {lang === "fr" ? "Résumé" : "Summary"}
            </h2>
            <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
              {(items || []).map((it) => {
                const title = lang === "fr" ? it.name_fr : it.name_en;
                const v = it.variant;
                const isPre = !!(v && v.preorder_enabled && (v.stock <= 0 || v.badge_coa_pending || v.badge_coming_soon));
                const sale = !!(v && v.sale_price && v.sale_price < v.price);
                const unit = v ? (isPre && v.preorder_price ? v.preorder_price : sale ? v.sale_price : v.price) : it.price_cad;
                return (
                  <div key={`${it.id}:${v?.id || "_"}`} className="flex items-start justify-between gap-3 border-b border-ash pb-3">
                    <div>
                      <div className="font-medium text-nordfjord">{title}</div>
                      <div className="text-xs text-glacier">
                        {v?.name ? `${v.name} · ` : ""}x{it.qty}
                        {isPre ? ` · ${lang === "fr" ? "précommande" : "pre-order"}` : ""}
                      </div>
                    </div>
                    <div className="font-semibold text-nordfjord">${(Number(unit) * Number(it.qty || 1)).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-glacier">
                <span>{lang === "fr" ? "Sous-total" : "Subtotal"}</span>
                <span>${Number(subtotal || total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-glacier">
                <span>{lang === "fr" ? "Livraison" : "Shipping"}</span>
                <span>{lang === "fr" ? "Calculée à la caisse" : "Calculated at payment"}</span>
              </div>
              <div className="flex justify-between text-nordfjord font-bold text-base pt-2 border-t border-ash">
                <span>{lang === "fr" ? "Total" : "Total"}</span>
                <span>${Number(total).toFixed(2)} CAD</span>
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!canSubmit || submitting}
              data-testid="checkout-submit"
              className="w-full mt-5 btn-pill btn-nova disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting
                ? (lang === "fr" ? "Traitement…" : "Processing…")
                : (lang === "fr" ? "Procéder au paiement" : "Proceed to payment")}
            </button>

            <p className="mt-3 text-[11px] text-glacier leading-relaxed">
              {lang === "fr"
                ? "Vous serez redirigé vers notre prestataire de paiement sécurisé."
                : "You will be redirected to our secure payment provider."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AddressForm({ value, setValue, lang, prefix }) {
  const set = (k, v) => setValue((s) => ({ ...s, [k]: v }));

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <input
        value={value.full_name}
        onChange={(e) => set("full_name", e.target.value)}
        placeholder={lang === "fr" ? "Nom complet" : "Full name"}
        data-testid={`${prefix}-full-name`}
        className="sm:col-span-2 rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
      />
      <input
        value={value.line1}
        onChange={(e) => set("line1", e.target.value)}
        placeholder={lang === "fr" ? "Adresse" : "Address line 1"}
        data-testid={`${prefix}-line1`}
        className="sm:col-span-2 rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
      />
      <input
        value={value.line2}
        onChange={(e) => set("line2", e.target.value)}
        placeholder={lang === "fr" ? "Appartement, suite (optionnel)" : "Address line 2 (optional)"}
        data-testid={`${prefix}-line2`}
        className="sm:col-span-2 rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
      />
      <input
        value={value.city}
        onChange={(e) => set("city", e.target.value)}
        placeholder={lang === "fr" ? "Ville" : "City"}
        data-testid={`${prefix}-city`}
        className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
      />
      <input
        value={value.province}
        onChange={(e) => set("province", e.target.value)}
        placeholder={lang === "fr" ? "Province / État" : "Province / State"}
        data-testid={`${prefix}-province`}
        className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
      />
      <input
        value={value.postal_code}
        onChange={(e) => set("postal_code", e.target.value)}
        placeholder={value.country === "CA" ? "A1A 1A1" : "12345"}
        data-testid={`${prefix}-postal`}
        className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova"
      />
      <select
        value={value.country}
        onChange={(e) => set("country", e.target.value)}
        data-testid={`${prefix}-country`}
        className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova bg-white"
      >
        <option value="CA">Canada</option>
        <option value="US">United States</option>
      </select>
    </div>
  );
}
