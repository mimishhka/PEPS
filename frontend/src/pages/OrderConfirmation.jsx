import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";

export default function OrderConfirmation() {
  const { id } = useParams();
  const { state } = useLocation();
  const { t } = useLang();
  const [order, setOrder] = useState(state?.order || null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!order) {
      api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => {});
    }
  }, [id, order]);

  if (!order) return <div className="p-16 font-mono text-xs uppercase tracking-[0.25em]">{t("common.loading")}</div>;

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const interac = order.payment_info?.type === "interac" ? order.payment_info.instructions : null;
  const np = order.payment_info?.type === "nowpayments" ? order.payment_info.provider_response : null;

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
