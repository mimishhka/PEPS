// frontend/src/pages/admin/sections/AdminTickets.jsx — NOUVEAU fichier.
//
// Billets d'assistance des affiliés, côté administration.
//
// L'écran est ordonné par ce qui ATTEND, pas par ce qui est récent : les
// billets sans réponse d'abord, puis ceux déjà traités. Un système de billets
// ne vaut que par la certitude qu'aucune demande ne dort ; classer par date
// laisserait un billet ancien glisser sous les nouveaux.
//
// Chaque billet affiche depuis combien de temps il attend. Au-delà du délai
// annoncé à l'affilié — 1 à 2 jours ouvrables — la mention passe en ambre. Ce
// n'est pas décoratif : c'est le seul endroit où la promesse faite devient
// visible pour celui qui doit la tenir.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { Identity } from "../ui";

const DELAI_HEURES = 48;   // au-delà, le billet est signalé comme en retard

const ETATS = {
  open:     { fr: "En attente", en: "Awaiting", cls: "bg-nova/15 text-nova" },
  pending:  { fr: "Répondu", en: "Replied", cls: "bg-green-100 text-green-800" },
  resolved: { fr: "Résolu", en: "Resolved", cls: "bg-ash/40 text-glacier" },
};

/** Ancienneté en heures depuis le dernier message. On mesure depuis
 *  updated_at et non created_at : un billet répondu il y a une heure n'attend
 *  pas depuis trois jours, même s'il a été ouvert il y a trois jours. */
