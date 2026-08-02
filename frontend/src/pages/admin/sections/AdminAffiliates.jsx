// frontend/src/pages/admin/sections/AdminAffiliates.jsx
// Gestion du programme d'affiliation (invitation, paliers, payouts crypto).
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Copy, DollarSign, X } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TIER_LABEL = {
  standard: { fr: "Standard", en: "Standard" }, bronze: { fr: "Bronze", en: "Bronze" },
  silver: { fr: "Argent", en: "Silver" }, gold: { fr: "Or", en: "Gold" },
  platinum: { fr: "Platine", en: "Platinum" }, diamond: { fr: "Diamant", en: "Diamond" },
};

export default function AdminAffiliates() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [detail, setDetail] = useState(null);
  const [payoutRun, setPayoutRun] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/affiliates");
      setRows(data || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runPayouts = async () => {
    try {
      const { data } = await api.post("/admin/affiliates/payouts/run");
      setPayoutRun(data);
      toast.success(L(`${data.payouts_created} relevé(s) généré(s)`, `${data.payouts_created} payout(s) created`));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <div data-testid="admin-affiliates">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">{L("Affiliés", "Affiliates")}</h2>
          <p className="text-sm text-muted-foreground">{L("Programme privé sur invitation", "Private invitation-only program")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runPayouts} data-testid="affiliate-run-payouts"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition">
            <DollarSign size={16} /> {L("Générer les paiements du mois", "Run monthly payouts")}
          </button>
          <button onClick={() => setShowInvite(true)} data-testid="affiliate-invite-open"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition">
            <Plus size={16} /> {L("Inviter", "Invite")}
          </button>
        </div>
      </div>

      {payoutRun && (
        <div className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">
              {L("Relevés générés", "Payouts generated")} — {payoutRun.period}
            </p>
            <button onClick={() => setPayoutRun(null)}><X size={16} /></button>
          </div>
          {payoutRun.detail?.length ? (
            <ul className="text-xs text-muted-foreground space-y-1">
              {payoutRun.detail.map((d) => (
                <li key={d.payout_id}>{d.affiliate_id.slice(0, 8)}… → {money(d.amount)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{L("Aucune commission approuvée en attente.", "No approved commissions pending.")}</p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">{L("Chargement…", "Loading…")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">{L("Aucun affilié. Invitez votre premier partenaire.", "No affiliates yet. Invite your first partner.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-4 py-3">{L("Affilié", "Affiliate")}</th>
                <th className="px-4 py-3">{L("Code", "Code")}</th>
                <th className="px-4 py-3">{L("Statut", "Status")}</th>
                <th className="px-4 py-3">{L("Palier", "Tier")}</th>
                <th className="px-4 py-3">{L("CA validé", "Validated rev.")}</th>
                <th className="px-4 py-3">{L("En attente", "Pending")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{a.code || "—"}</td>
                  <td className="px-4 py-3"><StatusPill status={a.status} L={L} /></td>
                  <td className="px-4 py-3">{a.tier ? (TIER_LABEL[a.tier]?.[lang] || a.tier) : "—"}{a.commission_rate ? ` · ${Math.round(a.commission_rate * 100)}%` : ""}</td>
                  <td className="px-4 py-3 text-foreground">{a.cumulative_revenue != null ? money(a.cumulative_revenue) : "—"}</td>
                  <td className="px-4 py-3 text-foreground">{a.pending_commission != null ? money(a.pending_commission) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {a.status !== "active" && (
                        <ResendButton affiliateId={a.id} L={L} />
                      )}
                      <button onClick={() => setDetail(a.id)}
                        className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted transition">
                        {L("Détails", "Details")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && <InviteModal L={L} onClose={() => setShowInvite(false)} onDone={load} />}
      {detail && <DetailModal affiliateId={detail} L={L} lang={lang} onClose={() => setDetail(null)} onChange={load} />}
    </div>
  );
}

function StatusPill({ status, L }) {
  const map = {
    invited: { fr: "Invité", en: "Invited", cls: "bg-yellow-500/15 text-yellow-700" },
    active: { fr: "Actif", en: "Active", cls: "bg-green-500/15 text-green-700" },
    suspended: { fr: "Suspendu", en: "Suspended", cls: "bg-red-500/15 text-red-700" },
  };
  const m = map[status] || map.invited;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${m.cls}`}>{L(m.fr, m.en)}</span>;
}

function ResendButton({ affiliateId, L }) {
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/affiliates/${affiliateId}/resend-invite`);
      toast.success(L(`Invitation renvoyée à ${data.sent_to}`, `Invitation resent to ${data.sent_to}`));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={resend} disabled={busy}
      className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted transition disabled:opacity-50 inline-flex items-center gap-1">
      <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {L("Renvoyer", "Resend")}
    </button>
  );
}

function InviteModal({ L, onClose, onDone }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [lang, setLangSel] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const submit = async () => {
    if (!email.trim() || !name.trim()) {
      toast.error(L("Nom et courriel requis", "Name and email required"));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/admin/affiliates/invite", {
        email: email.trim(), name: name.trim(), commission_note: note.trim(), lang,
      });
      setInviteLink(data.invite_link || "");
      toast.success(L("Invitation envoyée", "Invitation sent"));
      onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink); toast.success(L("Lien copié", "Link copied")); }
    catch { toast.error(L("Copie impossible", "Copy failed")); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl border border-border w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-foreground">{L("Inviter un affilié", "Invite an affiliate")}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <Field label={L("Nom", "Name")}>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="invite-name"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none focus:border-foreground" />
          </Field>
          <Field label={L("Courriel", "Email")}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="invite-email"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none focus:border-foreground" />
          </Field>
          <Field label={L("Note interne (optionnel)", "Internal note (optional)")}>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none focus:border-foreground" />
          </Field>
          <Field label={L("Langue de l'email", "Email language")}>
            <select value={lang} onChange={(e) => setLangSel(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none focus:border-foreground">
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
        {inviteLink && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{L("Lien d'invitation", "Invite link")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-foreground break-all">{inviteLink}</code>
              <button onClick={copy} className="p-1.5 rounded-md hover:bg-muted"><Copy size={14} /></button>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-6">
          <button onClick={submit} disabled={busy} data-testid="invite-submit"
            className="flex-1 px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
            {busy ? L("Envoi…", "Sending…") : L("Envoyer l'invitation", "Send invitation")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ affiliateId, L, lang, onClose, onChange }) {
  const [data, setData] = useState(null);
  const [markingId, setMarkingId] = useState(null);
  const [ref, setRef] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/affiliates/${affiliateId}`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  }, [affiliateId]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (patch) => {
    try {
      await api.put(`/admin/affiliates/${affiliateId}`, patch);
      toast.success(L("Mis à jour", "Updated"));
      load(); onChange();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const markPaid = async (payoutId) => {
    if (!ref.trim()) { toast.error(L("Référence de transaction requise", "Transaction reference required")); return; }
    try {
      await api.post(`/admin/affiliates/payouts/${payoutId}/mark-paid`, { reference: ref.trim() });
      toast.success(L("Paiement confirmé", "Payment confirmed"));
      setMarkingId(null); setRef(""); load(); onChange();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const a = data?.affiliate;
  const m = data?.metrics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl border border-border w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-foreground">{a?.name || "—"}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {!data ? (
          <p className="text-sm text-muted-foreground">{L("Chargement…", "Loading…")}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label={L("Courriel", "Email")} value={a.email} />
              <Info label={L("Code", "Code")} value={a.code || "—"} mono />
              <Info label={L("Statut", "Status")} value={a.status} />
              <Info label={L("Conformité", "Compliance")} value={a.compliance_status} />
              {m && <>
                <Info label={L("CA validé", "Validated rev.")} value={money(m.cumulative_revenue)} />
                <Info label={L("CA trimestre", "Quarter rev.")} value={money(m.quarter_revenue)} />
                <Info label={L("Palier", "Tier")} value={`${TIER_LABEL[m.tier]?.[lang] || m.tier} · ${Math.round(m.commission_rate * 100)}%`} />
                <Info label={L("En attente", "Pending")} value={money(m.pending_commission)} />
              </>}
              <Info label={L("Invitations envoyées", "Invites sent")} value={a.invite_sent_count || 0} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {a.status === "active" && (
                <button onClick={() => setStatus({ status: "suspended" })}
                  className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted">{L("Suspendre", "Suspend")}</button>
              )}
              {a.status === "suspended" && (
                <button onClick={() => setStatus({ status: "active" })}
                  className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted">{L("Réactiver", "Reactivate")}</button>
              )}
              {a.compliance_status !== "review" && (
                <button onClick={() => setStatus({ compliance_status: "review" })}
                  className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted">{L("Marquer en révision", "Flag for review")}</button>
              )}
              {a.compliance_status !== "compliant" && (
                <button onClick={() => setStatus({ compliance_status: "compliant" })}
                  className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted">{L("Marquer conforme", "Mark compliant")}</button>
              )}
            </div>

            {/* Payouts */}
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{L("Relevés de paiement", "Payouts")}</p>
              {data.payouts?.length ? (
                <div className="space-y-2">
                  {data.payouts.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground">{p.period} · {money(p.amount)} <span className="uppercase text-xs text-muted-foreground">{p.currency}</span></span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "paid" ? "bg-green-500/15 text-green-700" : "bg-yellow-500/15 text-yellow-700"}`}>{p.status}</span>
                      </div>
                      {p.status === "ready" && (
                        markingId === p.id ? (
                          <div className="flex gap-2 mt-2">
                            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={L("Réf. transaction / tx hash", "Tx reference / hash")}
                              className="flex-1 rounded-md border border-border px-2 py-1 text-xs bg-background outline-none" />
                            <button onClick={() => markPaid(p.id)} className="px-3 py-1 rounded-md bg-foreground text-background text-xs">{L("Confirmer", "Confirm")}</button>
                          </div>
                        ) : (
                          <button onClick={() => { setMarkingId(p.id); setRef(""); }}
                            className="mt-2 px-3 py-1 rounded-md border border-border text-xs hover:bg-muted">{L("Marquer payé", "Mark paid")}</button>
                        )
                      )}
                      {p.reference && <p className="text-[11px] text-muted-foreground mt-1 break-all">{L("Réf", "Ref")}: {p.reference}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">{L("Aucun relevé.", "No payouts.")}</p>}
            </div>

            {/* Referrals */}
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{L("Commandes attribuées", "Attributed orders")}</p>
              {data.referrals?.length ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="px-3 py-2">{L("Commande", "Order")}</th>
                        <th className="px-3 py-2">{L("Base", "Base")}</th>
                        <th className="px-3 py-2">{L("Commission", "Commission")}</th>
                        <th className="px-3 py-2">{L("Statut", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referrals.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="px-3 py-2 text-foreground">{r.order_number || "—"}</td>
                          <td className="px-3 py-2">{money(r.base_amount)}</td>
                          <td className="px-3 py-2">{money(r.commission_amount)}</td>
                          <td className="px-3 py-2">{r.status}{r.excluded_reason ? ` (${r.excluded_reason})` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground">{L("Aucune commande.", "No orders.")}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value, mono }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
