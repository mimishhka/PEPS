// frontend/src/pages/AffiliateDashboard.jsx — Tableau de bord affilié Fironova.
// Bilingue FR/EN, identité NOVA. Derrière l'auth existante (ProtectedRoute).
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { QRCodeSVG } from "qrcode.react";
import {
  MousePointerClick, ShoppingBag, Wallet, Download,
  MessageCircle, Send, Mail, Activity,
} from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import { DashboardSkeleton } from "../components/LoadingSkeletons";
import useAffiliate from "../hooks/useAffiliate";
import useDocumentHead from "../hooks/useDocumentHead";
import GuidedTour from "../components/GuidedTour";
import AffiliateSupport from "../components/AffiliateSupport";
import TermsModal from "../components/TermsModal";
import TierLadder from "../components/TierLadder";
import TierMark from "../components/TierMark";
import ThemeToggle from "../components/ThemeToggle";

import useChartColors from "../hooks/useChartColors";
// Couleurs métal de l'échelle des paliers. Deux corrections par rapport à la
// version précédente :
//
//   — Standard et Argent portaient LE MÊME gris (#64748B). Deux paliers
//     distincts, une seule couleur : l'échelle ne se lisait pas.
//   — Diamant portait #00B8D4, l'accent de la marque. Le système d'identité
//     réserve cette couleur aux appels à l'action ; l'utiliser pour un palier
//     la banalisait partout ailleurs.
//
// La progression va du turquoise au violet, en passant par les métaux — on
// suit l'échelle du regard sans lire les noms.
const TIER_META = {
  standard: { fr: "Standard", en: "Standard", color: "#2DBFB0" },
  bronze: { fr: "Bronze", en: "Bronze", color: "#C97B3F" },
  silver: { fr: "Argent", en: "Silver", color: "#8FA3B0" },
  gold: { fr: "Or", en: "Gold", color: "#DFA436" },
  platinum: { fr: "Platine", en: "Platinum", color: "#7FB0D4" },
  diamond: { fr: "Diamant", en: "Diamond", color: "#9B8BE0" },
};

const COMPLIANCE_META = {
  compliant: { fr: "Conforme", en: "Compliant", cls: "bg-success/15 text-success", dot: "✅" },
  review: { fr: "En révision", en: "Under review", cls: "bg-warning/15 text-warning", dot: "⚠️" },
  suspended: { fr: "Suspendu", en: "Suspended", cls: "bg-error/15 text-error", dot: "🔒" },
};

const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Masque un email pour préserver la vie privée du client rattaché tout en
// donnant assez de contexte à l'affilié pour reconnaître ses propres clients.
const maskEmail = (email) => {
  if (!email || typeof email !== "string" || !email.includes("@")) return email || "—";
  const [local, domain] = email.split("@");
  const l = local.length <= 2 ? local[0] + "*" : `${local[0]}${"*".repeat(Math.min(3, local.length - 2))}${local[local.length - 1]}`;
  return `${l}@${domain}`;
};

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (headers, rows) =>
  [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");

const downloadCsv = (filename, headers, rows) => {
  const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const PAGE_SIZE = 10;
const fmtDate = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" });
};
const fmtDateTime = (iso, lang) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const REFERRAL_STATUS_META = {
  pending: { fr: "En attente", en: "Pending", cls: "bg-ash/50 text-glacier" },
  approved: { fr: "Approuvé", en: "Approved", cls: "bg-nova/15 text-nordfjord" },
  paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
  reversed: { fr: "Annulé", en: "Reversed", cls: "bg-error/15 text-error" },
};

function Pagination({ page, total, pageSize, onChange, L }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-ash">
      <p className="text-[11px] text-glacier">{L("Page", "Page")} {page} / {pages}</p>
      <div className="flex gap-1.5">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Précédent", "Prev")}
        </button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical disabled:opacity-40">
          {L("Suivant", "Next")}
        </button>
      </div>
    </div>
  );
}