function heuresDepuis(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function attente(h, lang) {
  if (h < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (h < 24) return `${Math.floor(h)} h`;
  const j = Math.floor(h / 24);
  return lang === "fr" ? `${j} j` : `${j}d`;
}

export default function AdminTickets() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const [tickets, setTickets] = useState(null);
  const [filtre, setFiltre] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [reponse, setReponse] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/affiliate-tickets",
        { params: filtre ? { status: filtre } : undefined });
      setTickets(data || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setTickets([]);
    }
  }, [filtre]);

  useEffect(() => { charger(); }, [charger]);

  const repondre = async (id) => {
    if (!reponse.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/affiliate-tickets/${id}/reply`, { body: reponse.trim() });
      setReponse("");
      await charger();
      toast.success(L("Réponse envoyée", "Reply sent"));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const changerStatut = async (id, status) => {
    try {
      await api.put(`/admin/affiliate-tickets/${id}/status`, { status });
      await charger();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  // Les billets en attente remontent, quel que soit leur âge : c'est l'état
  // qui décide, pas la date. À état égal, le plus ancien passe devant — celui
  // qui attend depuis le plus longtemps est celui qu'on risque d'oublier.
  const ordonnes = [...(tickets || [])].sort((a, b) => {
    const rang = { open: 0, pending: 1, resolved: 2 };
    const d = (rang[a.status] ?? 3) - (rang[b.status] ?? 3);
    if (d !== 0) return d;
    return new Date(a.updated_at) - new Date(b.updated_at);
  });

  const enAttente = (tickets || []).filter((t) => t.status === "open").length;
  const enRetard = (tickets || []).filter(
    (t) => t.status === "open" && heuresDepuis(t.updated_at) > DELAI_HEURES
  ).length;

  return (
    <div className="space-y-6" data-testid="admin-tickets">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-nordfjord">
            {L("Billets affiliés", "Affiliate tickets")}
          </h1>
          <p className="text-glacier text-sm mt-1">
            {enAttente === 0
              ? L("Aucune demande en attente.", "No pending requests.")
              : L(`${enAttente} demande${enAttente > 1 ? "s" : ""} en attente de réponse.`,
                  `${enAttente} request${enAttente > 1 ? "s" : ""} awaiting a reply.`)}
            {enRetard > 0 && (
              <span className="text-warning font-semibold">
                {L(` ${enRetard} au-delà de 48 h.`, ` ${enRetard} past 48h.`)}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {[["", L("Tous", "All")], ["open", L("En attente", "Awaiting")],
            ["pending", L("Répondus", "Replied")], ["resolved", L("Résolus", "Resolved")]].map(
            ([v, lab]) => (
              <button key={v || "all"} onClick={() => setFiltre(v)}
                data-testid={`tickets-filter-${v || "all"}`}
                className={`px-3 py-1.5 rounded-full font-data text-[11px] font-bold uppercase tracking-wider border transition ${
                  filtre === v ? "border-nova text-nova bg-nova/10" : "border-ash text-glacier hover:border-glacier"}`}>
                {lab}
              </button>
            ))}
        </div>
      </div>

      {tickets === null && <p className="text-glacier text-sm">{L("Chargement…", "Loading…")}</p>}
      {tickets?.length === 0 && (
        <div className="bg-white rounded-2xl border border-ash p-10 text-center">
          <MessageSquare size={22} className="mx-auto text-glacier/50 mb-2" />
          <p className="text-sm text-glacier">{L("Aucun billet.", "No tickets.")}</p>
        </div>
      )}

      <div className="space-y-3">
        {ordonnes.map((t) => {
          const etat = ETATS[t.status] || ETATS.open;
          const h = heuresDepuis(t.updated_at);
          const retard = t.status === "open" && h > DELAI_HEURES;
          const deplie = ouvert === t.id;
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-ash overflow-hidden"
                 data-testid={`admin-ticket-${t.id}`}>
              <button onClick={() => { setOuvert(deplie ? null : t.id); setReponse(""); }}
                className="w-full text-left p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full font-data text-[10px] font-semibold uppercase tracking-wider ${etat.cls}`}>
                      {lang === "fr" ? etat.fr : etat.en}
                    </span>
                    <span className={`inline-flex items-center gap-1 font-data text-[11px] ${
                      retard ? "text-warning font-semibold" : "text-glacier"}`}>
                      <Clock size={11} /> {attente(h, lang)}
                    </span>
                    {t.context_path && (
                      <span className="font-data text-[11px] text-glacier/70">{t.context_path}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-nordfjord mt-1.5 truncate">{t.subject}</p>
                  <div className="mt-1.5">
                    <Identity name={t.affiliate_name} email={t.affiliate_email} />
                  </div>
                </div>
                <span className="font-data text-[11px] text-glacier shrink-0">
                  {t.affiliate_code || "—"}
                </span>
              </button>

              {deplie && (
                <div className="border-t border-ash p-4 space-y-3 bg-clinical/40">
                  {t.messages?.map((m) => (
                    <div key={m.id}
                      className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.from === "admin"
                          ? "bg-nordfjord text-clinical ml-8"
                          : "bg-white border border-ash text-nordfjord mr-8"}`}>
                      <p className={`font-data text-[10px] uppercase tracking-wider mb-1 ${
                        m.from === "admin" ? "text-clinical/60" : "text-glacier"}`}>
                        {m.from === "admin" ? L("Vous", "You") : (t.affiliate_name || t.affiliate_code)}
                        {" · "}
                        {new Date(m.at).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA",
                          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}

                  {/* Le contexte figé à l'ouverture. Affiché replié sous le fil
                      plutôt qu'en tête : il sert à vérifier une réponse, pas à
                      être lu avant la question. */}
                  {(t.snapshot?.payout_address || t.snapshot?.tier) && (
                    <p className="font-data text-[11px] text-glacier">
                      {L("À l'ouverture", "At opening")} :
                      {t.snapshot.tier && ` ${t.snapshot.tier}`}
                      {t.snapshot.payout_currency && ` · ${t.snapshot.payout_currency.toUpperCase()}`}
                      {t.snapshot.payout_address && ` · ${t.snapshot.payout_address.slice(0, 10)}…`}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <textarea value={reponse} onChange={(e) => setReponse(e.target.value)}
                      rows={2} maxLength={4000} data-testid="admin-ticket-reply"
                      placeholder={L("Votre réponse…", "Your reply…")}
                      className="flex-1 rounded-lg border border-ash px-3.5 py-2 text-sm text-nordfjord bg-white outline-none focus:border-nova" />
                    <div className="flex flex-col gap-2">
                      <button onClick={() => repondre(t.id)} disabled={busy || !reponse.trim()}
                        data-testid="admin-ticket-send"
                        className="px-4 py-2 rounded-lg bg-nova text-nordfjord font-data text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
                        {L("Répondre", "Reply")}
                      </button>
                      {t.status !== "resolved" && (
                        <button onClick={() => changerStatut(t.id, "resolved")}
                          data-testid="admin-ticket-resolve"
                          className="px-4 py-2 rounded-lg border border-ash text-glacier hover:border-glacier font-data text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
                          <CheckCircle2 size={12} /> {L("Résoudre", "Resolve")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
