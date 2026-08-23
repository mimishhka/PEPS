// frontend/src/pages/admin/sections/AdminPayouts.jsx
// Gestion dédiée des paiements affiliés (payouts) — flux NOWPayments semi-auto.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, Zap, ShieldCheck, RefreshCw, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const STATUS = {
  ready:      { fr: "Pret", en: "Ready", cls: "bg-warning/15 text-warning border border-warning/30" },
  creating:   { fr: "2FA requis", en: "2FA required", cls: "bg-nova/15 text-nova border border-nova/30" },
  processing: { fr: "En traitement", en: "Processing", cls: "bg-glacier/15 text-glacier border border-glacier/30" },
  paid:       { fr: "Paye", en: "Paid", cls: "bg-success/15 text-success border border-success/30" },
  failed:     { fr: "Echoue", en: "Failed", cls: "bg-error/10 text-error border border-error/25" },
};

export default function AdminPayouts() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const [payouts, setPayouts] = useState(null);
  const [busy, setBusy] = useState("");
  const [verifyFor, setVerifyFor] = useState(null);
  const [code, setCode] = useState("");
  const [markFor, setMarkFor] = useState(null);
  const [ref, setRef] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/affiliates/payouts/all");
      setPayouts(Array.isArray(data) ? data : (data.payouts || []));
    } catch (e) {
      setPayouts([]);
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runPayouts = async () => {
    setBusy("run");
    try {
      const { data } = await api.post("/admin/affiliates/payouts/run");
      toast.success(L(`${data.payouts_created} releve(s) genere(s)`, `${data.payouts_created} payout(s) created`));
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const execute = async (p) => {
    setBusy(p.id);
    try {
      const { data } = await api.post(`/admin/affiliates/payouts/${p.id}/execute`);
      toast.success(L("Payout cree — saisissez le code 2FA recu par courriel.", "Payout created — enter the 2FA code from your email."));
      setVerifyFor({ ...p, np_batch_id: data.np_batch_id });
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const verify = async () => {
    if (!code.trim() || !verifyFor) return;
    setBusy(verifyFor.id);
    try {
      await api.post(`/admin/affiliates/payouts/${verifyFor.id}/verify`, { verification_code: code.trim() });
      toast.success(L("Payout verifie et en traitement.", "Payout verified and processing."));
      setVerifyFor(null); setCode("");
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const refreshStatus = async (p) => {
    setBusy(p.id);
    try {
      const { data } = await api.get(`/admin/affiliates/payouts/${p.id}/status`);
      toast.success(L(`Statut : ${data.status}`, `Status: ${data.status}`));
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const markPaid = async () => {
    if (!ref.trim() || !markFor) return;
    setBusy(markFor.id);
    try {
      await api.post(`/admin/affiliates/payouts/${markFor.id}/mark-paid`, { reference: ref.trim() });
      toast.success(L("Marque comme paye.", "Marked as paid."));
      setMarkFor(null); setRef("");
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(""); }
  };

  const totals = useMemo(() => {
    const list = payouts || [];
    const ready = list.filter((p) => p.status === "ready");
    return {
      ready: ready.length,
      // Somme en CAD, pas en `amount`. Pour un versement crypto, `amount` est
      // deja le montant converti en USD (voir _generate_payouts_for_period) :
      // additionner ce champ melangeait des devises et affichait le resultat
      // avec un simple « $ ». Le CAD est la seule base homogene, et c'est
      // celle qui correspond a vos livres.
      readyCad: ready.reduce((sum, p) => sum + (p.amount_cad ?? p.amount ?? 0), 0),
      pending: list.filter((p) => ["creating", "processing"].includes(p.status)).length,
    };
  }, [payouts]);

  if (payouts === null) {
    return <div className="p-8 text-glacier">{L("Chargement...", "Loading...")}</div>;
  }

  return (
    <div className="space-y-6" data-testid="admin-payouts">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-nordfjord">{L("Paiements affilies", "Affiliate payouts")}</h1>
          <p className="text-glacier text-sm mt-1">{L("Generez, executez et suivez les versements de commissions.", "Generate, execute and track commission payouts.")}</p>
        </div>
        <button onClick={runPayouts} disabled={busy === "run"} data-testid="run-payouts"
          className="btn-pill btn-nova disabled:opacity-40 flex items-center gap-2">
          <DollarSign size={16} /> {L("Generer les releves", "Generate payouts")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label={L("Prets a payer", "Ready to pay")} value={`${totals.ready} · ${money(totals.readyCad)} CAD`} />
        <Stat label={L("En cours", "In progress")} value={totals.pending} />
        <Stat label={L("Total releves", "Total payouts")} value={payouts.length} />
      </div>

      {payouts.length === 0 ? (
        <div className="rounded-xl border border-ash bg-white p-10 text-center text-glacier">
          {L("Aucun releve de paiement. Cliquez « Generer les releves » pour agreger les commissions approuvees.",
             "No payouts yet. Click \"Generate payouts\" to aggregate approved commissions.")}
        </div>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => {
            const st = STATUS[p.status] || STATUS.ready;
            return (
              <div key={p.id} className="rounded-xl border border-ash bg-white p-4 flex items-center gap-4 flex-wrap" data-testid={`payout-${p.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-nordfjord">{p.affiliate_code || "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold font-data uppercase tracking-[0.08em] ${st.cls}`}>{L(st.fr, st.en)}</span>
                  </div>
                  <div className="font-data text-[11px] text-glacier mt-0.5">
                    {p.period} · {p.referral_count} {L("filleuls", "referrals")} · {String(p.currency || "").toUpperCase()}
                    {p.np_error ? <span className="text-error"> · {p.np_error}</span> : null}
                  </div>
                </div>
                {/* Les DEUX montants. `amount` est deja converti en USD pour un
                    versement crypto : l'afficher via money() donnait « $180.00 »
                    sans qualification, lu naturellement comme des dollars
                    canadiens. Le montant envoye porte donc sa devise, et la base
                    CAD — celle qui correspond a vos livres — apparait dessous
                    avec le taux applique. */}
                <div className="text-right shrink-0">
                  <div className="font-display font-bold text-nordfjord tabular-nums whitespace-nowrap">
                    {Number(p.amount || 0).toFixed(2)}
                    <span className="text-xs font-data text-glacier uppercase ml-1">
                      {p.currency || "cad"}
                    </span>
                  </div>
                  {p.amount_cad != null && p.amount_usd != null && (
                    <div className="font-data text-[11px] text-glacier tabular-nums whitespace-nowrap">
                      {money(p.amount_cad)} CAD
                      {p.fx_rate_cad_to_usd ? ` × ${Number(p.fx_rate_cad_to_usd).toFixed(4)}` : ""}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {p.status === "ready" && (
                    <button onClick={() => execute(p)} disabled={busy === p.id} data-testid={`execute-${p.id}`}
                      className="btn-pill btn-nova text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-40">
                      <Zap size={13} /> {L("Executer", "Execute")}
                    </button>
                  )}
                  {p.status === "creating" && (
                    <button onClick={() => setVerifyFor(p)} data-testid={`verify-open-${p.id}`}
                      className="btn-pill bg-nova text-nordfjord text-xs px-3 py-2 flex items-center gap-1.5">
                      <ShieldCheck size={13} /> {L("Saisir 2FA", "Enter 2FA")}
                    </button>
                  )}
                  {["creating", "processing"].includes(p.status) && (
                    <button onClick={() => refreshStatus(p)} disabled={busy === p.id} data-testid={`refresh-${p.id}`}
                      className="btn-pill btn-outline text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-40">
                      <RefreshCw size={13} /> {L("Actualiser", "Refresh")}
                    </button>
                  )}
                  {(p.status === "ready" || p.status === "failed") && (
                    <button onClick={() => setMarkFor(p)} data-testid={`markpaid-open-${p.id}`}
                      className="btn-pill btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> {L("Marquer paye", "Mark paid")}
                    </button>
                  )}
                  {p.status === "paid" && p.reference && (
                    <span className="font-data text-[11px] text-success flex items-center gap-1"><CheckCircle2 size={13} /> {L("Paye", "Paid")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verifyFor && (
        <Modal onClose={() => { setVerifyFor(null); setCode(""); }} title={L("Verification 2FA", "2FA verification")}>
          <p className="text-sm text-glacier mb-4">
            {L("NOWPayments a envoye un code a l'adresse courriel de votre compte marchand. Saisissez-le pour finaliser le versement.",
               "NOWPayments sent a code to your merchant account email. Enter it to finalize the payout.")}
          </p>
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" data-testid="verify-code"
            className="w-full rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova font-data tracking-[0.3em] text-center text-lg" />
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setVerifyFor(null); setCode(""); }} className="flex-1 btn-pill btn-outline">{L("Annuler", "Cancel")}</button>
            <button onClick={verify} disabled={!code.trim() || busy === verifyFor.id} data-testid="verify-submit"
              className="flex-1 btn-pill btn-nova disabled:opacity-40">{L("Valider", "Verify")}</button>
          </div>
        </Modal>
      )}

      {markFor && (
        <Modal onClose={() => { setMarkFor(null); setRef(""); }} title={L("Marquer comme paye", "Mark as paid")}>
          <p className="text-sm text-glacier mb-4">
            {L("Enregistrez la reference de transaction (hash) pour tracer ce versement effectue manuellement.",
               "Record the transaction reference (hash) to trace this manually-sent payout.")}
          </p>
          <input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} placeholder={L("Hash / reference", "Tx hash / reference")} data-testid="markpaid-ref"
            className="w-full rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova font-data" />
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setMarkFor(null); setRef(""); }} className="flex-1 btn-pill btn-outline">{L("Annuler", "Cancel")}</button>
            <button onClick={markPaid} disabled={!ref.trim() || busy === markFor.id} data-testid="markpaid-submit"
              className="flex-1 btn-pill btn-nova disabled:opacity-40">{L("Confirmer", "Confirm")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-ash bg-white px-4 py-3">
      <div className="font-data text-[10px] uppercase tracking-[0.16em] text-glacier">{label}</div>
      <div className="font-display font-bold text-nordfjord text-xl mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nordfjord/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-nordfjord">{title}</h3>
          <button onClick={onClose} className="text-glacier hover:text-nordfjord"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