export default function AffiliateDashboard() {
  // Les couleurs de graphique passent par des PROPRIETES, pas des
  // classes : sans ce crochet elles ignorent le mode nuit.
  const couleursGraphique = useChartColors();
  useDocumentHead({ title: "Affiliate Dashboard", path: "/affiliate", noindex: true });
  const { user } = useAuth();
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const {
    affiliate: data,
    loading: affiliateLoading,
    error: affiliateError,
    mutate: refreshAffiliate,
  } = useAffiliate(lang);

  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [series, setSeries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [insights, setInsights] = useState(null);
  const [, setClicksStats] = useState(null);
  const [sources, setSources] = useState(null);
  const [activity, setActivity] = useState([]);
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  // Copie du CODE, distincte de celle du lien : ce sont deux choses qu'on
  // partage dans deux situations différentes, et un seul témoin de copie
  // afficherait « Copié » sur le mauvais bouton.
  const [codeCopie, setCodeCopie] = useState(false);
  const [refPage, setRefPage] = useState(1);
  const [payPage, setPayPage] = useState(1);

  // Payout settings form
  const [payAddr, setPayAddr] = useState("");
  const [payCur, setPayCur] = useState("btc");
  const [savingPay, setSavingPay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Résilient : un endpoint qui échoue ne casse pas tout le tableau de bord.
      setRefPage(1); setPayPage(1);
      const [r, p, perf, ins, ck, src, act, cus] = await Promise.allSettled([
        api.get("/affiliate/referrals"),
        api.get("/affiliate/payouts"),
        api.get("/affiliate/performance"),
        api.get("/affiliate/insights"),
        api.get("/affiliate/clicks"),
        api.get("/affiliate/clicks/sources"),
        api.get("/affiliate/activity"),
        api.get("/affiliate/customers"),
      ]);
      setReferrals(r.status === "fulfilled" ? (r.value.data || []) : []);
      setPayouts(p.status === "fulfilled" ? (p.value.data || []) : []);
      setInsights(ins.status === "fulfilled" ? (ins.value.data || null) : null);
      setClicksStats(ck.status === "fulfilled" ? (ck.value.data || null) : null);
      setSources(src.status === "fulfilled" ? (src.value.data || null) : null);
      setActivity(act.status === "fulfilled" ? (act.value.data || []) : []);
      setCustomers(cus.status === "fulfilled" ? (cus.value.data?.customers || []) : []);
      const perfData = perf.status === "fulfilled" ? perf.value.data : null;
      setSeries((perfData?.series || []).map((s) => ({
        month: s.month,
        revenue: s.revenue,
        commission: s.commission,
      })));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    setPayAddr(data.payout_address || "");
    setPayCur(data.payout_currency || "usdt");
  }, [data]);

  useEffect(() => {
    if (affiliateError && affiliateError.response?.status !== 403) {
      toast.error(formatApiError(affiliateError.response?.data?.detail) || affiliateError.message);
    }
  }, [affiliateError]);

  // Top products: prioritise l'affilié (produits qu'IL a vendus) —
  // fallback vers featured/catalog s'il n'a aucune vente encore.
  const [topProducts, setTopProducts] = useState([]);
  const [personalTop, setPersonalTop] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Essaie les produits personnels de l'affilié
      try {
        const { data } = await api.get("/affiliate/top-products", { params: { limit: 3 } });
        if (!cancelled && data?.items?.length) {
          setTopProducts(data.items.map((p) => ({
            slug: p.slug,
            name_fr: p.name_fr,
            name_en: p.name_en,
            image_url: p.image_url,
            qty: p.qty,
            revenue: p.revenue,
            orders: p.orders,
            _personal: true,
          })));
          setPersonalTop(true);
          return;
        }
      } catch { /* fallback ci-dessous */ }

      // 2) Fallback : produits en vedette du catalogue
      try {
        const [featured, all] = await Promise.all([
          api.get("/products", { params: { featured: true } }).catch(() => ({ data: [] })),
          api.get("/products").catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const combined = [...(featured.data || []), ...(all.data || [])];
        const seen = new Set();
        const dedup = combined.filter((p) => {
          if (!p?.slug || seen.has(p.slug)) return false;
          seen.add(p.slug);
          return true;
        }).slice(0, 3);
        setTopProducts(dedup);
        setPersonalTop(false);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const productShareUrl = (slug) => refCode
    ? `${window.location.origin}/product/${slug}?ref=${refCode}`
    : "";

  const copyProduct = async (slug) => {
    const url = productShareUrl(slug);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(L("Lien copié", "Link copied"), { description: url });
    } catch { toast.error(L("Copie impossible", "Copy failed")); }
  };

  const shareProduct = (slug, kind) => {
    const url = encodeURIComponent(productShareUrl(slug));
    const text = encodeURIComponent(
      L(`Découvrez ce composé Fironova (code ${refCode})`,
        `Check out this Fironova compound (code ${refCode})`)
    );
    const targets = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      email: `mailto:?subject=${encodeURIComponent(L("Découverte Fironova", "Fironova pick"))}&body=${text}%20${url}`,
    };
    try { window.open(targets[kind], "_blank", "noopener,noreferrer"); }
    catch { toast.error(L("Ouverture impossible", "Unable to open")); }
  };

  const refCode = data?.code || "";
  const refLink = refCode
    ? `${window.location.origin}/?ref=${refCode}`
    : "";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(refCode);
      setCodeCopie(true);
      setTimeout(() => setCodeCopie(false), 1800);
    } catch {
      toast.error(L("Copie impossible", "Copy failed"));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(L("Copie impossible", "Copy failed"));
    }
  };

  const share = (kind) => {
    const url = encodeURIComponent(refLink);
    const text = encodeURIComponent(
      L(`Découvrez la gamme Fironova avec mon code promo ${refCode || ""}`, `Check out Fironova with my promo code ${refCode || ""}`)
    );
    const targets = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      email: `mailto:?subject=${encodeURIComponent(L("Recommandation Fironova", "Fironova recommendation"))}&body=${text}%20${url}`,
    };
    try { window.open(targets[kind], "_blank", "noopener,noreferrer"); }
    catch { toast.error(L("Ouverture impossible", "Unable to open")); }
  };

  const exportReferrals = () =>
    downloadCsv(
      `fironova-referrals-${refCode}.csv`,
      ["Order", "Base", "Commission", "Status", "Date"],
      referrals.map((r) => [
        r.order_number, r.base_amount, r.commission_amount, r.status,
        fmtDate(r.created_at, lang),
      ])
    );

  const exportPayouts = () =>
    downloadCsv(
      `fironova-payouts-${refCode}.csv`,
      ["Period", "Amount CAD", "FX CAD to USD", "FX source", "Amount received", "Currency", "Status", "Paid at", "Reference"],
      payouts.map((p) => [
        p.period,
        p.amount_cad ?? p.amount,
        p.fx_rate_cad_to_usd || "",
        p.fx_source || "",
        p.amount,
        p.currency,
        p.status,
        p.paid_at || "",
        p.reference || "",
      ])
    );

  const refPageRows = referrals.slice((refPage - 1) * PAGE_SIZE, refPage * PAGE_SIZE);
  const payPageRows = payouts.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);

  const savePayout = async () => {
    if (!payAddr.trim()) {
      toast.error(L("Adresse requise", "Address required"));
      return;
    }
    setSavingPay(true);
    try {
      await api.put("/affiliate/payout-settings", {
        payout_address: payAddr.trim(),
        payout_currency: payCur.trim().toLowerCase(),
      });
      toast.success(L("Préférences enregistrées", "Settings saved"));
      await refreshAffiliate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSavingPay(false);
    }
  };

  // Visite guidée. Ces deux crochets doivent rester AU-DESSUS des sorties
  // anticipées qui suivent : React exige que chaque rendu appelle la même
  // suite de crochets. Places plus bas, ils n'etaient pas executes pendant le
  // chargement puis l'etaient une fois les donnees arrivees, ce qui faisait
  // lancer « Rendered more hooks than during the previous render » et
  // remplacait tout le tableau de bord par l'ecran d'erreur.
  const [tourOuvert, setTourOuvert] = useState(false);
  useEffect(() => {
    // Trois conditions, toutes nécessaires : la fiche est chargée, les
    // conditions sont acceptées — la visite n'a aucun sens avant —, et le
    // SERVEUR dit qu'elle n'a pas déjà été donnée. Ce dernier point vient de
    // la fiche affilié et non du navigateur : autrement la visite rejouait
    // entièrement sur un autre appareil ou après un nettoyage.
    if (data && data.terms_ok !== false && data.tour_done !== true) {
      // Court délai : laisse la mise en page se stabiliser avant de mesurer
      // la première cible, sans quoi la bulle apparaît décalée.
      const t = setTimeout(() => setTourOuvert(true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [data]);

  // Terminer ET quitter marquent la visite comme donnée : quelqu'un qui sort à
  // la deuxième bulle a décidé qu'il n'en voulait pas. L'échec de l'appel est
  // volontairement silencieux — le pire qui puisse arriver est qu'elle soit
  // proposée une fois de plus, ce qui ne justifie pas d'alarmer l'affilié.
  const fermerTour = useCallback(async () => {
    setTourOuvert(false);
    // Retour à la vue globale. La visite se termine sur l'onglet Aide ; y
    // laisser quelqu'un lui ferait croire qu'il a atterri là par erreur.
    setTab("overview");
    try {
      await api.post("/affiliate/tour/done");
      await refreshAffiliate();
    } catch { /* sans conséquence */ }
  }, [refreshAffiliate]);

  if (loading || affiliateLoading) {
    return <DashboardSkeleton />;
  }

  if (affiliateError?.response?.status === 403) {
    return (
      <div className="bg-clinical min-h-screen">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="affiliate-not-member">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
            {L("PROGRAMME PRIVÉ", "PRIVATE PROGRAM")}
          </p>
          <h1 className="font-display text-[32px] font-bold text-nordfjord mb-4">
            {L("Accès sur invitation", "Invitation only")}
          </h1>
          <p className="text-glacier leading-relaxed">
            {L(
              "Le programme d'affiliation Fironova est privé et fonctionne uniquement sur invitation. Si vous avez reçu une invitation, activez-la depuis le lien de votre courriel.",
              "The Fironova affiliate program is private and invitation-only. If you received an invitation, activate it from the link in your email."
            )}
          </p>
        </div>
      </div>
    );
  }

  const tierColor = TIER_META[data?.tier]?.color || "#64748B";
  const tierLabel = TIER_META[data?.tier]?.[lang] || data?.tier;
  const comp = COMPLIANCE_META[data?.compliance_status] || COMPLIANCE_META.compliant;
  const progress = data?.progress_to_next != null ? Math.round(data.progress_to_next * 100) : null;

  // Ce qu'une vente rapporte. L'exemple est ancre sur la BASE COMMISSIONNABLE,
  // pas sur le prix affiche avant rabais : ainsi le taux du palier s'applique
  // tel quel — 100 $ de base a 10 % donnent 10 $ — et la phrase ne melange pas
  // deux montants differents. Annoncer « une vente de 100 $ rapporte 9 $ »
  // etait exact mais illisible : le lecteur ne sait pas lequel des deux
  // chiffres est le sien.
  const exampleBase = 100;
  const exampleEarn = exampleBase * Number(data?.commission_rate || 0);

  // Jalons de demarrage, deduits des donnees reelles — jamais d'etape declaree
  // franchie sans preuve. Le bloc disparait quand les trois sont acquises :
  // un chemin d'accueil qui reste affiche pour toujours devient du decor.
  const steps = [
    { done: (insights?.clicks || 0) > 0,
      t: L("Partagez votre lien", "Share your link"),
      d: L("Une seule visite suffit pour démarrer le suivi.",
           "A single visit is enough to start tracking.") },
    { done: (insights?.validated_orders || 0) > 0,
      t: L("Première vente validée", "First validated sale"),
      d: L("Votre commission apparaît dès la commande payée.",
           "Your commission appears as soon as the order is paid.") },
    { done: Number(data?.paid_commission || 0) > 0,
      t: L("Premier versement", "First payout"),
      d: L("Dès le seuil atteint, versé dans votre portefeuille.",
           "Once the threshold is met, sent to your wallet.") },
  ];
  const onboarding = steps.some((x) => !x.done);
  const nextStep = steps.findIndex((x) => !x.done);

  // `ton` choisit la couleur fonctionnelle du liseré et l'étiquette de zone.
  // Il qualifie ce dont la bulle parle — argent acquis, argent en attente,
  // règle à respecter — au lieu de colorer pour colorer.
  const TOUR = [
    // Cible le panneau lien+code, TOUJOURS présent — et non le bloc des
    // produits à promouvoir, qui n'apparaît qu'une fois des ventes réalisées.
    // La première bulle pointait donc dans le vide pour un nouvel affilié,
    // c'est-à-dire pour la seule personne à qui la visite s'adresse.
    { cible: "affiliate-link-panel", ton: "nova", onglet: "overview",
      titre: L("Votre lien et votre code", "Your link and code"),
      texte: L("Partagez l'un ou l'autre. Le lien reconnaît vos visiteurs pendant un an ; le code, lui, n'expire jamais et fonctionne même à l'oral.",
               "Share either one. The link recognises your visitors for a year; the code never expires and works even spoken aloud.") },
    { cible: "affiliate-kpis", ton: "acquis", onglet: "overview",
      titre: L("Validé ne veut pas dire versé", "Validated is not paid"),
      texte: L(`Une commande devient « validée » ${data?.approval_hold_days ?? 7} jours après avoir été passée. C'est ce montant qui fait progresser votre palier. Si une réclamation est déposée, la commission reste en attente jusqu'à la décision.`,
               `An order becomes “validated” ${data?.approval_hold_days ?? 7} days after it is placed. That amount is what moves your tier. If a claim is filed, the commission stays pending until it is resolved.`) },
    { cible: "payout-estimate", ton: "attente", onglet: "overview",
      titre: L("Le seuil de versement", "The payout threshold"),
      // Le seuil est LU du serveur, jamais écrit en dur : une valeur figée ici
      // divergerait de AFFILIATE_PAYOUT_MIN_CAD au premier changement, et la
      // visite affirmerait alors un montant que le système n'applique plus.
      texte: L(`Les versements partent une fois par mois, à partir de ${money(data?.payout_min_cad)}. En dessous, rien n'est perdu : le solde s'ajoute au mois suivant.`,
               `Payouts go out monthly, from ${money(data?.payout_min_cad)}. Below that nothing is lost: the balance carries over.`) },
    { cible: "affiliate-tier-badge", ton: "acquis", onglet: "overview",
      titre: data?.tier_agreement
        ? L("Votre taux convenu", "Your agreed rate")
        : L("Votre palier", "Your tier"),
      texte: data?.tier_agreement
        ? L("Il résulte d'une entente et ne suit pas le barème. Il ne varie pas avec votre volume de ventes et ne baisse jamais automatiquement.",
            "It comes from an agreement and does not follow the scale. It does not vary with your sales volume and never decreases automatically.")
        : L("Il suit votre chiffre d'affaires validé sur douze mois glissants, et monte dès le seuil franchi. De 10 % à 20 % selon le palier.",
            "It follows your validated revenue over twelve rolling months, and rises as soon as a threshold is crossed. From 10% to 20%.") },

    // Les étapes qui suivent changent d'ONGLET. La visite ne parlait que de la
    // vue globale : cinq onglets sur six n'étaient jamais mentionnés, dont
    // celui où se saisit l'adresse de versement — sans laquelle un solde
    // s'accumule et ne peut jamais être envoyé.
    { cible: "affiliate-performance", ton: "nova", onglet: "performance",
      titre: L("D'où viennent vos ventes", "Where your sales come from"),
      texte: L("Clics, conversions, produits qui marchent, appareils utilisés. C'est ici qu'on voit ce qui fonctionne avant de le répéter.",
               "Clicks, conversions, products that work, devices used. This is where you see what works before repeating it.") },
    { cible: "affiliate-payments", ton: "acquis", onglet: "payments",
      titre: L("L'historique de vos versements", "Your payout history"),
      texte: L("Chaque versement avec son montant, sa devise, le taux de change retenu et sa référence. Exportable en CSV pour votre comptabilité.",
               "Every payout with its amount, currency, the exchange rate used and its reference. Exportable to CSV for your bookkeeping.") },
    { cible: "affiliate-compliance", ton: "regle", onglet: "compliance",
      titre: L("Ce qui peut suspendre votre compte", "What can suspend your account"),
      texte: L("Communication privée uniquement, et aucune allégation de santé — ni posologie, ni effet thérapeutique. C'est le seul manquement qui suspend sans préavis, parce qu'il nous engage tous les deux.",
               "Private communication only, and no health claims — no dosage, no therapeutic effect. It is the one breach that suspends without notice, because it commits us both.") },
    { cible: "affiliate-payout-address", ton: "attente", onglet: "settings",
      titre: L("À faire avant votre premier versement", "Do this before your first payout"),
      texte: L("Sans adresse de portefeuille, vos commissions s'accumulent sans pouvoir vous être envoyées. Renseignez-la dès maintenant : une adresse Ethereum (0x…) ou Tron (T…).",
               "Without a wallet address, your commissions build up with no way to reach you. Set it now: an Ethereum (0x…) or Tron (T…) address.") },
    { cible: "affiliate-support", ton: "regle", onglet: "support",
      titre: L("Une question ?", "A question?"),
      texte: L("Écrivez-nous d'ici : votre code, votre palier et votre configuration sont joints automatiquement. Réponse sous un à deux jours ouvrables.",
               "Write to us from here: your code, tier and settings are attached automatically. Reply within one to two business days.") },
    { cible: "affiliate-faq-link", ton: "regle", onglet: "overview",
      titre: L("Vos questions", "Your questions"),
      texte: L("Le détail des règles s'y trouve : calcul des commissions, attribution, adresses de portefeuille. Vous pouvez relancer cette visite depuis là.",
               "The detailed rules live there: commission calculation, attribution, wallet addresses. You can restart this tour from there.") },
  ];

  const payoutMin = Number(data?.payout_min_cad || 0);
  const dueNow = Number(data?.approved_commission || 0);
  const payoutPct = payoutMin > 0 ? Math.min(100, Math.round((dueNow / payoutMin) * 100)) : null;

  const TABS = [
    ["overview", L("Vue globale", "Overview")],
    ["performance", L("Performance", "Performance")],
    ["payments", L("Paiements", "Payments")],
    ["compliance", L("Conformité", "Compliance")],
    ["settings", L("Paramètres", "Settings")],
    ["support", L("Aide", "Help")],
  ];

  // Conditions non acceptées pour la version courante : on rend UNIQUEMENT
  // l'écran d'acceptation. Pas une surcouche par-dessus le tableau de bord —
  // un affilié verrait ses chiffres derrière et pourrait fermer la fenêtre,
  // et rien ne prouverait plus qu'il a lu quoi que ce soit.
  if (data && data.terms_ok === false) {
    // Une date d'acceptation déjà présente signifie que l'affilié avait accepté
    // une version antérieure : c'est une révision, pas une première visite.
    return <AffiliateTermsGate L={L} lang={lang} onDone={refreshAffiliate}
                               dejaAccepte={Boolean(data?.terms_accepted_at)} />;
  }

  return (
    <div className="bg-clinical min-h-screen">
      {tourOuvert && (
        <GuidedTour steps={TOUR} L={L} onClose={fermerTour} onTab={setTab} />
      )}
      <div className="max-w-6xl mx-auto px-6 py-16" data-testid="affiliate-dashboard">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ash pb-6 mb-8">
          <div>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-2">
              {L("PROGRAMME D'AFFILIATION", "AFFILIATE PROGRAM")}
            </p>
            {/* Accueil par le PRÉNOM. On s'adresse à une personne, pas à une
                fiche : « Bonjour, Marie-Claude Saint-Jean » sonne comme un
                publipostage. Le prénom vient de la fiche affilié, saisie à
                l'invitation ; on retombe sur le nom complet pour les comptes
                antérieurs, qui n'ont pas de prénom séparé. */}
            <h1 className="font-display text-[40px] font-bold text-nordfjord leading-none">
              {L("Bonjour", "Welcome")}, {data?.first_name || user?.name}
            </h1>
            {/* L'entreprise, quand elle existe, se met SOUS le prénom et non à
                côté : c'est la personne qu'on salue, l'entreprise précise au
                nom de qui elle touche ses commissions. Absente pour un
                affilié particulier, la ligne disparaît entièrement. */}
            {data?.company && (
              <p className="font-data text-[12px] uppercase tracking-[0.14em] text-glacier mt-1.5">
                {data.company}
              </p>
            )}
            <p className="font-data text-xs text-glacier mt-2">
              {L("Prochaine réévaluation", "Next review")} : {data?.next_review ? new Date(data.next_review).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric" }) : "—"}
              {" · "}
              {/* Placé ici plutôt que dans un onglet : les questions viennent
                  quand on regarde ses chiffres, pas quand on cherche un menu. */}
              <Link to="/affiliate/faq" data-testid="affiliate-faq-link" className="text-nova underline">
                {L("Questions fréquentes", "FAQ")}
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-data
                             text-[11px] font-semibold uppercase tracking-wider"
                  data-testid="affiliate-tier-badge"
                  style={{ background: `${tierColor}1a`, color: tierColor }}>
              <TierMark tier={data?.tier} color={tierColor} size={16} />
              {tierLabel} · {Math.round((data?.commission_rate || 0) * 100)}%
            </span>
            <span className={`px-3 py-1.5 rounded-full font-data text-[11px] font-semibold ${comp.cls}`}>
              {comp.dot} {comp[lang]}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              data-testid={`affiliate-tab-${k}`}
              className={`px-4 py-2 rounded-full font-data text-xs font-semibold uppercase tracking-wider transition ${
                tab === k ? "bg-nordfjord text-white" : "bg-white text-glacier border border-ash hover:border-nova"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-8" data-testid="affiliate-overview">
            {/* Bandeau. Tant que rien n'a ete gagne, un « 0,00 $ » en gros
                caracteres n'enseigne rien : on montre ce qu'une vente vaut. Des
                qu'il y a des gains, le montant reel est plus utile. */}
            <div className="rounded-xl bg-nordfjord p-6 flex flex-wrap items-center justify-between gap-4">
              {Number(data?.cumulative_revenue || 0) === 0 ? (
                <div>
                  <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                    {L("CE QUE VOUS GAGNEZ", "WHAT YOU EARN")}
                  </p>
                  <p className="font-display text-3xl font-bold text-white">
                    {L("Une commande de ", "A ")}{money(exampleBase)}{L(" vous rapporte ", " order earns you ")}
                    <span className="text-nova tabular-nums">{money(exampleEarn)}</span>
                  </p>
                  <p className="font-data text-xs text-white/60 mt-1">
                    {L(`${Math.round((data?.commission_rate || 0) * 100)} % du sous-total des produits après rabais — livraison et taxes exclues.`,
                       `${Math.round((data?.commission_rate || 0) * 100)}% of the product subtotal after discount — shipping and taxes excluded.`)}
                  </p>
                </div>
              ) : (
              <div>
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                  {L("GAINS DU MOIS EN COURS", "THIS MONTH'S EARNINGS")}
                </p>
                <p className="font-display text-4xl font-bold text-white tabular-nums">
                  {money(insights?.current_month?.commission)}
                </p>
                <p className="font-data text-xs text-white/60 mt-1">
                  {money(insights?.current_month?.revenue)} {L("de ventes validées", "in validated sales")}
                </p>
              </div>
              )}
              {insights?.best_month && (
                <div className="text-right">
                  <p className="font-data text-[11px] uppercase tracking-wider text-white/50 mb-1">
                    {L("Meilleur mois", "Best month")}
                  </p>
                  <p className="font-display text-xl font-bold text-white">{money(insights.best_month.commission)}</p>
                  <p className="font-data text-xs text-white/60">{insights.best_month.month}</p>
                </div>
              )}
            </div>

            {/* Chemin de demarrage. Il ne s'affiche que tant qu'une etape reste
                a franchir : garde en permanence, il deviendrait du decor. */}
            {onboarding && (
              <div data-testid="affiliate-onboarding">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-glacier mb-3">
                  {L("VOS PROCHAINES ÉTAPES", "YOUR NEXT STEPS")}
                </p>
                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 list-none p-0 m-0">
                  {steps.map((st, i) => (
                    <li key={i}
                        className={`bg-white rounded-xl border p-5 ${
                          i === nextStep ? "border-nova ring-1 ring-nova" : "border-ash"}`}>
                      <p className="font-data text-[10px] uppercase tracking-[0.18em] text-glacier">
                        {st.done
                          ? L("Fait", "Done")
                          : `${L("Étape", "Step")} ${i + 1}`}
                      </p>
                      <p className="font-semibold text-nordfjord mt-1 flex items-center gap-1.5">
                        {st.done && <span aria-hidden="true" style={{ color: "#2E9E6B" }}>✓</span>}
                        {st.t}
                      </p>
                      <p className="text-[12px] text-glacier mt-0.5">{st.d}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* KPI cards — la devise est explicite. Les montants sont en CAD
                alors que le versement part en USDT/USDC : sans etiquette, un
                affilie qui voit « 250 $ » et recoit 180 USDT croit a une
                retenue. La conversion n'apparaissait qu'APRES un versement,
                dans l'historique — donc jamais pour qui n'a pas encore ete paye. */}
            {/* DEUX cartes, pas quatre. Ce bandeau ne porte que le chiffre
                d'affaires : les commissions vivent dans le panneau de
                versement, et l'activité — clics, conversion, commandes, panier
                — dans la rangée d'indicateurs plus bas. Chacune de ces trois
                zones répond à une question distincte, et aucune ne répète les
                chiffres d'une autre. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="affiliate-kpis">
              <KpiCard label={L("Revenu validé cumulé", "Cumulative validated revenue")} value={money(data?.cumulative_revenue)} sub="CAD" />
              <KpiCard label={L("12 derniers mois", "Last 12 months")} value={money(data?.rolling12_revenue)} sub={L("CAD · fixe votre palier", "CAD · sets your tier")} />
            </div>

            {/* Prochain versement. Affiche meme a zero : c'est justement quand
                rien n'est accumule qu'un affilie doit connaitre le seuil. La
                version precedente se cachait dans ce cas, et un solde bloque
                sous le minimum ressemblait alors a une retenue inexpliquee. */}
            {payoutMin > 0 && (
              <div className="bg-white rounded-xl border border-ash p-5" data-testid="payout-estimate">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                  {L("VOTRE PROCHAIN VERSEMENT", "YOUR NEXT PAYOUT")}
                </p>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-display text-2xl font-bold text-nordfjord tabular-nums">
                    {money(dueNow)}
                    <span className="text-sm font-medium text-glacier ml-1.5">
                      {L(`sur ${money(payoutMin)} requis`, `of ${money(payoutMin)} required`)}
                    </span>
                  </p>
                  {/* Jeton de conversion, TOUJOURS visible dès que le taux est
                      connu — y compris à zéro. C'est justement avant le premier
                      versement qu'on doit comprendre qu'on sera payé dans une
                      autre devise ; le conditionner au solde le faisait
                      disparaître exactement pour qui l'ignorait encore.
                      Sa couleur le distingue des montants en dollars canadiens
                      qui l'entourent : trois « $ » de suite sur un écran, dont
                      un qui n'est pas la même monnaie, se confondent. */}
                  {data?.fx_rate_cad_to_usd > 0 && (
                    <span className="font-data text-[12px] tabular-nums rounded-lg px-2.5 py-1.5
                                     border whitespace-nowrap"
                          data-testid="payout-conversion"
                          style={{
                            color: "#7C5CD6",
                            background: "rgba(124,92,214,.09)",
                            borderColor: "rgba(124,92,214,.28)",
                          }}>
                      ≈ {(dueNow * Number(data.fx_rate_cad_to_usd)).toFixed(2)}
                      <span className="uppercase ml-1">{data.payout_currency || "usdt"}</span>
                    </span>
                  )}
                </div>
                <div className="h-3 rounded-full bg-ash overflow-hidden mt-2">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${payoutPct || 0}%`, background: "#00B8D4" }} />
                </div>

                {/* Le parcours complet de l'argent. Ce panneau n'affichait que
                    le montant validé, sans dire d'où il venait ni où il allait :
                    on ne pouvait pas savoir, d'ici, ce qu'on avait gagné en
                    tout. Il fallait remonter à la rangée d'indicateurs et
                    additionner soi-même trois cases qui ne se présentaient pas
                    comme les étapes d'une même somme. Les voici dans l'ordre où
                    l'argent les traverse. */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-ash">
                  {[
                    [L("En attente", "Pending"), data?.pending_commission,
                     L(`validé après ${data?.approval_hold_days ?? 7} j`,
                       `validated after ${data?.approval_hold_days ?? 7}d`)],
                    [L("Validé", "Validated"), dueNow,
                     L("part au prochain cycle", "goes out next cycle")],
                    [L("Déjà versé", "Already paid"), data?.paid_commission,
                     L("depuis le début", "since the start")],
                  ].map(([titre, valeur, note], i) => (
                    <div key={i} data-testid={`payout-flow-${i}`}>
                      <p className="font-data text-[10px] uppercase tracking-[0.14em] text-glacier">
                        {titre}
                      </p>
                      <p className={`font-data text-sm font-bold tabular-nums mt-0.5 ${
                        Number(valeur) > 0 ? "text-nordfjord" : "text-glacier/45"}`}>
                        {money(valeur)}
                      </p>
                      <p className="font-data text-[10px] text-glacier/70 leading-tight mt-0.5">
                        {note}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="font-data text-[11px] text-glacier mt-3">
                  {dueNow >= payoutMin
                    ? L("Seuil atteint — le versement part au prochain cycle mensuel.",
                        "Threshold met — the payout goes out at the next monthly cycle.")
                    : L("Rien n'est perdu sous le seuil : vos commissions restent à votre crédit et s'ajoutent au mois suivant.",
                        "Nothing is lost below the threshold: your commissions stay to your credit and carry over.")}
                </p>
                {/* La conversion s'affiche meme a solde nul. Elle ne servait
                    d'abord qu'a chiffrer un montant ; c'est en realite une
                    information de devise, et c'est AVANT le premier versement
                    qu'elle evite le malentendu — voir « 250 $ » puis recevoir
                    180 USDT ressemble a une retenue. La conditionner au solde
                    la faisait disparaitre pour qui n'a encore rien gagne. */}
                {/* La DEVISE vient du choix de l'affilie (payout_currency,
                    USDT ou USDC) et s'enonce toujours. Le TAUX vient de la
                    Banque du Canada et peut manquer : affiliate_me() l'omet
                    silencieusement si l'API est indisponible. Les lier ferait
                    disparaitre l'information de devise lors d'une panne
                    exterieure, alors qu'elle n'en depend pas. */}
                <p className="font-data text-[11px] text-glacier mt-1">
                  {L("Vos commissions sont calculées en CAD et versées en ",
                     "Your commissions are calculated in CAD and paid in ")}
                  <span className="uppercase">{data?.payout_currency || "usdt"}</span>
                  {data?.fx_rate_cad_to_usd > 0 ? (
                    <>
                      {dueNow > 0
                        ? <>{" · "}{money(dueNow)} CAD × {Number(data.fx_rate_cad_to_usd).toFixed(4)}</>
                        : <>{" · 1 CAD ≈ "}{Number(data.fx_rate_cad_to_usd).toFixed(4)}</>}
                      {" — "}
                      {L("taux de la Banque du Canada. Le taux définitif sera celui du jour du versement.",
                         "Bank of Canada rate. The final rate is the one on payout day.")}
                    </>
                  ) : (
                    L(" — au taux officiel de la Banque du Canada le jour du versement.",
                      " — at the official Bank of Canada rate on payout day.")
                  )}
                </p>
              </div>
            )}

            {/* Insights secondaires : clics / conversion / commandes / panier */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniInsight label={L("Clics sur votre lien", "Clicks on your link")} value={insights?.clicks != null ? insights.clicks.toLocaleString("en-CA") : "—"} />
              <MiniInsight label={L("Taux de conversion", "Conversion rate")} value={insights?.conversion_rate != null ? `${(insights.conversion_rate * 100).toFixed(1)}%` : "—"} />
              <MiniInsight label={L("Commandes validées", "Validated orders")} value={insights?.validated_orders != null ? insights.validated_orders.toLocaleString("en-CA") : "—"} />
              <MiniInsight label={L("Panier moyen", "Avg order")} value={money(insights?.avg_order_value)} />
            </div>

            {/* Palier. Un palier fixe par l'administration ne bouge pas avec le
                chiffre d'affaires : afficher « encore 3 465 $ pour Silver »
                serait une promesse fausse, puisque franchir ce seuil ne
                changerait rien — manual_tier l'emporte sur le palier calcule. */}
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {data?.tier_agreement
                  ? L("VOTRE TAUX CONVENU", "YOUR AGREED RATE")
                  : L("PROGRESSION DE PALIER", "TIER PROGRESSION")}
              </p>
              {data?.tier_agreement ? (
                <>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <TierMark tier={data?.tier} color={tierColor} size={28} />
                    <span className="font-display text-2xl font-bold text-nordfjord">{tierLabel}</span>
                    <span className="font-data text-sm font-semibold" style={{ color: tierColor }}>
                      {Math.round((data?.commission_rate || 0) * 100)} %
                    </span>
                  </div>
                  <p className="text-sm text-glacier mt-2">
                    {L("Ce taux fait l'objet d'une entente entre vous et FIRONOVA. Il ne varie pas avec votre volume de ventes et ne baisse jamais automatiquement. Toute modification ferait l'objet d'un avis préalable.",
                       "This rate is the subject of an agreement between you and FIRONOVA. It does not vary with your sales volume and never decreases automatically. Any change would be preceded by notice.")}
                  </p>
                </>
              ) : data?.next_tier ? (
                <>
                  <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                    <span className="inline-flex items-center gap-2.5">
                      <TierMark tier={data?.tier} color={tierColor} size={28} />
                      <span className="font-display text-2xl font-bold text-nordfjord">{tierLabel}</span>
                    </span>
                    <span className="font-data text-xs text-glacier">
                      {L("Encore", "Still")} {money(data.remaining_to_next)} {L("pour", "to reach")} {TIER_META[data.next_tier.tier]?.[lang] || data.next_tier.tier} ({Math.round(data.next_tier.rate * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-ash overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${progress || 0}%`, background: "#00B8D4" }} />
                  </div>
                  <p className="font-data text-[11px] text-glacier mt-2">{progress || 0}%</p>
                </>
              ) : (
                <p className="font-display text-2xl font-bold text-nordfjord">
                  🏆 {L("Palier maximal atteint", "Top tier reached")} — {tierLabel}
                </p>
              )}
            </div>

            {/* Fenetre glissante de 12 mois — c'est elle qui fixe le palier.
                Remplace l'ancienne carte « securisez votre palier », qui
                annoncait une retrogradation trimestrielle desormais supprimee. */}
            {data?.rolling12_revenue != null && (
              <div className="bg-white rounded-xl border border-ash p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                      {L("VOS 12 DERNIERS MOIS", "YOUR LAST 12 MONTHS")}
                    </p>
                    <p className="font-display text-2xl font-bold text-nordfjord tabular-nums">
                      {money(data.rolling12_revenue)}
                      {data.next_tier && !data.tier_agreement && (
                        <span className="text-sm font-medium text-glacier">
                          {" / "}{money(data.next_tier.floor)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {data.next_tier && !data.tier_agreement && (
                  <div className="h-3 rounded-full bg-ash overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${Math.min(100, Math.round((data.progress_to_next || 0) * 100))}%`,
                                  background: "#00B8D4" }} />
                  </div>
                )}
                {!data.tier_agreement && (
                  <p className="font-data text-[11px] text-glacier mt-2">
                    {data.next_tier ? (
                      <>{L("Encore ", "Still ")}{money(data.remaining_to_next)}
                        {L(" de ventes validees pour atteindre ", " in validated sales to reach ")}
                        {TIER_META[data.next_tier.tier]?.[lang] || data.next_tier.tier}
                        {" ("}{Math.round(data.next_tier.rate * 100)} %{")."}
                      </>
                    ) : (
                      L("Palier maximal atteint.", "Top tier reached.")
                    )}
                  </p>
                )}
                <p className="font-data text-[11px] text-glacier mt-1">
                  {data.tier_agreement
                    ? L("Chiffre indicatif : votre taux étant convenu par entente, ce total ne le modifie pas.",
                        "For information only: your rate being set by agreement, this total does not change it.")
                    : L("Votre taux suit ce total : il monte quand vos ventes montent, et redescend progressivement si elles ralentissent.",
                        "Your rate follows this total: it rises as your sales rise, and eases down gradually if they slow.")}
                </p>
              </div>
            )}

            {/* Échelle des paliers et simulateur. Masquée sous entente : le
                barème ne s'applique pas à ces comptes, leur montrer une échelle
                qu'ils ne gravissent pas serait une fausse promesse — et cela
                révélerait au passage qu'un autre régime existe. */}
            {!data?.tier_agreement && (
              <TierLadder data={data} L={L} lang={lang} money={money} TIER_META={TIER_META} />
            )}

            {/* Activité récente */}
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("ACTIVITÉ RÉCENTE", "RECENT ACTIVITY")}
              </p>
              {activity.length === 0 ? (
                <p className="text-glacier text-sm py-6 text-center">
                  {L("Aucune activité pour l'instant.", "No activity yet.")}
                </p>
              ) : (
                <div className="space-y-1">
                  {activity.slice(0, 8).map((e, i) => (
                    <ActivityRow key={i} e={e} L={L} lang={lang} money={money} fmtDateTime={fmtDateTime} />
                  ))}
                </div>
              )}
            </div>

            {/* Referral link */}
            <div className="bg-white rounded-xl border border-ash p-6"
                 data-testid="affiliate-link-panel">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("VOTRE LIEN ET VOTRE CODE", "YOUR LINK AND CODE")}
              </p>

              {/* Le CODE, en premier et en grand. Il ne figurait que dans les
                  Paramètres, alors que c'est lui qu'on donne de vive voix ou
                  dans un message — et les conditions imposent précisément la
                  communication privée. Le lien vient après : il sert quand on
                  peut écrire une adresse cliquable, ce qui est le cas le moins
                  fréquent depuis cette règle.
                  Sa propre copie, car on ne partage pas les deux ensemble. */}
              <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-ash">
                <span className="font-data text-[10px] uppercase tracking-[0.18em] text-glacier">
                  {L("Code", "Code")}
                </span>
                <code className="font-data text-lg font-bold text-nordfjord tracking-[0.08em]
                                 bg-clinical rounded-lg px-4 py-2 border border-ash"
                      data-testid="affiliate-ref-code">
                  {refCode || "—"}
                </code>
                {refCode && (
                  <button onClick={copyCode} data-testid="affiliate-copy-code"
                    className="px-4 py-2 rounded-full border border-ash text-nordfjord font-data
                               text-xs font-bold uppercase tracking-wider hover:border-nova transition">
                    {codeCopie ? L("Copié ✓", "Copied ✓") : L("Copier le code", "Copy code")}
                  </button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="flex-1 min-w-[240px] font-data text-sm text-nordfjord bg-clinical rounded-lg px-4 py-3 border border-ash break-all">
                      {refLink}
                    </code>
                    <button onClick={copyLink} data-testid="affiliate-copy-link"
                            className="px-5 py-3 rounded-full bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition">
                      {copied ? L("Copié ✓", "Copied ✓") : L("Copier", "Copy")}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={() => share("whatsapp")} title={L("WhatsApp", "WhatsApp")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <MessageCircle size={14} className="text-success" /> WhatsApp
                    </button>
                    <button onClick={() => share("telegram")} title={L("Telegram", "Telegram")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <Send size={14} className="text-nova" /> Telegram
                    </button>
                    <button onClick={() => share("email")} title={L("Email", "Email")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                      <Mail size={14} className="text-nordfjord" /> Email
                    </button>
                  </div>
                </div>
                {refLink && (
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="bg-white border border-ash rounded-xl p-3">
                      <QRCodeSVG value={refLink} size={120} level="M" fgColor="#0B2E4F" />
                    </div>
                    <p className="font-data text-[10px] uppercase tracking-wider text-glacier">
                      {L("Scanner pour partager", "Scan to share")}
                    </p>
                  </div>
                )}
              </div>
              <p className="font-data text-[11px] text-glacier mt-3 leading-relaxed">
                {L(
                  "Communication privée uniquement — ne partagez jamais ce lien via des publications, vidéos ou forums publics.",
                  "Private communication only — never share this link through public posts, videos, or forums."
                )}
              </p>
            </div>

            {/* Top products share widget */}
            {topProducts.length > 0 && (refCode || "").length > 0 && (
              <div className="bg-white rounded-xl border border-ash p-6" data-testid="affiliate-share-widget">
                <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                  <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                    {personalTop
                      ? L("VOS MEILLEURS PRODUITS", "YOUR BEST-SELLING PRODUCTS")
                      : L("PRODUITS À METTRE EN AVANT", "PRODUCTS TO PROMOTE")}
                  </p>
                  <p className="font-data text-[10px] text-glacier">
                    {personalTop
                      ? L("Classés par revenu généré grâce à votre code",
                          "Ranked by revenue generated through your code")
                      : L("1 clic = attribution automatique à votre code",
                          "1 click = auto-attributed to your code")}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {topProducts.map((p, idx) => (
                    <div key={p.slug}
                      className="rounded-xl border border-ash bg-clinical p-4 flex flex-col"
                      data-testid={`share-product-${p.slug}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {personalTop && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-nova text-white font-data text-[10px] font-bold shrink-0">
                                {idx + 1}
                              </span>
                            )}
                            <p className="font-display text-[15px] font-bold text-nordfjord leading-tight truncate">
                              {lang === "fr" ? p.name_fr : p.name_en}
                            </p>
                          </div>
                          <p className="font-data text-[10px] uppercase tracking-[0.16em] text-glacier">
                            {personalTop
                              ? `${p.qty || 0} ${
                                  (p.qty || 0) === 1
                                    ? L("unité", "unit")
                                    : L("unités", "units")
                                } · ${money(p.revenue)}`
                              : (p.category || "peptide")}
                          </p>
                        </div>
                      </div>
                      <code className="font-data text-[10px] text-nordfjord bg-white rounded-md px-2 py-1.5 border border-ash break-all mb-3 min-h-[3.4em]">
                        /product/{p.slug}?ref={refCode}
                      </code>
                      <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => copyProduct(p.slug)}
                          data-testid={`share-copy-${p.slug}`}
                          className="flex-1 px-3 py-2 rounded-lg bg-nova text-nordfjord font-data text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition">
                          {L("Copier", "Copy")}
                        </button>
                        <button onClick={() => shareProduct(p.slug, "whatsapp")}
                          data-testid={`share-whatsapp-${p.slug}`}
                          title="WhatsApp"
                          className="p-2 rounded-lg border border-ash hover:bg-white transition">
                          <MessageCircle size={13} className="text-success" />
                        </button>
                        <button onClick={() => shareProduct(p.slug, "telegram")}
                          data-testid={`share-telegram-${p.slug}`}
                          title="Telegram"
                          className="p-2 rounded-lg border border-ash hover:bg-white transition">
                          <Send size={13} className="text-nova" />
                        </button>
                        <button onClick={() => shareProduct(p.slug, "email")}
                          data-testid={`share-email-${p.slug}`}
                          title="Email"
                          className="p-2 rounded-lg border border-ash hover:bg-white transition">
                          <Mail size={13} className="text-nordfjord" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="font-data text-[10px] text-glacier mt-3 leading-relaxed">
                  {personalTop
                    ? L("Ces produits ont déjà convaincu votre audience. Un rappel bien placé peut relancer les ventes.",
                        "These products already resonate with your audience. A well-timed reminder can drive repeat sales.")
                    : L("Astuce : ces liens produits convertissent 3-5× mieux que le lien home, car ils atterrissent directement sur un composé précis.",
                        "Tip: product links convert 3-5× better than the home link because they land directly on a specific compound.")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* PERFORMANCE */}
        {tab === "performance" && (
          <div className="space-y-6" data-testid="affiliate-performance">
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
                {L("REVENU VALIDÉ — 12 DERNIERS MOIS", "VALIDATED REVENUE — LAST 12 MONTHS")}
              </p>
              {series.length === 0 ? (
                <p className="text-glacier text-sm py-12 text-center">
                  {L("Aucune donnée pour l'instant.", "No data yet.")}
                </p>
              ) : (
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={couleursGraphique.grille} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: couleursGraphique.axe }} />
                      <YAxis tick={{ fontSize: 11, fill: couleursGraphique.axe }} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="revenue" name={L("CA validé", "Revenue")} stroke="#0B2E4F" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="commission" name={L("Commissions", "Commissions")} stroke="#00B8D4" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {L("SOURCES DE VOS CLICS", "WHERE YOUR CLICKS COME FROM")}
              </p>
              <p className="font-data text-[11px] text-glacier mb-4">
                {L("Derniers 30 jours — pages d'atterrissage, référents et appareils.",
                   "Last 30 days — landing pages, referrers and devices.")}
              </p>
              {!sources || sources.total_clicks === 0 ? (
                <p className="text-glacier text-sm py-8 text-center">
                  {L("Aucun clic enregistré pour l'instant.", "No clicks recorded yet.")}
                </p>
              ) : (
                <SourcesGrid sources={sources} L={L} lang={lang} />
              )}
            </div>

            <div className="bg-white rounded-xl border border-ash overflow-hidden">
              <div className="px-6 py-4 border-b border-ash flex items-center justify-between">
                <div>
                  <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                    {L("VOS CLIENTS RATTACHÉS", "YOUR ATTACHED CUSTOMERS")}
                  </p>
                  <p className="font-data text-[10px] text-glacier mt-0.5">
                    {L(
                      "Rattachement à vie : toute commande future de ces clients vous est attribuée, avec ou sans code.",
                      "Lifetime attachment: every future order from these customers is attributed to you, with or without a code."
                    )}
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-clinical text-nordfjord text-xs font-medium" data-testid="attached-customers-count">
                  {customers.length}
                </span>
              </div>
              {customers.length === 0 ? (
                <div className="p-8 text-center text-glacier text-sm" data-testid="attached-customers-empty">
                  {L(
                    "Aucun client rattaché pour l'instant. Partagez votre lien ou votre code pour amener votre premier client.",
                    "No attached customers yet. Share your link or code to bring in your first customer."
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="attached-customers-table">
                    <thead>
                      <tr className="border-b border-ash text-glacier font-data text-[10px] uppercase tracking-[0.2em]">
                        <th className="text-left px-6 py-3">{L("Client", "Customer")}</th>
                        <th className="text-left px-4 py-3">{L("Rattaché le", "Attached")}</th>
                        <th className="text-left px-4 py-3">{L("Source", "Source")}</th>
                        <th className="text-right px-4 py-3">{L("Cmdes", "Orders")}</th>
                        <th className="text-right px-4 py-3">{L("CA validé", "Revenue")}</th>
                        <th className="text-right px-4 py-3">{L("Commissions", "Commissions")}</th>
                        <th className="text-left px-4 py-3">{L("Dernière", "Last")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr key={c.email} className="border-b border-ash/60 hover:bg-clinical/40"
                            data-testid={`attached-customer-${c.email}`}>
                          <td className="px-6 py-3">
                            <div className="font-medium text-nordfjord truncate max-w-[240px]">
                              {maskEmail(c.email)}
                            </div>
                            {c.has_account && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-data text-nova mt-0.5">
                                ✓ {L("compte lié", "linked account")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-data text-xs text-glacier">
                            {c.bound_at ? new Date(c.bound_at).toLocaleDateString(lang) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-data uppercase tracking-wider bg-clinical text-nordfjord">
                              {c.source === "click" ? L("lien", "link")
                                : c.source === "code" ? L("code", "code")
                                : c.source === "binding" ? L("récurrent", "returning")
                                : c.source === "backfill" || c.source === "backfill_pass2" ? L("historique", "backfill")
                                : (c.source || "—")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-data font-semibold">{c.orders_count || 0}</td>
                          <td className="px-4 py-3 text-right font-data">{money(c.revenue_validated || 0)}</td>
                          <td className="px-4 py-3 text-right font-data font-semibold text-nova">
                            {money(c.commission_validated || 0)}
                          </td>
                          <td className="px-4 py-3 font-data text-xs text-glacier">
                            {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString(lang) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-ash overflow-hidden">
              <div className="px-6 py-4 border-b border-ash flex items-center justify-between">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                  {L("COMMANDES VALIDÉES", "VALIDATED ORDERS")}
                </p>
                <button onClick={exportReferrals}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
              </div>
              <ReferralTable rows={refPageRows} lang={lang} L={L} money={money} />
              <Pagination page={refPage} total={referrals.length} pageSize={PAGE_SIZE}
                onChange={setRefPage} L={L} />
            </div>
          </div>
        )}

        {/* PAYMENTS */}
        {tab === "payments" && (
          <div className="space-y-6" data-testid="affiliate-payments">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Devise explicite. Ces trois montants sont en CAD alors que le
                  versement part en USDT/USDC : sans etiquette, trois « \$ » sur
                  un ecran de paiements crypto ne disent pas lesquels. */}
              <KpiCard label={L("En attente", "Pending")} value={money(data?.pending_commission)} sub="CAD" />
              <KpiCard label={L("Approuvé", "Approved")} value={money(data?.approved_commission)} sub="CAD" />
              <KpiCard label={L("Payé", "Paid")} value={money(data?.paid_commission)} sub="CAD" accent />
            </div>
            <div className="bg-white rounded-xl border border-ash overflow-hidden">
              <div className="px-6 py-4 border-b border-ash flex items-center justify-between">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                  {L("HISTORIQUE DES PAIEMENTS", "PAYMENT HISTORY")}
                </p>
                <button onClick={exportPayouts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ash text-xs text-nordfjord hover:bg-clinical transition">
                  <Download size={13} /> CSV
                </button>
              </div>
              {payouts.length === 0 ? (
                /* L'explication de la conversion vivait dans la branche « il y a
                   des versements », donc invisible tant qu'il n'y en avait
                   aucun — precisement quand l'affilie ignore encore comment il
                   sera paye. Un ecran vide ne doit pas etre un ecran muet. */
                <div className="py-10 px-6 max-w-xl mx-auto text-center">
                  <p className="text-glacier text-sm">
                    {L("Aucun paiement pour l'instant.", "No payments yet.")}
                  </p>
                  <dl className="mt-5 text-left space-y-2.5 font-data text-[12px]">
                    <div className="flex justify-between gap-4 border-b border-ash/60 pb-2">
                      <dt className="text-glacier">{L("Seuil minimum", "Minimum threshold")}</dt>
                      <dd className="text-nordfjord font-semibold">
                        {data?.payout_min_cad != null ? `${money(data.payout_min_cad)} CAD` : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-ash/60 pb-2">
                      <dt className="text-glacier">{L("Vous serez payé en", "You will be paid in")}</dt>
                      <dd className="text-nordfjord font-semibold uppercase">
                        {data?.payout_currency || "usdt"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-ash/60 pb-2">
                      <dt className="text-glacier">{L("Taux du jour", "Today's rate")}</dt>
                      <dd className="text-nordfjord font-semibold">
                        {data?.fx_rate_cad_to_usd > 0
                          ? `1 CAD ≈ ${Number(data.fx_rate_cad_to_usd).toFixed(4)}`
                          : L("indisponible", "unavailable")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-glacier">{L("Rythme", "Cadence")}</dt>
                      <dd className="text-nordfjord font-semibold">{L("Mensuel", "Monthly")}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 font-data text-[10px] text-glacier/80 leading-relaxed text-left">
                    {L("Sous le seuil, rien n'est perdu : vos commissions restent à votre crédit et s'ajoutent au mois suivant. La conversion utilise le taux officiel de la Banque du Canada le jour du versement, et les frais de réseau sont déduits du montant envoyé.",
                       "Below the threshold nothing is lost: your commissions stay to your credit and carry over. Conversion uses the official Bank of Canada rate on payout day, and network fees are deducted from the amount sent.")}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left font-data text-[11px] uppercase tracking-wider text-glacier border-b border-ash">
                          <th className="px-6 py-3">{L("Période", "Period")}</th>
                          <th className="px-6 py-3">{L("Montant CAD", "Amount CAD")}</th>
                          <th className="px-6 py-3">{L("Taux CAD→USD", "CAD→USD rate")}</th>
                          <th className="px-6 py-3">{L("Reçu", "Received")}</th>
                          <th className="px-6 py-3">{L("Statut", "Status")}</th>
                          <th className="px-6 py-3">{L("Référence", "Reference")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payPageRows.map((p) => {
                          // Fallback pour les payouts legacy sans champs de conversion.
                          const amountCad = p.amount_cad ?? p.amount;
                          const fxRate = p.fx_rate_cad_to_usd;
                          const currency = (p.currency || "").toLowerCase();
                          const targetKnown = ["usdt", "usdc"].includes(currency);
                          return (
                            <tr key={p.id} className="border-b border-ash/60">
                              <td className="px-6 py-3 font-data text-nordfjord align-top">{p.period}</td>
                              <td className="px-6 py-3 font-semibold text-nordfjord align-top">
                                {money(amountCad)}
                              </td>
                              <td className="px-6 py-3 font-data text-[12px] text-glacier align-top">
                                {fxRate
                                  ? (
                                    <>
                                      <span className="text-nordfjord">{Number(fxRate).toFixed(4)}</span>
                                      <span className="block text-[10px] text-glacier/70">
                                        {p.fx_source === "bank_of_canada"
                                          ? L("Banque du Canada", "Bank of Canada")
                                          : p.fx_source === "fallback"
                                            ? L("Estimation", "Fallback")
                                            : p.fx_source || "—"}
                                      </span>
                                    </>
                                  )
                                  : <span className="text-glacier/50">—</span>}
                              </td>
                              <td className="px-6 py-3 font-semibold text-nova align-top">
                                {targetKnown && p.amount != null
                                  ? <>{Number(p.amount).toFixed(2)}<span className="ml-1 text-[10px] uppercase text-glacier">{currency}</span></>
                                  : <span className="text-glacier">{money(p.amount)} {currency ? <span className="text-[10px] uppercase">{currency}</span> : null}</span>}
                              </td>
                              <td className="px-6 py-3 align-top">
                                <PayoutStatus status={p.status} L={L} />
                              </td>
                              <td className="px-6 py-3 font-data text-[11px] text-glacier break-all max-w-[200px] align-top">
                                {p.reference || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-6 pt-4 pb-1 font-data text-[10px] text-glacier/80 leading-relaxed border-t border-ash/60">
                    {/* Ne dit plus « indexés 1:1 » : c'est précisément
                        l'hypothèse que le calcul a cessé de faire. USDC est
                        tombé à 0,87 en mars 2023. La quantité de jetons
                        s'ajuste désormais au prix réel, et le texte doit le
                        dire — sinon un affilié qui compte ses jetons trouve un
                        écart avec ce qu'on lui a écrit. */}
                    {L("Les commissions sont calculées en CAD, converties en USD au taux officiel de la Banque du Canada le jour du versement, puis payées en jetons. Si le jeton s'écarte du dollar américain, la quantité envoyée est ajustée pour que vous receviez bien le montant dû.",
                       "Commissions are computed in CAD, converted to USD at the Bank of Canada official rate on payout day, then paid in tokens. If the token drifts from the US dollar, the quantity sent is adjusted so you receive the amount owed.")}
                  </p>
                  <Pagination page={payPage} total={payouts.length} pageSize={PAGE_SIZE}
                    onChange={setPayPage} L={L} />
                </>
              )}
            </div>
          </div>
        )}

        {/* COMPLIANCE */}
        {tab === "compliance" && (
          <div className="space-y-6" data-testid="affiliate-compliance">
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("STATUT DE CONFORMITÉ", "COMPLIANCE STATUS")}
              </p>
              <span className={`inline-flex px-3 py-1.5 rounded-full font-data text-xs font-semibold ${comp.cls}`}>
                {comp.dot} {comp[lang]}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
                {L("DIRECTIVES DE CONFORMITÉ", "COMPLIANCE GUIDELINES")}
              </p>
              <ul className="space-y-3 text-sm text-nordfjord">
                <ComplianceItem
                  title={L("Communication privée uniquement", "Private communication only")}
                  body={L("Partagez l'information en privé, jamais via des publications, vidéos ou forums publics.",
                    "Share information privately, never through public posts, videos, or forums.")} />
                <ComplianceItem
                  title={L("Aucune allégation d'usage humain", "No human-use claims")}
                  body={L("Ne mentionnez jamais de dosage, injection, cycles ou effets physiologiques.",
                    "Never mention dosage, injection, cycles, or physiological effects.")} />
                <ComplianceItem
                  title={L("Respect de la finalité scientifique", "Respect scientific purpose")}
                  body={L("Les produits Fironova sont destinés à la recherche uniquement (RUO).",
                    "Fironova products are for research use only (RUO).")} />
                <ComplianceItem
                  title={L("Conduite professionnelle", "Professional conduct")}
                  body={L("Maintenez des standards éthiques dans toutes vos interactions.",
                    "Uphold ethical standards in all interactions.")} />
              </ul>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div className="space-y-6 max-w-xl" data-testid="affiliate-settings">
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {L("PARAMÈTRES DE PAIEMENT — USDT / USDC", "PAYOUT SETTINGS — USDT / USDC")}
              </p>
              <p className="text-xs text-glacier mb-5 leading-relaxed">
                {L("Fironova verse vos commissions en USDT ou USDC, sur Ethereum (ERC-20) ou Tron (TRC-20) selon l'adresse que vous indiquez. Le montant est converti à partir du CAD au taux officiel de la Banque du Canada le jour de l'exécution du paiement. Les frais de réseau sont déduits du versement — ils sont nettement plus faibles sur Tron.",
                   "Fironova pays your commissions in USDT or USDC, on Ethereum (ERC-20) or Tron (TRC-20) depending on the address you provide. Amounts are converted from CAD at the official Bank of Canada rate on the payout date. Network fees are deducted from the payout — they are markedly lower on Tron.")}
              </p>
              <label className="block mb-4">
                <span className="font-data text-xs text-glacier">{L("Adresse de versement (ERC-20 ou TRC-20)", "Payout address (ERC-20 or TRC-20)")}</span>
                <input value={payAddr} onChange={(e) => setPayAddr(e.target.value)}
                  data-testid="affiliate-payout-address"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none"
                  placeholder={L("0x… (Ethereum) ou T… (Tron)", "0x… (Ethereum) or T… (Tron)")} />
                {(() => {
                  // Le backend accepte ERC-20 ET TRC-20 ; cette validation
                  // client ne connaissait que l'Ethereum et refusait donc une
                  // adresse Tron parfaitement valide, sans que l'affilie
                  // comprenne pourquoi.
                  const raw = (payAddr || "").trim();
                  if (!raw) return null;
                  const isErc = /^0x[0-9a-fA-F]{40}$/.test(raw);
                  const isTrc = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw);
                  if (!isErc && !isTrc) {
                    return (
                      <p className="mt-1.5 text-[11px] text-error">
                        {L("Format invalide. Attendu : 0x + 40 caractères hexadécimaux (ERC-20), ou T + 33 caractères (TRC-20).",
                           "Invalid format. Expected: 0x + 40 hex characters (ERC-20), or T + 33 characters (TRC-20).")}
                      </p>
                    );
                  }
                  if (isTrc) {
                    // Tron n'est ouvert qu'a l'USDT : la table de routage des
                    // versements (NOWPAYMENTS_PAYOUT_CURRENCY) ne contient pas
                    // encore usdc+trc20, et une combinaison absente est ignoree
                    // plutot qu'envoyee au hasard. Le dire ICI evite a l'affilie
                    // d'attendre un versement qui ne partira jamais.
                    if (payCur === "usdc") {
                      return (
                        <p className="mt-1.5 text-[11px] text-error">
                          {L("Adresse Tron valide, mais l'USDC n'est versé que sur Ethereum. Choisissez USDT pour utiliser cette adresse, ou indiquez une adresse Ethereum (0x…).",
                             "Valid Tron address, but USDC is only paid on Ethereum. Choose USDT to use this address, or provide an Ethereum address (0x…).")}
                        </p>
                      );
                    }
                    return (
                      <p className="mt-1.5 text-[11px] text-success">
                        {L("✓ Adresse Tron (TRC-20) — frais de réseau plus faibles.",
                           "✓ Tron address (TRC-20) — lower network fees.")}
                      </p>
                    );
                  }
                  // Preview checksum EIP-55 (approximation client — le serveur valide définitivement).
                  const body = raw.slice(2);
                  const isChecksummed = body !== body.toLowerCase() && body !== body.toUpperCase();
                  return (
                    <p className={`mt-1.5 text-[11px] ${isChecksummed ? "text-success" : "text-warning"}`}>
                      {isChecksummed
                        ? L("✓ Adresse Ethereum checksummée — vérification EIP-55 à l'enregistrement.",
                            "✓ Checksummed Ethereum address — EIP-55 verification on save.")
                        : L("Adresse en minuscules acceptée : le serveur la convertira au format EIP-55.",
                            "Lowercase address accepted: server will normalize to EIP-55.")}
                    </p>
                  );
                })()}
              </label>
              <label className="block mb-6">
                <span className="font-data text-xs text-glacier">{L("Devise", "Currency")}</span>
                <select value={payCur} onChange={(e) => setPayCur(e.target.value)}
                  data-testid="affiliate-payout-currency"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none">
                  {/* Sans mention de reseau : celui-ci est deduit de l'adresse
                      saisie, pas choisi ici. Annoncer « Ethereum ERC-20 » dans
                      ce menu contredisait le champ adresse juste au-dessus, qui
                      accepte aussi une adresse Tron. */}
                  <option value="usdt">USDT (Tether)</option>
                  <option value="usdc">USDC (Circle)</option>
                </select>
              </label>
              <button onClick={savePayout} disabled={savingPay}
                data-testid="affiliate-save-payout"
                className="px-6 py-3 rounded-full bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition disabled:opacity-50">
                {savingPay ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
              </button>
              {/* Tron RETIRE de la liste des reseaux interdits : le backend
                  l'accepte (_detect_payout_network renvoie 'trc20') et propage
                  le reseau au CSV NOWPayments. Le meme ecran confirmait plus
                  haut « ✓ Adresse Tron (TRC-20) — frais plus faibles » tout en
                  annoncant ici une perte definitive sur Tron : contradiction
                  dangereuse, susceptible de faire remplacer une adresse
                  parfaitement valide. Le reseau est deduit de l'adresse, pas
                  choisi separement — il n'y a donc rien a accorder. */}
              <p className="text-[10px] text-glacier/80 mt-4 leading-relaxed">
                {L("⚠️ Deux réseaux sont acceptés : Ethereum (adresse 0x…) et Tron (adresse T…). Envoyer sur tout autre réseau — BSC, Polygon, Solana — entraînera une perte définitive des fonds.",
                   "⚠️ Two networks are accepted: Ethereum (0x… address) and Tron (T… address). Sending on any other network — BSC, Polygon, Solana — will result in permanent loss.")}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-2">
                {L("COMPTE", "ACCOUNT")}
              </p>
              {/* Ici, contrairement à l'accueil, le nom COMPLET : c'est une
                  fiche de compte, pas une salutation. L'entreprise s'y ajoute
                  parce que c'est elle qui figurera sur les versements. */}
              <p className="text-sm text-nordfjord">
                {[data?.first_name, data?.last_name].filter(Boolean).join(" ") || user?.name}
              </p>
              {data?.company && (
                <p className="text-xs text-glacier">{data.company}</p>
              )}
              <p className="font-data text-xs text-glacier">{user?.email}</p>
              <p className="font-data text-xs text-glacier mt-2">
                {L("Code de parrainage", "Referral code")} : <span className="text-nordfjord font-semibold">{refCode}</span>
              </p>
            </div>
          </div>
        )}

        {tab === "support" && <AffiliateSupport L={L} lang={lang} />}
      </div>
    </div>
  );
}

/** Acceptation des conditions du programme, bloquante au premier accès et à
 *  chaque révision du texte. Les trois cases sont distinctes et toutes
 *  requises : une case unique « j'accepte tout » ne prouverait pas que la
 *  personne a lu l'engagement sur l'usage recherche, qui est celui qui vous
 *  expose réellement. */
/** Une case à cocher, définie AU NIVEAU DU MODULE et non dans le composant.
 *
 *  Déclarée à l'intérieur, elle devenait une nouvelle fonction à chaque rendu :
 *  React y voyait un composant d'un type différent, démontait puis remontait
 *  la case, et l'interaction était détruite à l'instant même où elle se
 *  produisait. Les cases paraissaient alors ne pas répondre au clic.
 */
function Case({ on, set, children, test, disabled, raison }) {
  return (
    <label className={`flex items-start gap-3 group ${
      disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <input type="checkbox" checked={on} disabled={disabled}
             onChange={(e) => set(e.target.checked)}
             data-testid={test} className="mt-1 w-4 h-4 accent-nova shrink-0" />
      <span className={`text-sm leading-snug ${disabled ? "text-glacier" : "text-nordfjord"}`}>
        {children}
        {disabled && raison && (
          <span className="block text-[11px] text-nova mt-0.5">{raison}</span>
        )}
      </span>
    </label>
  );
}

function AffiliateTermsGate({ L, lang, onDone, dejaAccepte }) {
  const [terms, setTerms] = useState(false);
  const [age, setAge] = useState(false);
  const [research, setResearch] = useState(false);
  const [busy, setBusy] = useState(false);
  // « J'ai lu » ne doit pas pouvoir être coché sans avoir ouvert le texte. On
  // ne peut évidemment pas vérifier qu'il a été LU — mais on peut refuser
  // l'affirmation à qui n'a même pas ouvert la page, et c'est déjà la
  // différence entre une case cochée par réflexe et un geste délibéré.
  const [luTermes, setLuTermes] = useState(false);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const complet = terms && age && research;

  // Fermer la fenêtre ne vaut lecture que si le bouton « J'ai lu » a été
  // utilisé — donc après défilement complet. Échap et le clic à l'extérieur
  // ferment aussi, mais ne créditent rien : on laisse toujours sortir, on ne
  // récompense que le parcours réel.
  const fermerModale = (parcourue) => {
    setModaleOuverte(false);
    if (parcourue) setLuTermes(true);
  };

  const accepter = async () => {
    if (!complet) return;
    setBusy(true);
    try {
      await api.post("/affiliate/terms/accept", {
        accept_terms: true, confirm_age: true, accept_research_use: true,
      });
      await onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setBusy(false);
    }
  };

  return (
    <div className="bg-clinical min-h-screen flex items-center justify-center px-6 py-16"
         data-testid="affiliate-terms-gate">
      {modaleOuverte && (
        <TermsModal L={L} lang={lang} onClose={fermerModale} />
      )}
      <div className="w-full max-w-lg bg-white rounded-xl border border-ash p-8 space-y-5">
        {/* Première acceptation ou RÉVISION : ce n'est pas la même situation.
            Dire « avant de commencer » à quelqu'un qui a déjà accepté il y a
            trois jours lui fait croire que son compte s'est réinitialisé — et
            le mécanisme de version, qui redemande l'accord dès que le texte
            change, rend ce cas ordinaire plutôt qu'exceptionnel. La date
            conservée par le serveur distingue les deux. */}
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
          {dejaAccepte
            ? L("CONDITIONS MISES À JOUR", "TERMS UPDATED")
            : L("AVANT DE COMMENCER", "BEFORE YOU START")}
        </p>
        <h1 className="font-display text-2xl font-bold text-nordfjord leading-tight">
          {dejaAccepte
            ? L("Nos conditions ont changé", "Our terms have changed")
            : L("Conditions du programme d'affiliation", "Affiliate program terms")}
        </h1>
        <p className="text-sm text-glacier leading-relaxed">
          {dejaAccepte
            ? L("Votre compte et vos commissions ne sont pas affectés. Nous avons révisé le texte du programme et devons recueillir votre accord sur cette version avant de continuer.",
                "Your account and commissions are unaffected. We have revised the program text and need your agreement to this version before continuing.")
            : L("Vous allez promouvoir des produits destinés exclusivement à la recherche en laboratoire. Vos communications ne doivent jamais suggérer un usage humain ou vétérinaire.",
                "You are about to promote products intended exclusively for laboratory research. Your communications must never suggest human or veterinary use.")}
        </p>

        <div className="space-y-3.5 pt-1">
          {/* Les conditions s'ouvrent PAR-DESSUS, jamais dans un autre onglet :
              quitter la page fait perdre le fil, et sur mobile on ne retrouve
              pas où on en était. La case ne se déverrouille qu'après avoir
              ouvert le texte ET l'avoir déroulé jusqu'au bas — le clic seul
              prouvait qu'on avait vu un lien, pas qu'on l'avait lu.

              La politique de confidentialité garde son onglet séparé : elle
              n'est pas soumise à la même exigence, et l'imbriquer dans une
              seconde fenêtre par-dessus la première serait pénible. */}
          <Case on={terms} set={setTerms} test="terms-accept"
                disabled={!luTermes}
                raison={L("Ouvrez et parcourez d'abord les conditions.",
                          "Open and scroll through the terms first.")}>
            {L("J'ai lu et j'accepte les ", "I have read and accept the ")}
            <button type="button"
                    onClick={() => setModaleOuverte(true)}
                    data-testid="terms-link"
                    className="text-nova underline">
              {L("conditions du programme d'affiliation", "affiliate program terms")}
            </button>
            {L(" ainsi que la ", " and the ")}
            <Link to="/privacy" target="_blank" rel="noreferrer" className="text-nova underline">
              {L("politique de confidentialité", "privacy policy")}
            </Link>.
          </Case>
          <Case on={age} set={setAge} test="terms-age">
            {L("Je confirme avoir 19 ans ou plus.", "I confirm I am 19 or older.")}
          </Case>
          <Case on={research} set={setResearch} test="terms-research">
            {L("Je m'engage à ne présenter aucun produit comme destiné à la consommation humaine ou animale.",
               "I undertake never to present any product as intended for human or animal consumption.")}
          </Case>
        </div>

        <div className="flex gap-3 pt-2">
          <Link to="/" data-testid="terms-decline"
                className="flex-1 text-center px-5 py-3 rounded-full border border-ash font-data text-xs font-bold uppercase tracking-wider text-glacier hover:border-glacier transition">
            {L("Refuser", "Decline")}
          </Link>
          <button onClick={accepter} disabled={!complet || busy} data-testid="terms-submit"
                  className="flex-[2] px-5 py-3 rounded-full bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider disabled:opacity-40 transition">
            {busy ? L("Enregistrement…", "Saving…") : L("Accepter et continuer", "Accept and continue")}
          </button>
        </div>
        <p className="font-data text-[11px] text-glacier">
          {L("Refuser vous ramène à l'accueil. Votre invitation reste valide : vous pourrez accepter plus tard.",
             "Declining returns you home. Your invitation stays valid — you can accept later.")}
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "bg-nordfjord border-nordfjord" : "bg-white border-ash"}`}>
      <p className={`font-data text-[10px] font-semibold uppercase tracking-[0.2em] mb-2 ${accent ? "text-nova" : "text-glacier"}`}>
        {label}
      </p>
      <p className={`font-display text-2xl font-bold ${accent ? "text-white" : "text-nordfjord"}`}>{value}</p>
      {/* Devise ou precision. Sans elle, rien ne distingue un montant en CAD
          d'un montant en USD sur un ecran ou les deux coexistent. */}
      {sub && (
        <p className={`font-data text-[10px] uppercase tracking-[0.16em] mt-1 ${accent ? "text-white/60" : "text-glacier"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function MiniInsight({ label, value }) {
  return (
    <div className="rounded-xl border border-ash bg-white px-4 py-3">
      <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-glacier mb-1">{label}</p>
      <p className="font-display text-xl font-bold text-nordfjord tabular-nums">{value}</p>
    </div>
  );
}

function SourceBars({ rows, fmt, L }) {
  if (!rows || rows.length === 0) {
    return <p className="text-glacier text-[11px]">{L("Aucune donnée.", "No data.")}</p>;
  }
  const n = rows[0]?.clicks || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.source} className="flex items-center gap-2">
          <span className="text-[11px] text-nordfjord w-[120px] truncate" title={r.source}>{fmt(r.source)}</span>
          <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
            <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (r.clicks / n) * 100)}%` }} />
          </div>
          <span className="text-[11px] text-glacier tabular-nums w-8 text-right">{r.clicks}</span>
        </div>
      ))}
    </div>
  );
}

function SourcesGrid({ sources, L, lang }) {
  const devLabels = {
    desktop: L("Ordinateur", "Desktop"),
    mobile: L("Mobile", "Mobile"),
    tablet: L("Tablette", "Tablet"),
    unknown: L("Inconnu", "Unknown"),
  };
  const devices = Object.entries(sources.devices || {}).sort((a, b) => b[1] - a[1]);
  const devTotal = devices.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("PAGES D'ATTERRISSAGE", "LANDING PAGES")}
        </p>
        <SourceBars rows={sources.top_pages} L={L}
          fmt={(s) => (s === "direct" ? L("Accès direct", "Direct") : s)} />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("RÉFÉRENTS", "REFERRERS")}
        </p>
        <SourceBars rows={sources.top_referrers} L={L}
          fmt={(s) => (s === "direct" ? L("Accès direct", "Direct") : s)} />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-glacier mb-2">
          {L("APPAREILS", "DEVICES")}
        </p>
        <div className="space-y-1.5">
          {devices.length === 0 && (
            <p className="text-glacier text-[11px]">{L("Aucune donnée.", "No data.")}</p>
          )}
          {devices.map(([k, n]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[11px] text-nordfjord w-[120px] truncate">{devLabels[k] || k}</span>
              <div className="flex-1 h-2 rounded-full bg-ash overflow-hidden">
                <div className="h-full rounded-full bg-nova" style={{ width: `${Math.max(2, (n / devTotal) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-glacier tabular-nums w-8 text-right">{Math.round((n / devTotal) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ e, L, lang, money, fmtDateTime }) {
  if (e.type === "click") {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
        <span className="w-8 h-8 rounded-lg bg-nova/10 text-nova grid place-items-center shrink-0">
          <MousePointerClick size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-nordfjord">
            {L("Clic sur votre lien", "Click on your link")}
            {e.label ? <span className="text-glacier"> · {e.label}</span> : null}
          </p>
        </div>
        <span className="text-[11px] text-glacier shrink-0">{fmtDateTime(e.at, lang)}</span>
      </div>
    );
  }
  if (e.type === "referral") {
    const m = REFERRAL_STATUS_META[e.status] || REFERRAL_STATUS_META.pending;
    return (
      <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
        <span className="w-8 h-8 rounded-lg bg-success/10 text-success grid place-items-center shrink-0">
          <ShoppingBag size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-nordfjord">
            {L("Commande", "Order")} <span className="font-semibold">{e.label || "—"}</span>
            {e.base != null ? <span className="text-glacier"> · {money(e.base)}</span> : null}
          </p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.cls}`}>
            {lang === "fr" ? m.fr : m.en}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-nordfjord tabular-nums">{money(e.amount)}</p>
          <p className="text-[11px] text-glacier">{fmtDateTime(e.at, lang)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2 border-b border-ash/40 last:border-0">
      <span className="w-8 h-8 rounded-lg bg-warning/10 text-warning grid place-items-center shrink-0">
        <Wallet size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-nordfjord">
          {L("Paiement", "Payout")} <span className="font-semibold">{e.label || "—"}</span>
        </p>
        <p className="text-[11px] text-glacier uppercase">{e.status}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-nordfjord tabular-nums">{money(e.amount)}</p>
        <p className="text-[11px] text-glacier">{fmtDateTime(e.at, lang)}</p>
      </div>
    </div>
  );
}

function ReferralTable({ rows, lang, L, money }) {
  if (!rows.length) {
    return <p className="text-glacier text-sm py-12 text-center">{L("Aucune commande validée.", "No validated orders.")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-data text-[11px] uppercase tracking-wider text-glacier border-b border-ash">
            <th className="px-6 py-3">{L("Commande", "Order")}</th>
            <th className="px-6 py-3">{L("Base", "Base")}</th>
            <th className="px-6 py-3">{L("Commission", "Commission")}</th>
            <th className="px-6 py-3">{L("Statut", "Status")}</th>
            <th className="px-6 py-3">{L("Date", "Date")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-ash/60">
              <td className="px-6 py-3 font-data text-nordfjord">{r.order_number || "—"}</td>
              <td className="px-6 py-3 text-glacier">{money(r.base_amount)}</td>
              <td className="px-6 py-3 font-semibold text-nordfjord">{money(r.commission_amount)}</td>
              <td className="px-6 py-3"><ReferralStatus status={r.status} lang={lang} /></td>
              <td className="px-6 py-3 font-data text-[11px] text-glacier">
                {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralStatus({ status, lang }) {
  const map = {
    pending: { fr: "En attente", en: "Pending", cls: "bg-ash/50 text-glacier" },
    approved: { fr: "Approuvé", en: "Approved", cls: "bg-nova/15 text-nordfjord" },
    paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
    reversed: { fr: "Annulé", en: "Reversed", cls: "bg-error/15 text-error" },
  };
  const m = map[status] || map.pending;
  return <span className={`px-2.5 py-1 rounded-full font-data text-[10px] font-semibold ${m.cls}`}>{lang === "fr" ? m.fr : m.en}</span>;
}

function PayoutStatus({ status, L }) {
  const map = {
    ready: { fr: "Prêt", en: "Ready", cls: "bg-warning/15 text-warning" },
    paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
  };
  const m = map[status] || map.ready;
  return <span className={`px-2.5 py-1 rounded-full font-data text-[10px] font-semibold ${m.cls}`}>{L(m.fr, m.en)}</span>;
}

function ComplianceItem({ title, body }) {
  return (
    <li className="flex gap-3">
      <span className="text-nova mt-0.5">▸</span>
      <div>
        <p className="font-semibold text-nordfjord">{title}</p>
        <p className="text-glacier text-[12px] leading-relaxed">{body}</p>
      </div>
    </li>
  );
}
