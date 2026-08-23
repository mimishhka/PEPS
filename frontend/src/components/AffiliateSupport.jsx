// frontend/src/components/AffiliateSupport.jsx — NOUVEAU fichier.
//
// Billets d'assistance, côté affilié.
//
// Le parti pris est la transparence : quelqu'un qui écrit doit savoir sous
// quel délai on répond, et où en est sa demande. Un billet dont on ignore
// l'état inquiète davantage qu'un courriel resté sans réponse, parce qu'on le
// voit et qu'on ne peut rien en faire.
//
// Les statuts disent donc ce qu'ils SIGNIFIENT — « en attente de réponse »
// plutôt que « open » — et le délai annoncé est en jours OUVRABLES. Un billet
// déposé vendredi soir échoirait dimanche en heures, ce que personne ne tient,
// et une promesse écrite non tenue vaut moins que pas de promesse.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";

const ETATS = {
  open: {
    fr: "En attente de réponse", en: "Awaiting reply",
    cls: "bg-nova/15 text-nova",
  },
  pending: {
    fr: "Réponse reçue", en: "Replied",
    cls: "bg-green-100 text-green-800",
  },
  resolved: {
    fr: "Résolu", en: "Resolved",
    cls: "bg-ash/40 text-glacier",
  },
};

function quand(iso, lang) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function AffiliateSupport({ L, lang }) {
  const [tickets, setTickets] = useState(null);
  const [ouvert, setOuvert] = useState(null);     // id du fil déplié
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");
  const [reponse, setReponse] = useState("");
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data } = await api.get("/affiliate/tickets");
      setTickets(data || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setTickets([]);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const creer = async (e) => {
    e.preventDefault();
    if (sujet.trim().length < 3 || corps.trim().length < 10) {
      toast.error(L("Indiquez un sujet et décrivez votre question.",
                    "Add a subject and describe your question."));
      return;
    }
    setBusy(true);
    try {
      await api.post("/affiliate/tickets", {
        subject: sujet.trim(),
        body: corps.trim(),
        context_path: window.location.pathname,
      });
      setSujet(""); setCorps("");
      await charger();
      toast.success(L("Demande envoyée.", "Request sent."));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const repondre = async (id) => {
    if (!reponse.trim()) return;
    setBusy(true);
    try {
      await api.post(`/affiliate/tickets/${id}/reply`, { body: reponse.trim() });
      setReponse("");
      await charger();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="affiliate-support">
      <div className="bg-white rounded-xl border border-ash p-6">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
          {L("POSER UNE QUESTION", "ASK A QUESTION")}
        </p>
        <p className="text-sm text-glacier mb-4 leading-relaxed">
          {L("Nous répondons sous 1 à 2 jours ouvrables. Votre code, votre palier et votre configuration de versement sont joints automatiquement — inutile de les recopier.",
             "We reply within 1 to 2 business days. Your code, tier and payout settings are attached automatically — no need to repeat them.")}
        </p>
        <form onSubmit={creer} className="space-y-3">
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-1.5">
              {L("Sujet", "Subject")}
            </label>
            <input value={sujet} onChange={(e) => setSujet(e.target.value)}
              data-testid="ticket-subject" maxLength={140}
              placeholder={L("Ex. : ma commission du 12 août n'apparaît pas",
                             "e.g. my August 12 commission is missing")}
              className="w-full rounded-lg border border-ash px-4 py-2.5 text-sm text-nordfjord bg-white outline-none focus:border-nova" />
          </div>
          <div>
            <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-1.5">
              {L("Votre question", "Your question")}
            </label>
            <textarea value={corps} onChange={(e) => setCorps(e.target.value)}
              data-testid="ticket-body" rows={4} maxLength={4000}
              className="w-full rounded-lg border border-ash px-4 py-2.5 text-sm text-nordfjord bg-white outline-none focus:border-nova" />
          </div>
          <button type="submit" disabled={busy} data-testid="ticket-submit"
            className="px-6 py-2.5 rounded-full bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider disabled:opacity-40">
            {busy ? L("Envoi…", "Sending…") : L("Envoyer", "Send")}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-ash p-6">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
          {L("VOS DEMANDES", "YOUR REQUESTS")}
        </p>

        {tickets === null && (
          <p className="text-sm text-glacier">{L("Chargement…", "Loading…")}</p>
        )}
        {tickets?.length === 0 && (
          <p className="text-sm text-glacier">
            {L("Vous n'avez ouvert aucune demande.", "You have no open requests.")}
          </p>
        )}

        <div className="divide-y divide-ash">
          {tickets?.map((t) => {
            const etat = ETATS[t.status] || ETATS.open;
            const deplie = ouvert === t.id;
            return (
              <div key={t.id} className="py-3.5" data-testid={`ticket-${t.id}`}>
                <button onClick={() => { setOuvert(deplie ? null : t.id); setReponse(""); }}
                  className="w-full text-left flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-nordfjord truncate">{t.subject}</span>
                    <span className="block font-data text-[11px] text-glacier mt-0.5">
                      {quand(t.created_at, lang)}
                      {t.messages?.length > 1 && ` · ${t.messages.length} ${L("messages", "messages")}`}
                    </span>
                  </span>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full font-data text-[10px] font-semibold uppercase tracking-wider ${etat.cls}`}>
                    {lang === "fr" ? etat.fr : etat.en}
                  </span>
                </button>

                {deplie && (
                  <div className="mt-3 space-y-3">
                    {t.messages?.map((m) => (
                      <div key={m.id}
                        className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                          m.from === "admin"
                            ? "bg-clinical border border-ash text-nordfjord"
                            : "bg-nova/5 text-nordfjord"}`}>
                        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-1">
                          {m.from === "admin" ? "FIRONOVA" : L("Vous", "You")} · {quand(m.at, lang)}
                        </p>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}

                    {/* Répondre rouvre un billet résolu — le serveur applique
                        la même règle. Quelqu'un qui écrit encore n'a pas eu
                        satisfaction, et le laisser parler dans le vide serait
                        pire que de ne rien lui offrir. */}
                    <div className="flex gap-2">
                      <input value={reponse} onChange={(e) => setReponse(e.target.value)}
                        data-testid="ticket-reply-input" maxLength={4000}
                        placeholder={L("Ajouter une précision…", "Add a detail…")}
                        className="flex-1 rounded-lg border border-ash px-3.5 py-2 text-sm text-nordfjord bg-white outline-none focus:border-nova" />
                      <button onClick={() => repondre(t.id)} disabled={busy || !reponse.trim()}
                        data-testid="ticket-reply-send"
                        className="px-4 py-2 rounded-lg bg-nordfjord text-clinical font-data text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
                        {L("Envoyer", "Send")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
