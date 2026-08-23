// frontend/src/pages/AffiliateProgramme.jsx — Le programme, lu AVANT activation.
//
// Le programme d'affiliation est privé : rien n'en est exposé publiquement.
// Cette page n'est donc pas publique non plus — elle exige le jeton
// d'invitation, qui sert ici de clé de lecture.
//
// Ce qu'elle ne fait PAS : activer le compte. Lire et s'engager sont deux
// gestes distincts. Le jeton n'est pas consommé, et le bouton d'activation
// mène à /affiliate/join, qui reste le seul endroit où le compte se crée.
import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";

const TIER_LABEL = {
  standard: { fr: "Standard", en: "Standard" },
  bronze: { fr: "Bronze", en: "Bronze" },
  silver: { fr: "Argent", en: "Silver" },
  gold: { fr: "Or", en: "Gold" },
  platinum: { fr: "Platine", en: "Platinum" },
  diamond: { fr: "Diamant", en: "Diamond" },
};

export default function AffiliateProgramme() {
  useDocumentHead({
    title: "Programme d'affiliation",
    path: "/affiliate/programme",
    noindex: true,
  });
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const location = useLocation();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const token = new URLSearchParams(location.search).get("token") || "";

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const { data: d } = await api.get("/affiliate/invite/program", {
          params: { token },
        });
        if (!vivant) return;
        setData(d);
        setState("ready");
      } catch (e) {
        if (!vivant) return;
        setErrorMsg(formatApiError(e.response?.data?.detail) || e.message);
        setState("error");
      }
    })();
    return () => { vivant = false; };
  }, [token]);

  const argent = (n) =>
    new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
      style: "currency", currency: "CAD", maximumFractionDigits: 0,
    }).format(n);

  const bornes = (t) => {
    if (t.ceil == null) return L(`${argent(t.floor)} et plus`, `${argent(t.floor)} and up`);
    return `${argent(t.floor)} – ${argent(t.ceil)}`;
  };

  return (
    <div className="min-h-[85vh] bg-clinical px-5 py-10" data-testid="affiliate-programme">
      <div className="mx-auto w-full max-w-2xl">
        <div className="relative rounded-3xl border border-ash bg-white p-8 sm:p-10 overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <MolecularMesh opacity={0.4} />
          </div>
          <div className="relative">
            <div className="flex items-center justify-center gap-3 mb-8 text-nordfjord">
              {/* currentColor plutôt qu'un bleu figé : sur fond de carte
                  sombre, #0B2E4F devient illisible. Le mot-symbole hérite
                  ainsi de text-nordfjord, qui s'inverse avec le thème. */}
              <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
              <Wordmark size={16} color="currentColor" />
            </div>

            {state === "loading" && (
              <div className="text-center py-10">
                <div className="h-10 w-10 rounded-full border-2 border-ash border-t-nova animate-spin mx-auto mb-6" />
                <p className="text-sm text-glacier">{L("Un instant…", "One moment…")}</p>
              </div>
            )}

            {state === "error" && (
              <div className="text-center py-6" data-testid="affiliate-programme-error">
                <div className="w-14 h-14 rounded-full bg-error/15 text-error flex items-center justify-center text-2xl font-bold mx-auto mb-6">!</div>
                <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2">
                  {L("Page inaccessible", "Page unavailable")}
                </h1>
                <p className="text-sm text-glacier mb-6">{errorMsg}</p>
                <p className="font-data text-[11px] text-glacier">
                  {L("Cette page se consulte depuis le lien reçu par courriel. Si votre invitation a expiré, contactez l'équipe Fironova.",
                     "This page opens from the link in your email. If your invitation has expired, contact the Fironova team.")}
                </p>
              </div>
            )}

            {state === "ready" && data && (
              <div>
                <p className="font-data text-[10px] uppercase tracking-[0.24em] text-nova text-center">
                  {L("PROGRAMME D'AFFILIATION", "AFFILIATE PROGRAM")}
                </p>
                <h1 className="font-display text-[24px] sm:text-[32px] font-bold text-nordfjord text-center mt-2 mb-3 leading-tight">
                  {data.first_name
                    ? L(`Ce que nous vous proposons, ${data.first_name}`,
                        `What we're offering you, ${data.first_name}`)
                    : L("Ce que nous vous proposons", "What we're offering you")}
                </h1>
                <p className="text-sm text-glacier text-center mb-8 leading-relaxed">
                  {L("Prenez le temps de lire. Rien n'est activé tant que vous ne le décidez pas.",
                     "Take your time. Nothing is activated until you decide.")}
                </p>

                {data.agreed_rate != null && (
                  <div className="rounded-xl border border-nova bg-nova/10 p-5 mb-8 text-center">
                    <p className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-1.5">
                      {L("VOTRE TAUX CONVENU", "YOUR AGREED RATE")}
                    </p>
                    <p className="font-display text-[32px] font-bold text-nordfjord leading-none">
                      {Math.round(data.agreed_rate * 100)} %
                    </p>
                    <p className="text-sm text-glacier mt-2.5 leading-relaxed">
                      {L("Sur chaque vente validée. Ce taux ne dépend pas de votre volume et ne diminue jamais de lui-même ; toute modification vous serait annoncée.",
                         "On every approved sale. This rate doesn't depend on your volume and never decreases on its own; any change would be announced to you.")}
                    </p>
                  </div>
                )}

                <div className="space-y-5 mb-8">
                  <Bloc titre={L("Comment vous gagnez", "How you earn")}>
                    {L("Vos contacts obtiennent un rabais avec votre code ou votre lien. Chaque commande payée vous verse une commission, calculée sur le sous-total des produits après ce rabais — la livraison et les taxes n'entrent pas dans le calcul.",
                       "Your contacts get a discount with your code or link. Every paid order earns you a commission, computed on the product subtotal after that discount — shipping and taxes are excluded.")}
                  </Bloc>
                  <Bloc titre={L("Vos clients restent les vôtres", "Your customers stay yours")}>
                    {L("Le rattachement d'un client à votre compte n'expire pas. Qu'il passe par votre lien ou tape votre code, qu'il revienne au bout d'un mois ou d'un an, la commission vous revient. Le premier affilié à qui un client est rattaché le conserve.",
                       "A customer's link to your account never expires. Whether they use your link or type your code, whether they return after a month or a year, the commission is yours. The first affiliate a customer is attached to keeps them.")}
                  </Bloc>
                  <Bloc titre={L("Quand vous êtes payé", "When you get paid")}>
                    {L(`Une commission est validée sept jours après la commande, quel que soit le mode de paiement. Les versements partent le 1er de chaque mois, en cryptomonnaie stable (USDT ou USDC, réseau de votre choix), dès que le total atteint ${argent(data.payout_min_cad)}.`,
                       `A commission is validated seven days after the order, whatever the payment method. Payouts go out on the 1st of each month, in stablecoin (USDT or USDC, network of your choice), once the total reaches ${argent(data.payout_min_cad)}.`)}
                  </Bloc>
                  <Bloc titre={L("Ce qu'on vous demande", "What we ask of you")}>
                    {L("Nos produits sont destinés exclusivement à la recherche en laboratoire. Vos communications ne doivent jamais leur prêter d'usage humain, médical ou thérapeutique, ni promettre un résultat de santé.",
                       "Our products are strictly for laboratory research. Your communications must never suggest human, medical or therapeutic use, nor promise any health outcome.")}
                  </Bloc>
                </div>

                {data.tiers?.length > 0 && (
                  <div className="mb-8">
                    <h2 className="font-display text-base font-bold text-nordfjord mb-1">
                      {L("Votre taux monte avec vos ventes", "Your rate grows with your sales")}
                    </h2>
                    <p className="text-sm text-glacier mb-4 leading-relaxed">
                      {L("Calculé sur vos ventes des douze derniers mois. Votre tableau de bord vous montre en permanence ce qui vous sépare du palier suivant.",
                         "Based on your sales over the last twelve months. Your dashboard always shows how far you are from the next tier.")}
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-ash">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-clinical">
                            <th className="text-left px-4 py-2 font-data text-[10px] uppercase tracking-[0.14em] text-glacier font-medium">
                              {L("Palier", "Tier")}
                            </th>
                            <th className="text-right px-4 py-2 font-data text-[10px] uppercase tracking-[0.14em] text-glacier font-medium">
                              {L("Ventes 12 mois", "Sales, 12 months")}
                            </th>
                            <th className="text-right px-4 py-2 font-data text-[10px] uppercase tracking-[0.14em] text-glacier font-medium">
                              {L("Commission", "Commission")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.tiers.map((t) => (
                            <tr key={t.key} className="border-t border-ash">
                              <td className="px-4 py-2 text-nordfjord">
                                {TIER_LABEL[t.key]?.[lang] || t.key}
                              </td>
                              <td className="px-4 py-2 text-right font-data text-nordfjord tabular-nums">
                                {bornes(t)}
                              </td>
                              <td className="px-4 py-2 text-right font-data font-bold text-nova tabular-nums">
                                {Math.round(t.rate * 100)} %
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <a href={`/affiliate/join?token=${encodeURIComponent(token)}`}
                   data-testid="affiliate-programme-activate"
                   className="block w-full text-center px-4 py-3 rounded-xl bg-nordfjord text-white text-sm font-semibold hover:opacity-90 transition">
                  {L("Activer mon compte", "Activate my account")}
                </a>
                <p className="font-data text-[11px] text-glacier text-center mt-3 leading-relaxed">
                  {L("L'activation ne vous engage pas : les conditions complètes vous seront présentées ensuite, à accepter explicitement.",
                     "Activating commits you to nothing: the full terms are presented afterwards, for you to accept explicitly.")}
                </p>
                <p className="text-center mt-5">
                  <Link to="/affiliate/terms"
                        className="font-data text-[11px] text-nova hover:underline">
                    {L("Lire les conditions du programme", "Read the program terms")}
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Défini HORS du composant : une fonction recréée à chaque rendu force React à
// démonter puis remonter son sous-arbre, ce qui fait perdre le focus et l'état.
function Bloc({ titre, children }) {
  return (
    <div>
      <h2 className="font-display text-base font-bold text-nordfjord mb-1">{titre}</h2>
      <p className="text-sm text-glacier leading-relaxed">{children}</p>
    </div>
  );
}
