// La cloche de la barre du haut.
//
// Elle ne montre RIEN d'inventé : chaque ligne est un compteur déjà calculé
// par le pouls du tableau de bord ou par les signaux d'exploitation, et mène
// à l'écran qui permet d'agir. Une cloche qui sonne pour rien finit ignorée,
// et ce jour-là elle ne sert plus à prévenir de ce qui compte.
//
// Le point rouge n'apparaît que s'il y a quelque chose à faire, et le nombre
// est lisible sans ouvrir : c'est lui qu'on regarde en passant.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";

export function ClocheNotifications({ pouls, signaux, basePath, L, argent, surAction }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);

  // Un panneau qui ne se ferme pas au clic à côté oblige à revenir chercher
  // sa petite croix — on le referme donc comme tout le monde s'y attend.
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const r = pouls?.ops?.refunds || {};
  const lignes = [
    { cle: "refunds-send", n: r.to_send || 0, vers: "refunds", ton: "urgent",
      texte: L("remboursement(s) à envoyer", "refund(s) to send"),
      détail: r.to_send ? argent(r.to_send_amount) : "" },
    { cle: "reconcile", n: pouls?.money?.reconcile?.count || 0, vers: "reconciliation", ton: "urgent",
      texte: L("paiement(s) à réconcilier", "payment(s) to reconcile") },
    { cle: "manifest", n: signaux?.pending_manifest || 0, vers: "dispatch", ton: "urgent",
      texte: L("étiquette(s) non transmise(s)", "label(s) not transmitted"),
      détail: L("surcharge de 2 $/article", "$2/item surcharge") },
    { cle: "late", n: pouls?.ops?.late_payments || 0, vers: "orders", ton: "urgent",
      texte: L("paiement(s) tardif(s)", "late payment(s)") },
    { cle: "ship", n: pouls?.ops?.to_ship || 0, vers: "dispatch", ton: "warn",
      texte: L("commande(s) à expédier", "order(s) to ship") },
    { cle: "refunds-review", n: r.to_review || 0, vers: "refunds", ton: "warn",
      texte: L("remboursement(s) à examiner", "refund(s) to review") },
    { cle: "tickets", n: pouls?.ops?.tickets_open || 0, vers: "tickets", ton: "warn",
      texte: L("billet(s) d'affilié ouvert(s)", "open affiliate ticket(s)") },
    { cle: "stock", n: pouls?.ops?.low_stock || 0, vers: "products", ton: "warn",
      texte: L("variante(s) en stock bas", "variant(s) low on stock") },
    { cle: "emails", n: pouls?.ops?.emails_failed || 0, vers: "emails/outbox", ton: "warn",
      texte: L("courriel(s) non délivré(s)", "undelivered email(s)") },
  ].filter((l) => l.n > 0);

  const total = lignes.reduce((s, l) => s + l.n, 0);
  const urgent = lignes.some((l) => l.ton === "urgent");

  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        onClick={() => { setOuvert((v) => !v); if (surAction) surAction(); }}
        data-testid="notifications-toggle"
        aria-expanded={ouvert}
        aria-label={total
          ? L(`Notifications : ${total} en attente`, `Notifications: ${total} pending`)
          : L("Notifications : rien en attente", "Notifications: nothing pending")}
        title={L("Notifications", "Notifications")}
        className="relative flex items-center justify-center w-8 h-8 rounded-md border border-ink/15 text-foreground/60 hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Bell size={16} />
        {total > 0 && (
          <span
            data-testid="notifications-dot"
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white ${
              urgent ? "bg-red-600" : "bg-amber-500"}`}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          className="absolute right-0 top-10 z-50 w-80 bg-white border border-ink/10 rounded-xl shadow-lg overflow-hidden"
          data-testid="notifications-panel"
        >
          <div className="px-4 py-3 border-b border-ink/10 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
              {L("À traiter", "To handle")}
            </span>
            {total > 0 && (
              <span className="font-mono text-[10px] text-foreground/50">{total}</span>
            )}
          </div>

          {lignes.length ? (
            <ul className="max-h-[22rem] overflow-y-auto divide-y divide-ink/5">
              {lignes.map((l) => (
                <li key={l.cle}>
                  <Link
                    to={`${basePath}/${l.vers}`}
                    // On relit les compteurs en partant traiter la chose :
                    // sinon la pastille garde son ancien nombre jusqu'au
                    // prochain relevé, et on croit avoir travaillé pour rien.
                    onClick={() => { setOuvert(false); if (surAction) surAction(); }}
                    data-testid={`notification-${l.cle}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-secondary transition-colors"
                  >
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      l.ton === "urgent" ? "bg-red-600" : "bg-amber-500"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm text-foreground">
                        <b className="tabular-nums">{l.n}</b> {l.texte}
                      </span>
                      {l.détail && (
                        <span className="block text-[11px] text-foreground/50 mt-0.5">{l.détail}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-foreground/50 text-center" data-testid="notifications-vide">
              {L("Rien à traiter. Tout est à jour.", "Nothing to handle. All caught up.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ClocheNotifications;
