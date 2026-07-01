import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";

export default function OrderConfirmation() {
  const { id } = useParams();
  const { state } = useLocation();
  const { t, lang } = useLang();
  const [order, setOrder] = useState(state?.order || null);
  const [copied, setCopied] = useState("");
  const [stripePolling, setStripePolling] = useState(false);
  const [remainingMs, setRemainingMs] = useState(null);

  useEffect(() => {
    if (!order) {
      api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => {});
    }
  }, [id, order]);

  // Stripe success-redirect polling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    let attempts = 0;
    const max = 8;
    setStripePolling(true);
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/stripe/status/${sessionId}`);
        if (data.payment_status === "paid") {
          setStripePolling(false);
          const fresh = await api.get(`/orders/${id}`);
          setOrder(fresh.data);
          return;
        }
        if (data.status === "expired") {
          setStripePolling(false);
          return;
        }
      } catch { /* ignore */ }
      attempts += 1;
      if (attempts < max) setTimeout(poll, 2000);
      else setStripePolling(false);
    };
    poll();
  }, [id]);

  // Countdown for awaiting payments (48h from order creation)
  useEffect(() => {
    if (!order || !["awaiting_etransfer", "awaiting_crypto"].includes(order.payment_status)) return;
    const deadline = new Date(order.created_at).getTime() + 48 * 3600 * 1000;
    const tick = () => setRemainingMs(deadline - Date.now());
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [order]);

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
        const { data } = await api.get(`/payments/crypto/status/${order.id}`);
        if (data.payment_status === "paid") {
          clearInterval(iv);
          const fresh = await api.get(`/orders/${order.id}`);
          setOrder(fresh.data);
        }
      } catch { /* ignore */ }
    }, 20000);
    return () => clearInterval(iv);
  }, [order]);

  if (!order) return <div className="p-16 font-mono text-xs uppercase tracking-[0.25em]">{t("common.loading")}</div>;

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const interac = order.payment_info?.type === "interac" ? order.payment_info.instructions : null;
  const np = order.payment_info?.type === "nowpayments" ? order.payment_info.provider_response : null;
  const awaitingPayment = ["awaiting_etransfer", "awaiting_crypto"].includes(order.payment_status);

  return (
    <div className="max-w-4xl mx-auto px-6 py-16" data-testid="confirmation-page">
      <div className="border border-ink">
        <div className="bg-ink text-white px-6 py-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.25em]">
          <span>// ORDER CONFIRMED</span>
          <span>{new Date(order.created_at).toLocaleString()}</span>
        </div>
        <div className="p-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50">{t("confirmation.orderNumber")}</div>
          <div className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight mt-2" data-testid="order-number">
            {order.order_number}
          </div>
          <h1 className="font-display text-2xl uppercase tracking-tight mt-8">{t("confirmation.title")}</h1>
          <p className="text-foreground/70 mt-2">{t("confirmation.sub")}</p>
        </div>
      </div>

      {stripePolling && (
        <div className="mt-8 border border-ink p-4 bg-yellow-50 font-mono text-xs uppercase tracking-[0.2em]" data-testid="stripe-polling">
          ⏳ Verifying your Stripe payment…
        </div>
      )}

      {awaitingPayment && (
        <div className="mt-8 border-2 border-signal p-5 flex items-start gap-3" style={{ borderColor: "#E51919" }} data-testid="payment-deadline-warning">
          <span className="font-display font-extrabold text-xl leading-none" style={{ color: "#E51919" }}>!</span>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: "#E51919" }}>
              {lang === "fr" ? "Paiement requis sous 48 heures" : "Payment required within 48 hours"}
            </div>
            <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
              {lang === "fr"
                ? "Votre commande sera automatiquement annulée si le paiement n'est pas reçu dans les 48 heures."
                : "Your order will be automatically cancelled if payment is not received within 48 hours."}
            </p>
            {remainingMs !== null && (
              <div className="mt-3 font-mono text-sm font-bold tracking-[0.1em]" data-testid="payment-countdown">
                {remainingMs > 0
                  ? (lang === "fr"
                      ? `⏳ Il vous reste ${Math.floor(remainingMs / 3600000)} h ${Math.floor((remainingMs % 3600000) / 60000)} min pour payer`
                      : `⏳ You have ${Math.floor(remainingMs / 3600000)}h ${Math.floor((remainingMs % 3600000) / 60000)}min left to pay`)
                  : (lang === "fr" ? "⚠ Délai expiré — la commande sera annulée." : "⚠ Deadline expired — the order will be cancelled.")}
              </div>
            )}
          </div>
        </div>
      )}

      {interac && (
        <div className="mt-8 border border-ink" data-testid="interac-instructions">
          <div className="bg-signal text-white px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ background: "#E51919" }}>
            ⚡ {t("confirmation.interacHeading")}
          </div>
          <div className="p-8 space-y-5 font-mono text-sm">
            <Row label={t("confirmation.interacStep1")} value={interac.send_to} onCopy={() => copy(interac.send_to, "email")} copied={copied === "email"} testId="interac-email" />
            <Row label={t("confirmation.interacStep2")} value={`$${interac.amount_cad.toFixed(2)} CAD`} onCopy={() => copy(interac.amount_cad.toFixed(2), "amount")} copied={copied === "amount"} testId="interac-amount" />
            <Row label={t("confirmation.interacStep3")} value={interac.reference} onCopy={() => copy(interac.reference, "ref")} copied={copied === "ref"} testId="interac-ref" highlight />
            <Row label={t("confirmation.interacStep4")} value={interac.security_question} testId="interac-question" />
            <Row label={t("confirmation.interacStep5")} value={interac.security_answer_hint} onCopy={() => copy(interac.security_answer_hint, "ans")} copied={copied === "ans"} testId="interac-answer" />
            <p className="text-xs text-foreground/70 pt-4 border-t border-ink/15 leading-relaxed font-sans">
              {t("confirmation.interacFooter")}
            </p>
          </div>
        </div>
      )}

      {np && (
        <div className="mt-8 border border-ink" data-testid="crypto-instructions">
          <div className="bg-ink text-white px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em]">
            ₿ {t("confirmation.cryptoHeading")}
          </div>
          {np.invoice_id ? (
            <div className="p-6 flex flex-col items-center gap-4" data-testid="crypto-widget-container">
              <p className="text-sm text-foreground/70 leading-relaxed text-center max-w-md">
                {lang === "fr"
                  ? `Payez ${order.total.toFixed(2)} $ CAD en crypto via le module sécurisé NOWPayments ci-dessous — le montant exact est déjà pré-rempli. La confirmation de votre commande est automatique dès réception du paiement.`
                  : `Pay $${order.total.toFixed(2)} CAD in crypto through the secure NOWPayments module below — the exact amount is pre-filled. Your order is confirmed automatically once payment is received.`}
              </p>
              <iframe
                title="NOWPayments"
                src={`https://nowpayments.io/embeds/payment-widget?iid=${np.invoice_id}`}
                width="410"
                height="696"
                frameBorder="0"
                scrolling="no"
                style={{ overflowY: "hidden", maxWidth: "100%" }}
                data-testid="nowpayments-widget"
              />
              <a
                href={np.invoice_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] uppercase tracking-[0.2em] underline text-foreground/60 hover:text-foreground"
                data-testid="crypto-invoice-link"
              >
                {lang === "fr" ? "Ouvrir la page de paiement dans un nouvel onglet →" : "Open the payment page in a new tab →"}
              </a>
            </div>
          ) : (
            <div className="p-8 space-y-5 font-mono text-sm">
              {np.mock && (
                <div className="border border-warning bg-yellow-50 p-3 text-xs uppercase tracking-[0.15em]" style={{ borderColor: "#FFCC00" }}>
                  ⚠ DEMO MODE · Configure NOWPAYMENTS_API_KEY to enable live crypto payments.
                </div>
              )}
              <Row label={t("confirmation.cryptoAddress")} value={np.pay_address} onCopy={() => copy(np.pay_address, "addr")} copied={copied === "addr"} testId="crypto-address" highlight />
              <Row label={t("confirmation.cryptoAmount")} value={`${np.pay_amount} ${np.pay_currency?.toUpperCase()}`} onCopy={() => copy(`${np.pay_amount}`, "amt")} copied={copied === "amt"} testId="crypto-amount" />
              <Row label={t("confirmation.cryptoNetwork")} value={np.pay_currency?.toUpperCase()} testId="crypto-network" />
              <p className="text-xs text-foreground/70 pt-4 border-t border-ink/15 leading-relaxed font-sans">
                {t("confirmation.cryptoFooter")}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 border border-ink/20 p-6 bg-secondary">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mb-3">ITEMS</div>
        <ul className="divide-y divide-ink/15">
          {order.items.map((i) => (
            <li key={i.product_id} className="py-3 flex justify-between text-sm">
              <span><span className="font-mono text-foreground/60">{i.qty}×</span> {i.name_en}</span>
              <span className="font-bold">${i.line_total.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t-2 border-ink mt-4 pt-3 flex justify-between font-display font-extrabold text-xl">
          <span>TOTAL</span><span>${order.total.toFixed(2)} CAD</span>
        </div>
      </div>

      <div className="mt-10 flex gap-4">
        <Link to="/" className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-4 hover:bg-ink hover:text-white" data-testid="back-home-btn">
          ← {t("confirmation.backHome")}
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, onCopy, copied, testId, highlight }) {
  return (
    <div className={`grid grid-cols-[1fr_auto] items-start gap-4 ${highlight ? "bg-secondary -mx-3 px-3 py-3 border-l-2 border-signal" : ""}`} style={highlight ? { borderLeftColor: "#E51919" } : {}}>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{label}</div>
        <div className="text-base font-bold break-all" data-testid={testId}>{value}</div>
      </div>
      {onCopy && (
        <button onClick={onCopy} className="border border-ink p-2 hover:bg-ink hover:text-white" aria-label="copy">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
}
