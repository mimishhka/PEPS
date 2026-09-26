import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { Copy, Check, Landmark, Wallet, ShieldCheck, CircleCheck, TriangleAlert, Clock } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useConfirm } from "../components/ConfirmDialog";
import useDocumentHead from "../hooks/useDocumentHead";
import { delaiLisible, resteLisible } from "../lib/delais";
import ModuleCrypto from "../components/ModuleCrypto";

const guestRequestConfig = (token) => token
  ? { headers: { "X-Order-Access-Token": token } }
  : {};

export default function OrderConfirmation() {
  useDocumentHead({ title: "Order", noindex: true });
  const { id } = useParams();
  const { state, search } = useLocation();
  const { t, lang } = useLang();
  const confirm = useConfirm();
  const [order, setOrder] = useState(state?.order || null);
  const [copied, setCopied] = useState("");
  const [remainingMs, setRemainingMs] = useState(null);
  // Demande d'annulation ou de remboursement : portée par la COMMANDE.
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState("");
  const [refundDest, setRefundDest] = useState("");
  const fragmentToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access_token") || ""
    : "";
  const storedGuestToken = typeof window !== "undefined"
    ? window.sessionStorage.getItem(`fironova_guest_order_token:${id}`) || ""
    : "";
  const guestToken = fragmentToken || order?.guest_access_token || storedGuestToken;

  useEffect(() => {
    if (!guestToken || order?.user_id || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(`fironova_guest_order_token:${id}`, guestToken);
      if (fragmentToken) window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    } catch { /* ignore */ }
  }, [fragmentToken, guestToken, id, order?.user_id, search]);

  useEffect(() => {
    if (!order) {
      api.get(`/orders/${id}`, guestRequestConfig(guestToken)).then((r) => setOrder(r.data)).catch(() => {});
    }
  }, [id, order, guestToken]);

  // LE COMPTE À REBOURS SUIT L'ÉCHÉANCE DU SERVEUR, ET RIEN D'AUTRE.
  //
  // Il se repliait sur « created_at + 24 h » quand l'échéance manquait : un
  // quatrième chiffre inventé, affiché avec le même aplomb que les autres.
  // Sans échéance, on ne compte rien : un client sans compte à rebours pose
  // la question ; un client avec un faux compte à rebours rate son paiement.
  useEffect(() => {
    if (!order || !["awaiting_etransfer", "awaiting_crypto"].includes(order.payment_status)) return undefined;
    if (!order.payment_deadline) { setRemainingMs(null); return undefined; }
    const deadline = new Date(order.payment_deadline).getTime();
    if (Number.isNaN(deadline)) { setRemainingMs(null); return undefined; }
    const tick = () => setRemainingMs(deadline - Date.now());
    tick();
    // Quinze secondes, pas trente : avec un délai de trente minutes, un
    // rafraîchissement par demi-minute laisse l'affichage en retard sur la
    // réalité au moment où elle compte le plus.
    const iv = setInterval(tick, 15000);
    return () => clearInterval(iv);
  }, [order]);

  // Le delai REEL de cette commande, tel que le serveur l'a fige a
  // l'achat. Une commande d'hier garde le delai d'hier, meme si le
  // reglage a change depuis : c'est ce qu'on a promis a ce client-la.
  const delai = delaiLisible(order?.payment_ttl_hours, lang);

  // NOWPayments live status polling
  useEffect(() => {
    if (!order) return;
    if (order.payment_method !== "nowpayments" || order.payment_status !== "awaiting_crypto") return;
    if (order.payment_info?.provider_response?.mock) return;
    let attempts = 0;
    const iv = setInterval(async () => {
      attempts += 1;
      if (attempts > 45) { clearInterval(iv); return; }
      try {
        const { data } = await api.get(`/payments/crypto/status/${order.id}`, guestRequestConfig(guestToken));
        if (data.payment_status === "paid") {
          clearInterval(iv);
          const fresh = await api.get(`/orders/${order.id}`, guestRequestConfig(guestToken));
          setOrder(fresh.data);
        }
      } catch { /* ignore */ }
    }, 20000);
    return () => clearInterval(iv);
  }, [order, guestToken]);

  // Interac (Autodeposit) live status polling : confirmed automatically by backend watchdog
  useEffect(() => {
    if (!order) return;
    if (order.payment_status !== "awaiting_etransfer") return;
    let attempts = 0;
    const iv = setInterval(async () => {
      attempts += 1;
      if (attempts > 45) { clearInterval(iv); return; }
      try {
        const { data } = await api.get(`/orders/${order.id}`, guestRequestConfig(guestToken));
        if (data.payment_status === "paid") {
          clearInterval(iv);
          setOrder(data);
        }
      } catch { /* ignore */ }
    }, 20000);
    return () => clearInterval(iv);
  }, [order, guestToken]);

  if (!order) return <div className="p-16 font-mono text-xs uppercase tracking-[0.25em]">{t("common.loading")}</div>;

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  // Retirer une demande posée par erreur. Le serveur ne l'accepte que pour
  // SA demande, tant qu'elle est « à examiner » ; ailleurs il refuse et dit
  // pourquoi. La commission de l'affilié, gelée par la demande, se dégèle
  // d'elle-même : elle ne dépend que du statut de la demande.
  const retirerDemande = async () => {
    if (!await confirm({
      title: lang === "fr" ? "Retirer votre demande ?" : "Withdraw your request?",
      description: lang === "fr"
        ? "Votre commande reprend son cours normal. Vous pourrez refaire une demande tant qu'elle n'est pas expédiée."
        : "Your order continues as normal. You can make a new request as long as it hasn't shipped.",
    })) return;
    setRefundBusy(true);
    setRefundError("");
    try {
      await api.post(`/orders/${order.id}/refund-request/cancel`, {}, guestRequestConfig(guestToken));
      const fresh = await api.get(`/orders/${order.id}`, guestRequestConfig(guestToken));
      setOrder(fresh.data);
    } catch (e) {
      setRefundError(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setRefundBusy(false);
    }
  };

  const demanderRemboursement = async () => {
    if (refundReason.trim().length < 10) {
      setRefundError(lang === "fr"
        ? "Décrivez la situation en quelques mots (10 caractères au moins)."
        : "Describe the situation in a few words (at least 10 characters).");
      return;
    }
    // Paiement en crypto : nous ne savons PAS d'où vient le dépôt. NOWPayments
    // nous dit qu'il est arrivé, jamais de quel portefeuille. Sans adresse,
    // le remboursement n'aurait nulle part où aller.
    if (order.payment_method === "nowpayments" && !refundDest.trim()) {
      setRefundError(lang === "fr"
        ? "Indiquez l'adresse du portefeuille où renvoyer les fonds."
        : "Enter the wallet address where the funds should be sent back.");
      return;
    }
    setRefundBusy(true);
    setRefundError("");
    try {
      await api.post(`/orders/${order.id}/refund-request`,
        { reason: refundReason.trim(), refund_type: "full",
          refund_destination: refundDest.trim() }, guestRequestConfig(guestToken));
      const fresh = await api.get(`/orders/${order.id}`, guestRequestConfig(guestToken));
      setOrder(fresh.data);
      setRefundReason("");
    } catch (e) {
      setRefundError(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setRefundBusy(false);
    }
  };

  const awaitingPayment = ["awaiting_etransfer", "awaiting_crypto"].includes(order.payment_status);
  const interac = awaitingPayment && order.payment_info?.type === "interac" ? order.payment_info.instructions : null;
  const np = awaitingPayment && order.payment_info?.type === "nowpayments" ? order.payment_info.provider_response : null;

  // L'ÉTAT DU PAIEMENT N'EST PAS UN BINAIRE.
  //
  // La page ne connaissait que « payée » ou « pas payée ». Or une commande
  // REMBOURSÉE porte payment_status = "refunded" (écrit au règlement), et une
  // commande annulée "cancelled" : toutes deux tombaient donc dans « pas
  // payée » et réclamaient au client de compléter un paiement : à quelqu'un
  // qu'on venait de rembourser. Chaque état dit maintenant ce qu'il est ;
  // seul l'inconnu retombe sur l'attente de paiement, qui reste le cas
  // normal d'une commande fraîche.
  const ETATS_PAIEMENT = {
    paid: {
      bandeau: lang === "fr" ? "// COMMANDE CONFIRMÉE" : "// ORDER CONFIRMED",
      titre: lang === "fr" ? "Commande confirmée" : "Order confirmed",
      phrase: lang === "fr"
        ? "Merci ! Votre paiement est confirmé et votre commande est en préparation."
        : "Thank you! Your payment is confirmed and your order is being prepared.",
    },
    refunded: {
      bandeau: lang === "fr" ? "// COMMANDE REMBOURSÉE" : "// ORDER REFUNDED",
      titre: lang === "fr" ? "Commande remboursée" : "Order refunded",
      phrase: lang === "fr"
        ? "Le remboursement a été effectué. Il n'y a rien à payer."
        : "The refund has been issued. There is nothing to pay.",
    },
    cancelled: {
      bandeau: lang === "fr" ? "// COMMANDE ANNULÉE" : "// ORDER CANCELLED",
      titre: lang === "fr" ? "Commande annulée" : "Order cancelled",
      phrase: lang === "fr"
        ? "Cette commande a été annulée. Il n'y a rien à payer."
        : "This order was cancelled. There is nothing to pay.",
    },
    failed: {
      bandeau: lang === "fr" ? "// PAIEMENT ÉCHOUÉ" : "// PAYMENT FAILED",
      titre: lang === "fr" ? "Paiement échoué" : "Payment failed",
      phrase: lang === "fr"
        ? "Le paiement n'a pas abouti. Écrivez-nous et nous reprenons la commande avec vous."
        : "The payment did not go through. Write to us and we'll pick the order back up with you.",
    },
  };
  const etatPaiement = ETATS_PAIEMENT[order.payment_status] || {
    bandeau: lang === "fr" ? "// COMMANDE REÇUE : PAIEMENT EN ATTENTE" : "// ORDER RECEIVED : AWAITING PAYMENT",
    titre: lang === "fr" ? "Commande reçue" : "Order received",
    phrase: lang === "fr"
      ? "Conservez votre numéro de commande : il vous sera nécessaire pour compléter le paiement."
      : "Save your order number : you'll need it to complete the payment.",
  };

  return (
    // LA PAGE COMMENCE PLUS HAUT SUR TELEPHONE. Soixante-quatre pixels de vide
    // au-dessus d un ecran ou l on doit PAYER repoussaient les instructions
    // sous la ligne de flottaison avant meme d avoir lu quoi que ce soit.
    <div className="max-w-4xl mx-auto px-5 sm:px-6 py-7 sm:py-12" data-testid="confirmation-page">
      <div className="border border-nordfjord/20 rounded-xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between font-data text-[11px] uppercase tracking-[0.2em] text-nordfjord border-b border-ash">
          <span>
            {etatPaiement.bandeau}
          </span>
          <span>{new Date(order.created_at).toLocaleString()}</span>
        </div>
        {/* L'EN-TETE TENAIT SUR QUATRE BLOCS EMPILES — etiquette, numero,
            titre, phrase — avec 32 px de remplissage. Le numero et le titre
            partagent desormais une rangee sur grand ecran : la meme
            information, la moitie de la hauteur. */}
        <div className="px-6 py-5 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl uppercase tracking-tight text-nordfjord">
              {etatPaiement.titre}
            </h1>
            <p className="text-sm text-glacier mt-1.5 leading-relaxed">
              {etatPaiement.phrase}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 sm:text-right shrink-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-glacier">{t("confirmation.orderNumber")}</div>
            <div className="font-data text-[19px] sm:text-[21px] font-medium text-nordfjord tabular-nums" data-testid="order-number">
              {order.order_number}
            </div>
          </div>
        </div>
      </div>

      {order.payment_status === "paid" && (
        <div className="mt-5 border border-success bg-success/5 px-4 py-3.5 flex items-start gap-3"
          style={{ borderRadius: "var(--r-m)" }} data-testid="payment-paid-banner">
          {/* Le « ✓ » etait un glyphe en guise d'icone, et la bordure de 2 px
              avec sa couleur en dur ignorait le mode nuit. */}
          <CircleCheck size={17} className="text-success shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-success">
              {lang === "fr" ? "Paiement reçu" : "Payment received"}
            </div>
            <p className="mt-1 text-sm text-glacier leading-relaxed">
              {lang === "fr"
                ? "Merci ! Votre paiement a été confirmé et votre commande est en cours de préparation."
                : "Thank you! Your payment has been confirmed and your order is now being prepared."}
            </p>
          </div>
        </div>
      )}

      {/* TROIS PHRASES DISAIENT LA MEME CHOSE : le titre annoncait le delai,
          le paragraphe le repetait en entier, et le compte a rebours le
          redisait une troisieme fois. Ensemble ils occupaient la hauteur d'un
          ecran de telephone AVANT les instructions de paiement.

          Il en reste une ligne forte — le temps qui reste, la seule
          information qui bouge — et une ligne fine pour la consequence, la
          seule que le titre ne porte pas. */}
      {awaitingPayment && (
        <div className="mt-5 border border-warning bg-warning/5 px-4 py-3.5 flex items-start gap-3"
          style={{ borderRadius: "var(--r-m)" }} data-testid="payment-deadline-warning">
          {remainingMs !== null && remainingMs <= 0
            ? <TriangleAlert size={17} className="text-error shrink-0 mt-0.5" aria-hidden="true" />
            : <Clock size={17} className="text-nordfjord shrink-0 mt-0.5" aria-hidden="true" />}
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-nordfjord tabular-nums"
              data-testid="payment-countdown">
              {remainingMs !== null && remainingMs <= 0
                ? (lang === "fr" ? "Délai expiré" : "Deadline passed")
                : remainingMs !== null
                  ? (lang === "fr"
                      ? `Il vous reste ${resteLisible(remainingMs, "fr")} pour payer`
                      : `${resteLisible(remainingMs, "en")} left to pay`)
                  : delai
                    ? (lang === "fr" ? `Paiement requis sous ${delai}` : `Payment required within ${delai}`)
                    : (lang === "fr" ? "Paiement requis" : "Payment required")}
            </div>
            <p className="mt-1 text-[12px] text-glacier leading-relaxed">
              {lang === "fr"
                ? "Passé ce délai, la commande est annulée automatiquement."
                : "After that, the order is cancelled automatically."}
            </p>
          </div>
        </div>
      )}

      {interac && (
        <div className="mt-5 border border-ash bg-white overflow-hidden" data-testid="interac-instructions" style={{ borderRadius: "var(--r-l)" }}>
          {/* L'eclair « ⚡ » etait un caractere Unicode qui imite une icone :
              son trait et son alignement n'appartiennent a aucun systeme. */}
          <div className="px-6 py-4 flex items-center gap-2.5 border-b border-ash">
            <Landmark size={15} className="text-nova-texte" aria-hidden="true" />
            <span className="font-data text-[11px] uppercase tracking-[0.2em] text-nordfjord">
              {t("confirmation.interacHeading")}
            </span>
          </div>
          <div className="px-6 sm:px-8 py-7 space-y-6">
            <Row numero="1" label={t("confirmation.interacStep1")} value={interac.send_to} onCopy={() => copy(interac.send_to, "email")} copied={copied === "email"} testId="interac-email" />
            <Row numero="2" label={t("confirmation.interacStep2")} value={`$${interac.amount_cad.toFixed(2)} CAD`} onCopy={() => copy(interac.amount_cad.toFixed(2), "amount")} copied={copied === "amount"} testId="interac-amount" />
            <Row numero="3" label={t("confirmation.interacStep3")} value={interac.reference}
              onCopy={() => copy(interac.reference, "ref")} copied={copied === "ref"} testId="interac-ref" highlight
              note={lang === "fr"
                ? "C'est ce numéro qui relie votre virement à cette commande. Recopiez-le exactement."
                : "This number links your transfer to this order. Copy it exactly."} />
            <Row numero="4" label={t("confirmation.interacStep4")} value={interac.security_question} testId="interac-question" />
            <Row numero="5" label={t("confirmation.interacStep5")} value={interac.security_answer_hint} onCopy={() => copy(interac.security_answer_hint, "ans")} copied={copied === "ans"} testId="interac-answer" />
            <p className="text-[12px] text-glacier pt-5 border-t border-ash leading-relaxed">
              {t("confirmation.interacFooter")}
            </p>
          </div>
        </div>
      )}

      {np && (
        <div className="mt-5 border border-ash bg-white overflow-hidden" data-testid="crypto-instructions" style={{ borderRadius: "var(--r-l)" }}>
          {/* Le « ₿ » etait, lui aussi, un glyphe en guise d'icone. */}
          <div className="px-6 py-4 flex items-center gap-2.5 border-b border-ash">
            <Wallet size={15} className="text-nova-texte" aria-hidden="true" />
            <span className="font-data text-[11px] uppercase tracking-[0.2em] text-nordfjord">
              {t("confirmation.cryptoHeading")}
            </span>
          </div>
          {np.invoice_id ? (
            <div className="px-5 sm:px-6 py-7 flex flex-col items-center gap-5" data-testid="crypto-widget-container">
              {/* LE MONTANT EST UN CHIFFRE, PAS UNE PHRASE. Il etait noye dans
                  un paragraphe de quarante mots ou la cliente devait le
                  chercher — sur l'ecran ou elle s'apprete a payer. */}
              <div className="text-center">
                <div className="font-sans text-[11px] uppercase tracking-[0.2em] text-glacier mb-1.5">
                  {lang === "fr" ? "Montant à payer" : "Amount to pay"}
                </div>
                <div className="font-display text-[30px] font-bold text-nordfjord tabular-nums tracking-[-0.02em]" data-testid="crypto-amount">
                  ${order.total.toFixed(2)}
                  <span className="font-data font-medium text-[12px] text-glacier ml-1.5 tracking-normal">CAD</span>
                </div>
              </div>
              <p className="text-[13px] text-glacier leading-relaxed text-center max-w-sm">
                {lang === "fr"
                  ? "Le montant est déjà pré-rempli dans le module ci-dessous. Votre commande est confirmée automatiquement dès réception du paiement."
                  : "The amount is pre-filled in the module below. Your order is confirmed automatically once payment is received."}
              </p>
              {/* TOUT SE PASSE SUR LA BOUTIQUE, y compris sur telephone.
                  Le module garde ses 410 px natifs et c est l ENSEMBLE qui est
                  mis a l echelle du conteneur : le contenu se dessine
                  normalement puis se reduit, au lieu d etre ecrase puis coupe.
                  Voir components/ModuleCrypto.jsx. */}
              <ModuleCrypto invoiceId={np.invoice_id} />

              {/* Le lien direct reste, discret : c est un filet de securite si
                  le module est bloque (extension, reseau), pas un chemin de
                  paiement propose. On ne quitte pas la boutique pour payer. */}
              <div className="flex items-center gap-2 text-[11px] text-glacier">
                <ShieldCheck size={13} aria-hidden="true" />
                {lang === "fr" ? "Paiement traité par NOWPayments" : "Payment processed by NOWPayments"}
              </div>
              <a
                href={np.invoice_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] underline underline-offset-4 text-glacier hover:text-nordfjord transition-colors"
                data-testid="crypto-invoice-link"
              >
                {lang === "fr" ? "Le module ne s'affiche pas ? Ouvrir la page de paiement" : "Widget not loading? Open the payment page"}
              </a>
              <div className="w-full max-w-md border-t border-nordfjord/15 pt-4 mt-2" data-testid="crypto-key-notes">
                <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/60 mb-3">
                  {lang === "fr" ? "Points importants" : "Key things to note"}
                </div>
                <ul className="space-y-2 text-sm text-foreground/75 leading-relaxed">
                  <li className="flex gap-2"><span style={{ color: "#16a34a" }}>✓</span>{lang === "fr"
                    ? "Nous recommandons de rester sur cette page jusqu'à la fin du paiement."
                    : "We recommend staying on this page until the payment is completed."}</li>
                  <li className="flex gap-2"><span style={{ color: "#16a34a" }}>✓</span>{lang === "fr"
                    ? "Les paiements à taux fixe exigent le montant exact et doivent être envoyés avant l'expiration du minuteur."
                    : "Fixed-rate payments require the exact amount and must be sent before the timer expires."}</li>
                  <li className="flex gap-2"><span style={{ color: "#0B2E4F" }}>✕</span>{lang === "fr"
                    ? "Les paiements inférieurs au montant minimum ne peuvent pas être traités."
                    : "Payments below the minimum amount can't be processed."}</li>
                  <li className="flex gap-2"><span style={{ color: "#0B2E4F" }}>✕</span>{lang === "fr"
                    ? "Les paiements complétés ne sont pas remboursables."
                    : "Completed payments are non-refundable."}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-8 space-y-5 font-mono text-sm">
              {np.mock && process.env.NODE_ENV !== "production" && (
                <div className="border border-warning bg-yellow-50 p-3 text-xs uppercase tracking-[0.15em]" style={{ borderColor: "#FFCC00" }}>
                  ⚠ DEMO MODE · Configure NOWPAYMENTS_API_KEY to enable live crypto payments.
                </div>
              )}
              <Row label={t("confirmation.cryptoAddress")} value={np.pay_address} onCopy={() => copy(np.pay_address, "addr")} copied={copied === "addr"} testId="crypto-address" highlight />
              <Row label={t("confirmation.cryptoAmount")} value={`${np.pay_amount} ${np.pay_currency?.toUpperCase()}`} onCopy={() => copy(`${np.pay_amount}`, "amt")} copied={copied === "amt"} testId="crypto-amount" />
              <Row label={t("confirmation.cryptoNetwork")} value={np.pay_currency?.toUpperCase()} testId="crypto-network" />
              <p className="text-xs text-foreground/70 pt-4 border-t border-nordfjord/15 leading-relaxed font-sans">
                {t("confirmation.cryptoFooter")}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 border border-nordfjord/15 rounded-xl p-6 bg-clinical">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-glacier mb-3">{lang === "fr" ? "ARTICLES" : "ITEMS"}</div>
        <ul className="divide-y divide-nordfjord/10">
          {order.items.map((i) => (
            <li key={i.product_id} className="py-3 flex justify-between text-sm">
              <span><span className="font-mono text-foreground/60">{i.qty}×</span> {lang === "fr" ? (i.name_fr || i.name_en) : i.name_en}</span>
              <span className="font-bold">${i.line_total.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-nordfjord/15 space-y-1.5 text-sm">
          <div className="flex justify-between text-foreground/70">
            <span>{lang === "fr" ? "Sous-total" : "Subtotal"}</span>
            <span data-testid="confirm-subtotal">${Number(order.subtotal ?? order.total).toFixed(2)}</span>
          </div>
          {Number(order.discount) > 0 && (
            <div className="flex justify-between text-nova-texte">
              <span>{lang === "fr" ? "Rabais" : "Discount"}</span>
              <span data-testid="confirm-discount">−${Number(order.discount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-foreground/70">
            <span>{lang === "fr" ? "Livraison" : "Shipping"}</span>
            <span data-testid="confirm-shipping">
              {Number(order.shipping) > 0 ? `$${Number(order.shipping).toFixed(2)}` : (lang === "fr" ? "GRATUITE" : "FREE")}
            </span>
          </div>
          {Number(order.tax) > 0 && (
            <div className="flex justify-between text-foreground/70">
              <span>{lang === "fr" ? "Taxes" : "Tax"}</span>
              <span data-testid="confirm-tax">${Number(order.tax).toFixed(2)}</span>
            </div>
          )}
        </div>
        <div className="border-t-2 border-nordfjord mt-3 pt-3 flex justify-between font-display font-bold text-xl">
          <span>TOTAL</span><span data-testid="confirm-total">${order.total.toFixed(2)} CAD</span>
        </div>
      </div>

      {/* ANNULER OU SIGNALER UN PROBLÈME : sur la commande, là où la question
          se pose. Le serveur savait recevoir cette demande depuis longtemps ;
          aucune page ne la proposait. Avant expédition, c'est une annulation ;
          après, un signalement (produit endommagé, erreur de commande). Le
          délai de 48 h est RAPPELÉ, pas imposé : une demande tardive est reçue,
          signalée à l'équipe, et examinée. */}
      {/* La carte reste visible tant qu'un dossier existe. Conditionnée au
          seul « paid », elle disparaissait au moment exact où le
          remboursement aboutissait : payment_status devient "refunded" : et
          le client ne voyait jamais « Remboursement effectué ». */}
      {(order.payment_status === "paid" || order.refund_status) && (() => {
        const fr = lang === "fr";
        const expediee = ["shipped", "delivered"].includes(order.fulfillment_status);
        const ETAT = {
          requested: ["Demande reçue : nous l'examinons sous 2 jours ouvrables.", "Request received : we review it within 2 business days."],
          approved: ["Demande approuvée : le remboursement est en préparation.", "Request approved : your refund is being prepared."],
          processed: ["Remboursement effectué.", "Refund completed."],
          denied: ["Demande non retenue.", "Request declined."],
        };
        const etat = ETAT[order.refund_status];
        return (
          <div className="mt-10 border border-nordfjord/20 rounded-xl p-6 space-y-3" data-testid="refund-card">
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/70">
              {/* Dès qu'un dossier existe, le titre parle du dossier. Il
                  annonçait « Annuler cette commande » au-dessus de
                  « Remboursement effectué » : on proposait d'annuler ce qui
                  était déjà remboursé. */}
              {etat
                ? (fr ? "Remboursement" : "Refund")
                : expediee
                  ? (fr ? "Produit endommagé ou erreur de commande" : "Damaged product or order error")
                  : (fr ? "Annuler cette commande" : "Cancel this order")}
            </div>
            {etat ? (
              <>
                <p className="text-sm" data-testid="refund-status">
                  {fr ? etat[0] : etat[1]}
                  {order.refund_status === "denied" && order.refund_admin_note ? ` : ${order.refund_admin_note}` : ""}
                </p>
                {/* Une demande posée PAR ERREUR se retire d'un clic : la sienne
                    seulement, tant qu'elle n'est pas examinée. Une fois
                    approuvée, de l'argent est en jeu : c'est à l'équipe. */}
                {order.refund_status === "requested" && order.refund_source === "client" && (
                  <button onClick={retirerDemande} disabled={refundBusy} data-testid="refund-withdraw"
                    className="text-sm underline text-foreground/70 hover:text-foreground disabled:opacity-50">
                    {refundBusy
                      ? (fr ? "Retrait…" : "Withdrawing…")
                      : (fr ? "Retirer ma demande" : "Withdraw my request")}
                  </button>
                )}
                {order.refund_status === "requested" && order.refund_source !== "client" && (
                  <p className="text-xs text-foreground/60" data-testid="refund-withdraw-help">
                    {fr
                      ? "Ce dossier a été ouvert par notre équipe. Pour le retirer, écrivez-nous."
                      : "This case was opened by our team. To withdraw it, write to us."}
                  </p>
                )}
                {refundError && <p className="text-sm text-error" data-testid="refund-error">{refundError}</p>}
              </>
            ) : expediee ? (
              /* APRES EXPEDITION : PAS DE SECOND FORMULAIRE.
                 Un produit endommage se montre : la conversation ci-dessous
                 accepte les photos, un champ de texte non. Deux entrees qui
                 font la meme chose obligeaient a choisir sans savoir laquelle
                 mene quelque part. */
              <>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {fr
                    ? "Toutes les ventes sont finales, sauf produit endommagé ou erreur de commande. Signalez-le idéalement dans les 48 heures suivant la livraison, avec une photo : nous ouvrons le dossier depuis votre message."
                    : "All sales are final, except for a damaged product or an order error. Ideally report it within 48 hours of delivery, with a photo : we open the case from your message."}
                </p>
                {/* Le signalement part maintenant par un billet, qui accepte
                    la photo. Une commande passée en INVITÉ n'a pas de compte,
                    donc pas de billet : elle garde le courriel, avec son
                    numéro déjà rempli : sans quoi ces clients-là n'auraient
                    plus aucun moyen de signaler quoi que ce soit. */}
                {order.user_id ? (
                  <Link to="/account?tab=support" data-testid="refund-open-help"
                    className="inline-block bg-nordfjord text-white rounded font-mono text-xs uppercase tracking-[0.2em] px-4 py-2">
                    {fr ? "Signaler un problème avec photo" : "Report an issue with a photo"}
                  </Link>
                ) : (
                  <a data-testid="refund-open-help"
                    href={`mailto:info@fironova.com?subject=${encodeURIComponent(
                      (fr ? "Problème : commande " : "Issue : order ") + order.order_number)}`}
                    className="inline-block bg-nordfjord text-white rounded font-mono text-xs uppercase tracking-[0.2em] px-4 py-2">
                    {fr ? "Signaler un problème par courriel" : "Report an issue by email"}
                  </a>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {fr
                    ? "Votre commande n'est pas encore expédiée : vous pouvez en demander l'annulation. Le remboursement suit la confirmation."
                    : "Your order hasn't shipped yet: you can ask to cancel it. The refund follows confirmation."}
                </p>
                <textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)}
                  rows={3} maxLength={1000} data-testid="refund-reason"
                  placeholder={fr ? "Pourquoi souhaitez-vous annuler ?" : "Why would you like to cancel?"}
                  className="w-full border border-nordfjord/30 rounded px-3 py-2 text-sm" />
                {/* OU RENVOYER L'ARGENT. Interac : l'adresse qui a servi a
                    payer, que nous connaissons. Crypto : nous ne savons pas
                    d'ou vient le depot : seule la personne qui a paye le
                    sait. */}
                {order.payment_method === "nowpayments" ? (
                  <input value={refundDest} onChange={(e) => setRefundDest(e.target.value)}
                    maxLength={200} data-testid="refund-destination"
                    placeholder={fr ? "Adresse du portefeuille où renvoyer les fonds" : "Wallet address to send the funds back to"}
                    className="w-full border border-nordfjord/30 rounded px-3 py-2 text-sm font-mono" />
                ) : (
                  <p className="text-xs text-foreground/60" data-testid="refund-destination-interac">
                    {fr ? "Remboursement par Interac à " : "Refund by Interac to "}
                    <b>{order.email}</b>
                  </p>
                )}
                {refundError && <p className="text-sm text-error" data-testid="refund-error">{refundError}</p>}
                <button onClick={demanderRemboursement} disabled={refundBusy} data-testid="refund-submit"
                  className="bg-nordfjord text-white rounded font-mono text-xs uppercase tracking-[0.2em] px-4 py-2 disabled:opacity-50">
                  {refundBusy
                    ? (fr ? "Envoi…" : "Sending…")
                    : (fr ? "Demander l'annulation" : "Request cancellation")}
                </button>
              </>
            )}
            {order.user_id && (
              <p className="text-xs text-foreground/60">
                {fr ? "Une autre question ? Écrivez-nous depuis votre compte, onglet Aide. " : "Another question? Write to us from your account, Help tab. "}
                <Link to="/account?tab=support" className="underline">{fr ? "Ouvrir l'aide" : "Open help"}</Link>
              </p>
            )}
          </div>
        );
      })()}

      <div className="mt-10 flex gap-4">
        {/* Après une commande, on veut revoir SES commandes : pas la vitrine.
            Le renvoi à l'accueil obligeait à retrouver son compte à la main.
            Une commande passée en invité n'a pas de tableau de bord : elle
            garde l'accueil, qui reste la seule destination qui ait un sens. */}
        <Link to={order.user_id ? "/account" : "/"}
          className="border border-nordfjord font-mono text-xs uppercase tracking-[0.25em] px-6 py-4 hover:bg-nordfjord hover:text-white transition-colors" style={{ borderRadius: "var(--r-m)" }}
          data-testid="back-home-btn">
          ← {order.user_id
            ? (lang === "fr" ? "Mes commandes" : "My orders")
            : t("confirmation.backHome")}
        </Link>
      </div>
    </div>
  );
}

// UNE ETAPE DU VIREMENT INTERAC.
//
// Les cinq champs avaient le meme poids : rien ne disait lequel ne doit
// surtout pas etre mal recopie. Le numero de reference, lui, est celui dont
// depend le rapprochement du paiement avec la commande — le recopier de
// travers, c'est un virement que personne ne relie a son achat.
//
// Le numero d'etape est GAGNE ici : un virement est une sequence, et savoir
// ou l'on en est fait partie de la tache. La ligne critique ne se distingue
// plus par un filet colore a gauche — un bandeau de couleur sur une liste est
// une decoration, pas une hierarchie — mais par sa surface et une phrase qui
// dit POURQUOI elle compte.
function Row({ numero, label, value, onCopy, copied, testId, highlight, note }) {
  return (
    <div className={highlight
      ? "bg-clinical border border-ash px-4 py-3.5"
      : "px-0 py-0"}
      style={highlight ? { borderRadius: "var(--r-m)" } : undefined}>
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3.5 gap-y-1">
        <span className="font-data text-[11px] font-semibold text-nova-texte tabular-nums pt-0.5" aria-hidden="true">
          {numero}
        </span>
        <div className="min-w-0">
          <div className="font-sans text-[11px] uppercase tracking-[0.18em] text-glacier mb-1">{label}</div>
          <div className="font-mono text-[15px] font-semibold text-nordfjord break-all tabular-nums" data-testid={testId}>
            {value}
          </div>
          {note && (
            <p className="font-sans text-[11px] text-glacier leading-relaxed mt-1.5">{note}</p>
          )}
        </div>
        {onCopy ? (
          <button
            onClick={onCopy}
            className="w-10 h-10 shrink-0 border border-ash flex items-center justify-center text-nordfjord transition-colors hover:border-nova hover:text-nova-texte active:scale-[0.97]"
            style={{ borderRadius: "var(--r-m)" }}
            aria-label={copied ? "copié" : "copier"}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        ) : <span />}
      </div>
    </div>
  );
}
