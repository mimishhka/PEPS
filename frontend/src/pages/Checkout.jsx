import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import api, { formatApiError } from "../lib/api";
import { codeAffiliePourPaiement } from "../hooks/useAffiliateRef";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "../components/ui/dialog";

/* Le prix de livraison et le seuil de gratuite NE SONT PLUS ecrits ici.
 *
 * Ils l'etaient — 20 et 200 — alors que le serveur les tient dans
 * SHIPPING_FLAT_CAD et FREE_SHIPPING_THRESHOLD_CAD, reglables par variable
 * d'environnement, et les EXPOSE deja par /meta. Deux sources pour un meme
 * chiffre, dont une figee.
 *
 * La consequence n'etait pas cosmetique. Le serveur RECALCULE la livraison au
 * moment de la commande : changer la variable d'environnement aurait fait
 * afficher 20 $ au client et facturer autre chose. Il aurait paye un montant
 * qu'on ne lui avait jamais montre.
 *
 * Les valeurs de repli ci-dessous ne servent qu'entre le premier rendu et la
 * reponse de /meta, ou si celle-ci echoue — jamais comme reference. */
const LIVRAISON_REPLI = 20.0;
const SEUIL_GRATUIT_REPLI = 200.0;
const CHECKOUT_DRAFT_KEY = "fironova_checkout_draft_v1";

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
    req("province", lang === "fr" ? "Province" : "Province"),
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
  const { user } = useAuth();
  const nav = useNavigate();

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const { minAge, shippingFlatCad, freeShippingThresholdCad } = useSiteConfig();
  // ?? et non || : un seuil configure a 0 (livraison toujours gratuite)
  // est une valeur legitime que || aurait remplacee par le repli.
  const livraison = shippingFlatCad ?? LIVRAISON_REPLI;
  const seuilGratuit = freeShippingThresholdCad ?? SEUIL_GRATUIT_REPLI;
  const [confirmAge, setConfirmAge] = useState(false);
  const [acceptRuO, setAcceptRuO] = useState(false);
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("interac");

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const [ship, setShip] = useState({
    full_name: "", line1: "", line2: "", city: "", province: "", postal_code: "", country: "CA",
  });
  const [billSame, setBillSame] = useState(true);
  const [bill, setBill] = useState({
    full_name: "", line1: "", line2: "", city: "", province: "", postal_code: "", country: "CA",
  });

  const [idempotencyKey] = useState(() => `chk_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  // Dialog "adresse suggérée par Google Maps AVS" — s'affiche si le serveur
  // bloque le checkout avec detail.code === 'invalid_shipping_address'.
  const [addrSuggestion, setAddrSuggestion] = useState(null);

  const hasAddressData = (addr) => {
    if (!addr) return false;
    return ["full_name", "line1", "line2", "city", "province", "postal_code"].some((k) => String(addr[k] || "").trim());
  };

  // Restore checkout draft so user can sign in mid-flow without losing progress.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHECKOUT_DRAFT_KEY);
      const draft = raw ? JSON.parse(raw) : null;
      if (!draft || typeof draft !== "object") return;

      if (typeof draft.email === "string") setEmail((v) => v || draft.email);
      if (typeof draft.paymentMethod === "string" && ["interac", "nowpayments"].includes(draft.paymentMethod)) {
        setPaymentMethod(draft.paymentMethod);
      }
      if (typeof draft.confirmAge === "boolean") setConfirmAge(draft.confirmAge);
      if (typeof draft.acceptRuO === "boolean") setAcceptRuO(draft.acceptRuO);
      if (typeof draft.acceptPolicy === "boolean") setAcceptPolicy(draft.acceptPolicy);
      if (typeof draft.billSame === "boolean") setBillSame(draft.billSame);

      if (draft.ship && typeof draft.ship === "object") {
        setShip((curr) => (hasAddressData(curr) ? curr : { ...curr, ...draft.ship }));
      }
      if (draft.bill && typeof draft.bill === "object") {
        setBill((curr) => (hasAddressData(curr) ? curr : { ...curr, ...draft.bill }));
      }
      if (typeof draft.couponInput === "string") setCouponInput(draft.couponInput);
      if (draft.coupon && typeof draft.coupon === "object") setCoupon(draft.coupon);
    } catch {
      // Ignore malformed draft.
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist checkout draft continuously.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = {
      email,
      paymentMethod,
      confirmAge,
      acceptRuO,
      acceptPolicy,
      billSame,
      ship,
      bill,
      couponInput,
      coupon,
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures.
    }
  }, [email, paymentMethod, confirmAge, acceptRuO, acceptPolicy, billSame, ship, bill, couponInput, coupon]);

  // A2 — adresses sauvegardées : préremplir email + charger la liste si connecté.
  useEffect(() => {
    if (!user) return;
    if (user.email) setEmail((e) => e || user.email);
    let cancelled = false;
    api.get("/account/addresses")
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setSavedAddresses(list);
        const def = list.find((a) => a.is_default) || list[0];
        if (def) {
          setSelectedAddressId((curr) => curr || def.id);
          setShip((curr) => {
            if (hasAddressData(curr)) return curr;
            return {
              full_name: def.full_name || "",
              line1: def.address1 || "",
              line2: def.address2 || "",
              city: def.city || "",
              province: def.province || "",
              postal_code: def.postal_code || "",
              country: def.country || "CA",
            };
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mappe le format backend (address1/address2) vers le formulaire (line1/line2).
  const applySavedAddress = (a) => {
    setShip({
      full_name: a.full_name || "",
      line1: a.address1 || "",
      line2: a.address2 || "",
      city: a.city || "",
      province: a.province || "",
      postal_code: a.postal_code || "",
      country: a.country || "CA",
    });
  };

  const onSelectSaved = (id) => {
    setSelectedAddressId(id);
    if (id === "") {
      setShip({ full_name: "", line1: "", line2: "", city: "", province: "", postal_code: "", country: "CA" });
      return;
    }
    const a = savedAddresses.find((x) => x.id === id);
    if (a) applySavedAddress(a);
  };

  const discount = useMemo(() => {
    if (!coupon) return 0;
    if (coupon.discount_type === "percent") return +(subtotal * (coupon.value / 100)).toFixed(2);
    return Math.min(subtotal, coupon.value);
  }, [coupon, subtotal]);

  const shippingEst = useMemo(() => {
    if (coupon?.free_shipping) return 0;
    return Math.max(0, subtotal - discount) >= seuilGratuit ? 0 : livraison;
  }, [subtotal, discount, coupon]);
  const total = useMemo(
    () => +(Math.max(0, subtotal - discount) + shippingEst).toFixed(2),
    [subtotal, discount, shippingEst]
  );

  const canSubmit = useMemo(() => {
    if (!items?.length) return false;
    if (!email.trim()) return false;
    if (!confirmAge || !acceptRuO || !acceptPolicy) return false;
    return true;
  }, [items, email, confirmAge, acceptRuO, acceptPolicy]);

  /* Où en est l'application automatique du code porté par le lien.
   *
   * Déclaré AVANT removeCoupon, qui l'utilise. Il vivait après : le code
   * fonctionnait — le gestionnaire ne s'exécute qu'une fois le rendu terminé —
   * mais toute reprise qui appellerait removeCoupon pendant le rendu aurait
   * levé un ReferenceError, et rien ne l'aurait signalé avant l'exécution.
   *
   *   "jamais"     — rien tenté
   *   "sans-email" — tenté alors que le champ courriel était encore vide
   *   "fait"       — terminé, avec ou sans succès : on ne retente plus
   */
  const etatCodeLien = useRef("jamais");

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    try {
      const params = new URLSearchParams({ code, subtotal: String(subtotal) });
      if (email.trim()) params.set("email", email.trim());
      if (items?.length) params.set("items", JSON.stringify(items.map((i) => ({ product_id: i.product_id }))));
      const { data } = await api.post(`/coupons/validate?${params.toString()}`);
      setCoupon(data);
      toast.success(lang === "fr" ? "Code appliqué" : "Coupon applied");
    } catch (err) {
      setCoupon(null);
      toast.error(formatApiError(err?.response?.data?.detail) || (lang === "fr" ? "Code invalide" : "Invalid code"));
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput("");
    // Le retrait est un CHOIX, pas un accident : sans ce drapeau, l'effet
    // ci-dessous remettrait aussitôt le code du lien et le client verrait son
    // geste annulé sous ses yeux.
    etatCodeLien.current = "fait";
  };

  /* Application automatique du code porté par le lien d'affiliation.
   *
   * Arriver par le lien créditait l'affilié sans accorder le moindre rabais :
   * le témoin d'attribution est `httpOnly`, donc invisible d'ici, et le champ
   * de code restait vide. Le contact payait plein tarif alors que le même code
   * saisi à la main l'aurait fait économiser.
   *
   * Quatre précautions :
   *  — on ne touche à rien si un coupon est déjà appliqué ou si le champ
   *    contient une saisie, y compris restaurée du brouillon ;
   *  — DEUX tentatives au plus, et la seconde seulement si la première a eu
   *    lieu avant que le courriel soit saisi. Le serveur exige une identité
   *    pour certains coupons (usage par client, première commande) : une
   *    tentative unique, faite champ vide, échouait alors définitivement et
   *    le client ne voyait jamais son rabais. Sans ce compteur, l'autre excès
   *    guette — `email` étant dans les dépendances, une relance libre
   *    enverrait une requête à chaque frappe ;
   *  — l'échec est SILENCIEUX. Le client n'a rien demandé : lui afficher
   *    « Code invalide » pour un code qu'il n'a pas tapé n'aurait aucun sens.
   *    C'est le cas d'un affilié suspendu depuis le clic.
   */
  useEffect(() => {
    if (etatCodeLien.current === "fait") return;
    if (coupon || couponInput.trim()) return;
    if (!items?.length || subtotal <= 0) return;
    const courriel = email.trim();
    // Deuxième passage réservé au moment où le courriel arrive.
    if (etatCodeLien.current === "sans-email" && !courriel) return;
    const code = codeAffiliePourPaiement();
    if (!code) return;
    // Marqué AVANT l'appel : deux rendus rapprochés ne doivent pas lancer
    // deux requêtes concurrentes.
    etatCodeLien.current = courriel ? "fait" : "sans-email";
    (async () => {
      try {
        const params = new URLSearchParams({ code, subtotal: String(subtotal) });
        if (courriel) params.set("email", courriel);
        params.set("items", JSON.stringify(items.map((i) => ({ product_id: i.product_id }))));
        const { data } = await api.post(`/coupons/validate?${params.toString()}`);
        setCoupon(data);
        setCouponInput(data.code);
        etatCodeLien.current = "fait";
        toast.success(lang === "fr" ? "Code de parrainage appliqué" : "Referral code applied",
                      { description: data.code });
      } catch {
        /* silencieux — voir ci-dessus */
      }
    })();
  }, [items, subtotal, email, coupon, couponInput, lang]);

  const submit = async () => {
    const shipNorm = { ...ship, postal_code: normalizePostal(ship.country, ship.postal_code) };
    const billRaw = billSame ? shipNorm : { ...bill, postal_code: normalizePostal(bill.country, bill.postal_code) };

    const se = validateAddress(shipNorm, lang);
    const be = billSame ? [] : validateAddress(billRaw, lang);
    const errs = [...se, ...be];
    if (errs.length) { toast.error(errs[0]); return; }
    if (!email.trim()) { toast.error(lang === "fr" ? "Courriel requis" : "Email required"); return; }
    if (!confirmAge || !acceptRuO || !acceptPolicy) {
      toast.error(lang === "fr" ? "Veuillez confirmer toutes les cases de conformité." : "Please confirm all compliance items.");
      return;
    }

    const toAddr = (a) => ({
      full_name: a.full_name, address1: a.line1, address2: a.line2 || "",
      city: a.city, province: a.province, postal_code: a.postal_code,
      country: a.country, phone: a.phone || "",
    });

    const payload = {
      items: (items || []).map((i) => ({ product_id: i.product_id, variant_id: i.variant_id || null, qty: Number(i.qty || 1) })),
      email: email.trim(),
      shipping: toAddr(shipNorm),
      payment_method: paymentMethod,
      pay_currency: paymentMethod === "nowpayments" ? "usdc" : undefined,
      coupon_code: coupon?.code || null,
      accept_terms: !!acceptPolicy,
      confirm_age: !!confirmAge,
      confirm_research_use: !!acceptRuO,
      // Passed in the body to avoid a CORS preflight from a custom header.
      idempotency_key: idempotencyKey,
    };

    setSubmitting(true);
    try {
      const { data } = await api.post("/checkout", payload);
      if (!data?.id) throw new Error(lang === "fr" ? "Réponse de commande invalide" : "Malformed checkout response");
      clear();
      try { window.localStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch { /* ignore */ }
      try {
        if (data?.guest_access_token && !data?.user_id && typeof window !== "undefined") {
          window.sessionStorage.setItem(`fironova_guest_order_token:${data.id}`, data.guest_access_token);
        }
      } catch { /* ignore */ }
      // Interac ET crypto : page de confirmation interne.
      // Le paiement crypto s'affiche via le widget NOWPayments intégré
      // (iframe) directement sur /order/{id} — aucune redirection externe.
      nav(`/order/${data.id}`, { state: { order: data } });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      // Cas spécifique : le serveur a bloqué à cause d'une adresse invalide
      // et propose une suggestion normalisée par Google Maps AVS.
      if (detail && typeof detail === "object" && detail.code === "invalid_shipping_address") {
        const sug = (detail.suggestions && detail.suggestions[0]) || null;
        setAddrSuggestion({ suggestion: sug, verdict: detail.verdict });
      } else {
        toast.error(formatApiError(detail || err?.message));
      }
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
          {lang === "fr" ? "Ajoutez des composés avant de passer au paiement." : "Add compounds before proceeding to checkout."}
        </p>
        <Link to="/catalog" className="btn-pill btn-nova">
          {lang === "fr" ? "Explorer le catalogue" : "Browse catalog"}
        </Link>
      </div>
    );
  }

  const payCard = (id, title, desc, testid) => (
    <button
      type="button"
      onClick={() => setPaymentMethod(id)}
      data-testid={testid}
      className={`p-5 text-left rounded-xl border-[1.5px] transition-colors ${paymentMethod === id ? "border-nova bg-nova/5" : "border-ash hover:border-nova"}`}
    >
      <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-1">
        {paymentMethod === id ? (lang === "fr" ? "✓ CHOISI" : "✓ SELECTED") : (lang === "fr" ? "CHOISIR" : "SELECT")}
      </div>
      <div className="font-display font-bold text-nordfjord">{title}</div>
      <div className="text-xs text-glacier mt-1">{desc}</div>
    </button>
  );

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

          <div className="rounded-xl border border-ash bg-white p-5">
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

          <div className="rounded-xl border border-ash bg-white p-5">
            <h2 className="font-display text-xl font-bold text-nordfjord mb-4">
              {lang === "fr" ? "Adresse de livraison" : "Shipping address"}
            </h2>
            {savedAddresses.length > 0 && (
              <div className="mb-4">
                <label className="block font-data text-[11px] uppercase tracking-[0.14em] text-glacier mb-1.5">
                  {lang === "fr" ? "Adresses enregistrées" : "Saved addresses"}
                </label>
                <select
                  value={selectedAddressId}
                  onChange={(e) => onSelectSaved(e.target.value)}
                  data-testid="checkout-saved-address"
                  className="w-full rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova bg-white text-nordfjord"
                >
                  <option value="">{lang === "fr" ? "Nouvelle adresse…" : "New address…"}</option>
                  {savedAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {[a.label, a.full_name, a.address1, a.city].filter(Boolean).join(" · ")}
                      {a.is_default ? (lang === "fr" ? " (défaut)" : " (default)") : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <AddressForm value={ship} setValue={setShip} lang={lang} prefix="shipping" />
          </div>

          <div className="rounded-xl border border-ash bg-white p-5">
            <label className="flex items-center gap-2 text-sm text-nordfjord mb-4">
              <input type="checkbox" checked={billSame} onChange={(e) => setBillSame(e.target.checked)} data-testid="checkout-bill-same" />
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

          <div className="rounded-xl border border-ash bg-white p-5">
            <h2 className="font-display text-xl font-bold text-nordfjord mb-4">
              {lang === "fr" ? "Méthode de paiement" : "Payment method"}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {payCard(
                "interac",
                lang === "fr" ? "Virement Interac" : "Interac e-Transfer",
                lang === "fr" ? "Instructions envoyées après la commande." : "Instructions sent after you order.",
                "payment-interac"
              )}
              {payCard(
                "nowpayments",
                lang === "fr" ? "Cryptomonnaie" : "Cryptocurrency",
                lang === "fr" ? "Paiement USDC sur place, sans redirection." : "Pay in USDC on-site, no redirect.",
                "payment-crypto"
              )}
            </div>
          </div>

          <div className="rounded-xl border border-ash bg-white p-5 space-y-3">
            <label className="flex items-start gap-2 text-sm text-nordfjord">
              <input type="checkbox" checked={confirmAge} onChange={(e) => setConfirmAge(e.target.checked)} data-testid="checkout-confirm-age" className="mt-1" />
              {/* L'âge vient de la configuration du serveur, il n'est plus
                  écrit en dur. Cette case attestait 18 ans alors que tout le
                  reste du site annonce 19 — or c'est ICI que le client
                  s'engage. L'attestation la plus faible était celle qui
                  compte. */}
              <span>{lang === "fr"
                ? `Je confirme avoir ${minAge} ans ou plus.`
                : `I confirm I am ${minAge} years of age or older.`}</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-nordfjord">
              <input type="checkbox" checked={acceptRuO} onChange={(e) => setAcceptRuO(e.target.checked)} data-testid="checkout-accept-ruo" className="mt-1" />
              <span>
                {lang === "fr"
                  ? "Je confirme que ces produits sont destinés à un usage de recherche uniquement (RUO)."
                  : "I confirm these products are for Research Use Only (RUO)."}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-nordfjord">
              <input type="checkbox" checked={acceptPolicy} onChange={(e) => setAcceptPolicy(e.target.checked)} data-testid="checkout-accept-policy" className="mt-1" />
              <span>
                {lang === "fr" ? "J'accepte la politique de confidentialité et les conditions." : "I accept the privacy policy and terms."}
              </span>
            </label>
          </div>
        </section>

        <aside>
          <div className="rounded-xl border border-ash bg-white p-5 sticky top-24" data-testid="checkout-summary">
            <h2 className="font-display text-xl font-bold text-nordfjord mb-4">{lang === "fr" ? "Résumé" : "Summary"}</h2>
            <div className="space-y-3 max-h-[40vh] overflow-auto pr-1">
              {(items || []).map((it) => {
                const title = lang === "fr" ? it.name_fr : it.name_en;
                const unit = it.price_cad;
                return (
                  <div key={`${it.product_id}:${it.variant_id || "_"}`} className="flex items-start justify-between gap-3 border-b border-ash pb-3">
                    <div>
                      <div className="font-medium text-nordfjord">{title}</div>
                      <div className="text-xs text-glacier">{it.variant_name ? `${it.variant_name} · ` : ""}x{it.qty}</div>
                    </div>
                    <div className="font-semibold text-nordfjord">${(Number(unit) * Number(it.qty || 1)).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              {coupon ? (
                <div className="flex items-center justify-between rounded-xl bg-nova/5 border border-nova/20 px-3 py-2 text-sm">
                  <span className="font-data text-nova uppercase tracking-wide">{coupon.code}</span>
                  <button onClick={removeCoupon} className="text-xs text-glacier hover:text-compliance" data-testid="coupon-remove">
                    {lang === "fr" ? "Retirer" : "Remove"}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder={lang === "fr" ? "Code promo" : "Promo code"}
                    data-testid="coupon-input"
                    className="flex-1 rounded-xl border border-ash px-3 py-2 text-sm outline-none focus:border-nova"
                  />
                  <button onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()} data-testid="coupon-apply"
                    className="btn-pill btn-outline text-sm disabled:opacity-40">
                    {lang === "fr" ? "Appliquer" : "Apply"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-glacier">
                <span>{lang === "fr" ? "Sous-total" : "Subtotal"}</span>
                <span data-testid="summary-subtotal">${Number(subtotal).toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-nova">
                  <span>{lang === "fr" ? "Rabais" : "Discount"}</span>
                  <span data-testid="summary-discount">−${discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-glacier">
                <span>{lang === "fr" ? "Livraison" : "Shipping"}</span>
                <span data-testid="summary-shipping">
                  {shippingEst === 0 ? (lang === "fr" ? "GRATUITE" : "FREE") : `$${shippingEst.toFixed(2)}`}
                </span>
              </div>
              {shippingEst > 0 && (
                <div className="font-data text-[10px] uppercase tracking-[0.14em] text-compliance" data-testid="free-shipping-hint">
                  {lang === "fr"
                    ? `Livraison gratuite dès ${seuilGratuit.toFixed(0)}$ — plus que ${(seuilGratuit - Math.max(0, subtotal - discount)).toFixed(2)}$`
                    : `Free shipping at $${seuilGratuit.toFixed(0)} — only $${(seuilGratuit - Math.max(0, subtotal - discount)).toFixed(2)} to go`}
                </div>
              )}
              {coupon?.free_shipping && shippingEst === 0 && (
                <div className="font-data text-[10px] uppercase tracking-[0.14em] text-nova" data-testid="coupon-free-shipping">
                  {lang === "fr" ? "Livraison gratuite incluse dans le code promo" : "Free shipping included in your promo code"}
                </div>
              )}
              <div className="flex justify-between text-nordfjord font-bold text-base pt-2 border-t border-ash">
                <span>{lang === "fr" ? "Total" : "Total"}</span>
                <span data-testid="summary-total">${Number(total).toFixed(2)} CAD</span>
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
              {paymentMethod === "interac"
                ? (lang === "fr"
                  ? "Vous recevrez les instructions de virement Interac sur la page suivante et par courriel."
                  : "You'll get the Interac transfer instructions on the next page and by email.")
                : (lang === "fr"
                  ? "Le paiement en USDC s'affichera sur la page suivante, sans quitter le site."
                  : "Your USDC payment will appear on the next page, without leaving the site.")}
            </p>
          </div>
        </aside>
      </div>

      {/* Modal de suggestion d'adresse — s'affiche uniquement si Google Maps
          AVS a bloqué le checkout avec une suggestion normalisée. */}
      <Dialog open={!!addrSuggestion} onOpenChange={(open) => !open && setAddrSuggestion(null)}>
        <DialogContent data-testid="address-suggestion-dialog">
          <DialogHeader>
            <DialogTitle>
              {lang === "fr" ? "Vérifier votre adresse" : "Verify your address"}
            </DialogTitle>
            <DialogDescription>
              {lang === "fr"
                ? "L'adresse saisie n'a pas pu être confirmée par notre service de vérification. Corrigez-la ou acceptez la suggestion proposée."
                : "The address you entered could not be confirmed. Please correct it or accept the suggested address."}
            </DialogDescription>
          </DialogHeader>
          {addrSuggestion?.suggestion?.formattedAddress && (
            <div className="rounded-xl bg-clinical/40 p-4 my-2 border border-nova/20">
              <div className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance mb-1">
                {lang === "fr" ? "Suggestion" : "Suggestion"}
              </div>
              <div className="font-medium text-nordfjord" data-testid="address-suggestion-text">
                {addrSuggestion.suggestion.formattedAddress}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setAddrSuggestion(null)}
              data-testid="address-suggestion-edit"
              className="btn-pill btn-ghost">
              {lang === "fr" ? "Corriger manuellement" : "Edit manually"}
            </button>
            {addrSuggestion?.suggestion?.postalAddress && (
              <button
                type="button"
                onClick={() => {
                  const pa = addrSuggestion.suggestion.postalAddress;
                  const lines = pa.addressLines || [];
                  setShip((s) => ({
                    ...s,
                    line1: lines[0] || s.line1,
                    line2: lines[1] || "",
                    city: pa.locality || s.city,
                    province: pa.administrativeArea || s.province,
                    postal_code: pa.postalCode || s.postal_code,
                    country: pa.regionCode || s.country,
                  }));
                  setAddrSuggestion(null);
                  toast.success(
                    lang === "fr"
                      ? "Adresse mise à jour. Cliquez à nouveau sur \"Placer la commande\"."
                      : "Address updated. Click \"Place order\" again."
                  );
                }}
                data-testid="address-suggestion-accept"
                className="btn-pill btn-nova">
                {lang === "fr" ? "Utiliser la suggestion" : "Use suggestion"}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddressForm({ value, setValue, lang, prefix }) {
  const set = (k, v) => setValue((s) => ({ ...s, [k]: v }));
  const lbl = (en, fr) => lang === "fr" ? fr : en;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="sm:col-span-2 flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("Full name", "Nom complet")}</span>
        <input value={value.full_name} onChange={(e) => set("full_name", e.target.value)}
          placeholder={lbl("Full name", "Nom complet")} data-testid={`${prefix}-full-name`}
          autoComplete="name"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova" />
      </label>
      <label className="sm:col-span-2 flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("Address", "Adresse")}</span>
        <input value={value.line1} onChange={(e) => set("line1", e.target.value)}
          placeholder={lbl("Address line 1", "Adresse")} data-testid={`${prefix}-line1`}
          autoComplete="address-line1"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova" />
      </label>
      <label className="sm:col-span-2 flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("Apt / Suite (optional)", "Appartement (optionnel)")}</span>
        <input value={value.line2} onChange={(e) => set("line2", e.target.value)}
          placeholder={lbl("Address line 2 (optional)", "Appartement, suite (optionnel)")} data-testid={`${prefix}-line2`}
          autoComplete="address-line2"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("City", "Ville")}</span>
        <input value={value.city} onChange={(e) => set("city", e.target.value)}
          placeholder={lbl("City", "Ville")} data-testid={`${prefix}-city`}
          autoComplete="address-level2"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("Province / State", "Province / \u00c9tat")}</span>
        <input value={value.province} onChange={(e) => set("province", e.target.value)}
          placeholder={lbl("Province / State", "Province / \u00c9tat")} data-testid={`${prefix}-province`}
          autoComplete="address-level1"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("Postal / ZIP code", "Code postal")}</span>
        <input value={value.postal_code} onChange={(e) => set("postal_code", e.target.value)}
          placeholder={value.country === "CA" ? "A1A 1A1" : "12345"} data-testid={`${prefix}-postal`}
          autoComplete="postal-code"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-compliance">{lbl("Country", "Pays")}</span>
        <select value={value.country} onChange={(e) => set("country", e.target.value)} data-testid={`${prefix}-country`}
          autoComplete="country"
          className="rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova bg-white">
          <option value="CA">Canada</option>
          <option value="US">United States</option>
        </select>
      </label>
    </div>
  );
}
