// frontend/src/pages/AffiliateDashboard.jsx : Tableau de bord affilié Fironova.
// Bilingue FR/EN, identité NOVA. Derrière l'auth existante (ProtectedRoute).
import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { QRCodeSVG } from "qrcode.react";
import {
  MousePointerClick, ShoppingBag, Wallet, Download,
  MessageCircle, Send, Mail, Check, User } from "lucide-react";
import api, { formatApiError } from "../lib/api";
// Extraites dans lib/periode : ces fonctions vivaient en double ici et
// dans AdminAffiliates. `periodeLisible` est le pendant de
// `_periode_lisible` cote serveur, qui sert aux courriels.
import { moisLisible, jourLisible, momentLisible, periodeLisible }
  from "../lib/periode";
import { libelleVersement, commissionsRenduesAuCycle }
  from "../lib/statutVersement";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import { DashboardSkeleton } from "../components/LoadingSkeletons";
import useAffiliate from "../hooks/useAffiliate";
import useDocumentHead from "../hooks/useDocumentHead";
import GuidedTour, { visiteDejaVue, marquerVisiteVue } from "../components/GuidedTour";
import AffiliateSupport from "../components/AffiliateSupport";
import TermsModal from "../components/TermsModal";
import TierLadder from "../components/TierLadder";
import CarteAffilie from "../components/CarteAffilie";
import DepuisLeDebut from "../components/DepuisLeDebut";
import DernierVersement from "../components/DernierVersement";
import DetailVersement from "../components/DetailVersement";
import OngletsAffilie, { CLES_ONGLETS } from "../components/OngletsAffilie";
import ClocheAffilie from "../components/ClocheAffilie";
import ChiffreAnime from "../components/ChiffreAnime";
import ThemeToggle from "../components/ThemeToggle";

import useChartColors from "../hooks/useChartColors";
// Couleurs métal de l'échelle des paliers. Deux corrections par rapport à la
// version précédente :
//
//   : Standard et Argent portaient LE MÊME gris (#64748B). Deux paliers
//     distincts, une seule couleur : l'échelle ne se lisait pas.
//   : Diamant portait #00B8D4, l'accent de la marque. Le système d'identité
//     réserve cette couleur aux appels à l'action ; l'utiliser pour un palier
//     la banalisait partout ailleurs.
//
// La progression va du turquoise au violet, en passant par les métaux : on
// suit l'échelle du regard sans lire les noms.
const TIER_META = {
  // LES COULEURS PASSENT PAR DES JETONS, plus par des valeurs en dur.
  //
  // Mesurees le 2026-09-26, les six etaient illisibles en mode clair — entre
  // 2,21:1 et 3,29:1 pour un seuil de 4,5. Une valeur en dur ne peut pas
  // suivre le theme : elle reste identique quand le fond s'inverse. Chaque
  // palier a desormais sa variante claire et sa variante sombre, meme teinte,
  // dans index.css.
  // Le JETON, pas la couleur finie : l'appelant a besoin du trait PLEIN pour
  // le texte et d'un VOILE pour le fond. Avec une couleur deja composee, le
  // voile se fabriquait en collant « 1a » a la fin — une transparence
  // hexadecimale qui n'a aucun sens sur un rgb(var(...)) et cassait le fond
  // de la pastille. Les canaux permettent les deux proprement.
  standard: { fr: "Standard", en: "Standard", jeton: "--fn-palier-standard" },
  bronze: { fr: "Bronze", en: "Bronze", jeton: "--fn-palier-bronze" },
  silver: { fr: "Argent", en: "Silver", jeton: "--fn-palier-argent" },
  gold: { fr: "Or", en: "Gold", jeton: "--fn-palier-or" },
  platinum: { fr: "Platine", en: "Platinum", jeton: "--fn-palier-platine" },
  diamond: { fr: "Diamant", en: "Diamond", jeton: "--fn-palier-diamant" },
};

const COMPLIANCE_META = {
  compliant: { fr: "Conforme", en: "Compliant", cls: "bg-success/15 text-success", dot: "✅" },
  review: { fr: "En révision", en: "Under review", cls: "bg-warning/15 text-warning", dot: "⚠️" },
  suspended: { fr: "Suspendu", en: "Suspended", cls: "bg-error/15 text-error", dot: "🔒" },
};

const money = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// maskEmail() vivait ici. Le masquage se fait DÉSORMAIS CÔTÉ SERVEUR
// (_masquer_courriel dans server.py) : la garder aurait laissé croire que la
// protection est affaire d'affichage, ce qui était exactement le défaut -
// l'adresse complète voyageait dans la réponse JSON et se lisait dans les
// outils de développement, masque ou pas.

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
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" });
};
const fmtDateTime = (iso, lang) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
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

function TableSkeleton({ cols, rows = 5 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-ash/60">
          <td colSpan={cols} className="px-6 py-3.5">
            <div className="h-3 w-full max-w-[220px] rounded bg-ash/50 animate-pulse" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export default function AffiliateDashboard() {
  // Les couleurs de graphique passent par des PROPRIETES, pas des
  // classes : sans ce crochet elles ignorent le mode nuit.
  const couleursGraphique = useChartColors();
  const { user, logout, refresh } = useAuth();
  const { lang } = useLang();
  useDocumentHead({ title: lang === "fr" ? "Tableau de bord affilié" : "Affiliate Dashboard", path: "/affiliate", noindex: true });
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
  /* LE DERNIER VERSEMENT PAYE vient du serveur et non de la page affichee :
     le deduire de la page 1 serait faux des que dix releves non payes
     s'empilent, et l'ecran annoncerait « aucun paiement » a quelqu'un qui a
     deja ete paye. */
  const [dernierPaye, setDernierPaye] = useState(null);
  /* L'identifiant du versement dont la fenetre de detail est ouverte. */
  const [detailVersement, setDetailVersement] = useState(null);
  const [series, setSeries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [insights, setInsights] = useState(null);
  const [sources, setSources] = useState(null);
  const [activity, setActivity] = useState([]);
  // L'onglet initial peut venir de l'URL : la page FAQ renvoie vers
  // /affiliate?tab=payments quand on quitte le menu par un bouton.
  const [menuCompteOuvert, setMenuCompteOuvert] = useState(false);
  const menuCompte = useRef(null);
  useEffect(() => {
    if (!menuCompteOuvert) return undefined;
    const fermer = (e) => {
      if (menuCompte.current && !menuCompte.current.contains(e.target)) {
        setMenuCompteOuvert(false);
      }
    };
    document.addEventListener("pointerdown", fermer);
    return () => document.removeEventListener("pointerdown", fermer);
  }, [menuCompteOuvert]);

  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return p && CLES_ONGLETS.includes(p) ? p : "overview";
  });
  // L ONGLET ACTIF SE RAMENE EN VUE. Sur telephone, la barre glisse : revenir
  // sur « Aide », le dernier des six, laissait la barre au debut et l onglet
  // choisi hors ecran. On ne demande pas a quelqu un de rechercher la ou il
  // se trouve deja.
  const ongletActif = useRef(null);
  useEffect(() => {
    const el = ongletActif.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab]);
  const [copied, setCopied] = useState(false);
  // Copie du CODE, distincte de celle du lien : ce sont deux choses qu'on
  // partage dans deux situations différentes, et un seul témoin de copie
  // afficherait « Copié » sur le mauvais bouton.
  const [codeCopie, setCodeCopie] = useState(false);
  const [refPage, setRefPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  // Pagination SERVEUR (items+total) : l'état ne porte que la page courante.
  // `refTotal`/`payTotal` alimentent le Pagination ; les drapeaux *Loading
  // montrent le squelette de table pendant le changement de page.
  const [refTotal, setRefTotal] = useState(0);
  const [payTotal, setPayTotal] = useState(0);
  const [refLoading, setRefLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  // Payout settings form
  const [payAddr, setPayAddr] = useState("");
  const [payCur, setPayCur] = useState("btc");
  const [savingPay, setSavingPay] = useState(false);

  // Mot de passe : un affilié est créé passwordless : le champ « actuel »
  // n'apparaît que s'il en a déjà défini un.
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const pwLess = !!user?.passwordless;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Un seul aller-retour : `/affiliate/dashboard` agrège toutes les
      // sections. Le serveur est résilient (une section en échec est
      // remplacée par un repli sûr) : c'est le Promise.allSettled d'avant,
      // mais côté serveur, donc sans les 8 round-trips.
      setRefPage(1); setPayPage(1);
      const { data } = await api.get("/affiliate/dashboard", {
        params: { ref_page: 1, pay_page: 1, page_size: PAGE_SIZE },
      });
      const items = (section) => section?.items ?? [];
      setReferrals(items(data?.referrals));
      setRefTotal(data?.referrals?.total ?? 0);
      setPayouts(items(data?.payouts));
      setPayTotal(data?.payouts?.total ?? 0);
      setDernierPaye(data?.payouts?.dernier_paye ?? null);
      setInsights(data?.insights || null);
      setSources(data?.clicks_sources || null);
      setActivity(Array.isArray(data?.activity) ? data.activity : []);
      setCustomers(Array.isArray(data?.customers?.customers) ? data.customers.customers : []);
      const perfSeries = data?.performance?.series || [];
      setSeries(perfSeries.map((s) => ({
        month: s.month,
        revenue: s.revenue,
        commission: s.commission,
        // Les commissions reprises lors d'un remboursement. Sans cette ligne,
        // un mois maigrissait sans explication : la vente sortait de
        // « valide » et rien ne disait ou elle etait passee.
        reversed: s.reversed ?? 0,
      })));
    } catch (e) {
      // Un 403 ici = compte suspendu ou retiré : l'écran dédié s'affiche déjà
      // plus bas, un toast par-dessus ferait doublon. Tout le reste se signale.
      if (e?.response?.status !== 403) {
        toast.error(formatApiError(e.response?.data?.detail) || e.message);
      }
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

  // Top products: prioritise l'affilié (produits qu'IL a vendus) -
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

  const exportReferrals = async () => {
    try {
      // L'état ne porte que la page courante (pagination serveur) : un export
      // doit couvrir TOUTES les lignes, on re-fetche donc la liste plate
      // (contrat de l'endpoint sans paramètre `page`).
      const { data } = await api.get("/affiliate/referrals", { params: { limit: 500 } });
      const rows = Array.isArray(data) ? data : [];
      downloadCsv(
        `fironova-referrals-${refCode}.csv`,
        ["Order", "Base", "Commission", "Status", "Date"],
        rows.map((r) => [
          r.order_number, r.base_amount, r.commission_amount, r.status,
          fmtDate(r.created_at, lang),
        ])
      );
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const exportPayouts = async () => {
    try {
      const { data } = await api.get("/affiliate/payouts");
      const rows = Array.isArray(data) ? data : [];
      downloadCsv(
        `fironova-payouts-${refCode}.csv`,
        // « Période couverte » d'abord, et l'étiquette de run gardée a cote
        // sous son vrai nom : le fichier part chez une comptabilite, qui doit
        // pouvoir rapprocher un lot ET savoir quel mois a ete gagne.
        ["Periode couverte", "Run", "Amount CAD", "FX CAD to USD", "FX source", "Amount received", "Currency", "Status", "Paid at", "Reference"],
        rows.map((p) => [
          p.periode_couverte
            ? (p.periode_couverte.debut === p.periode_couverte.fin
              ? p.periode_couverte.debut
              : `${p.periode_couverte.debut} - ${p.periode_couverte.fin}`)
            : "",
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
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const refPageRows = referrals;
  const payPageRows = payouts;

  // Changement de page : re-fetch serveur de cette SEULE section. La pagination
  // vit côté serveur (items+total) : le dashboard ne transporte plus la liste
  // entière, seulement la page affichée.
  const goRefPage = useCallback(async (p) => {
    setRefLoading(true);
    try {
      const { data } = await api.get("/affiliate/referrals", {
        params: { page: p, page_size: PAGE_SIZE },
      });
      setReferrals(data?.items || []);
      setRefTotal(data?.total || 0);
      setRefPage(p);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setRefLoading(false);
    }
  }, []);

  const goPayPage = useCallback(async (p) => {
    setPayLoading(true);
    try {
      const { data } = await api.get("/affiliate/payouts", {
        params: { page: p, page_size: PAGE_SIZE },
      });
      setPayouts(data?.items || []);
      setPayTotal(data?.total || 0);
      setDernierPaye(data?.dernier_paye ?? null);
      setPayPage(p);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setPayLoading(false);
    }
  }, []);

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

  const savePassword = async () => {
    if (!pw.next || pw.next.length < 8) {
      toast.error(L("Le mot de passe doit contenir au moins 8 caractères.", "Password must be at least 8 characters."));
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error(L("Les mots de passe ne correspondent pas.", "Passwords do not match."));
      return;
    }
    setSavingPw(true);
    try {
      const payload = { new_password: pw.next };
      if (!pwLess) payload.current_password = pw.current;
      await api.put("/affiliate/password", payload);
      await refresh();
      setPw({ current: "", next: "", confirm: "" });
      toast.success(L("Mot de passe enregistré.", "Password saved."));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSavingPw(false);
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
    // conditions sont acceptées : la visite n'a aucun sens avant -, et le
    // SERVEUR dit qu'elle n'a pas déjà été donnée. Ce dernier point vient de
    // la fiche affilié et non du navigateur : autrement la visite rejouait
    // entièrement sur un autre appareil ou après un nettoyage.
    // Le marqueur local s'ajoute aux trois conditions : il rattrape le cas où
    // l'enregistrement serveur de la fin de visite n'est jamais arrivé.
    if (data && data.terms_ok !== false && data.tour_done !== true
        && !visiteDejaVue(user?.id)) {
      // Court délai : laisse la mise en page se stabiliser avant de mesurer
      // la première cible, sans quoi la bulle apparaît décalée.
      const t = setTimeout(() => setTourOuvert(true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [data, user?.id]);

  // Terminer ET quitter marquent la visite comme donnée : quelqu'un qui sort à
  // la deuxième bulle a décidé qu'il n'en voulait pas. L'échec de l'appel est
  // volontairement silencieux : le pire qui puisse arriver est qu'elle soit
  // proposée une fois de plus, ce qui ne justifie pas d'alarmer l'affilié.
  const fermerTour = useCallback(async () => {
    setTourOuvert(false);
    // Retour à la vue globale. La visite se termine sur l'onglet Aide ; y
    // laisser quelqu'un lui ferait croire qu'il a atterri là par erreur.
    setTab("overview");

    // Marqueur local POSÉ D'ABORD, avant tout appel réseau : c'est le seul
    // geste qui ne peut pas échouer, et il suffit à empêcher le retour de la
    // visite sur ce navigateur.
    marquerVisiteVue(user?.id);

    // Une seconde tentative en cas d'échec. L'ancienne version n'en faisait
    // qu'une et avalait l'erreur sans rien enregistrer : un incident réseau
    // d'une seconde effaçait définitivement le fait que la visite avait été
    // suivie jusqu'au bout.
    let enregistre = false;
    for (let essai = 0; essai < 2 && !enregistre; essai += 1) {
      try {
        await api.post("/affiliate/tour/done");
        enregistre = true;
      } catch (e) {
        if (essai === 1) {
          // Silencieux pour l'affilié : le pire est que la visite soit
          // reproposée sur un AUTRE appareil : mais tracé pour nous : c'est
          // par cette porte que le défaut était sorti sans laisser d'indice.
          console.warn("[affiliate] fin de visite non enregistrée", e);
        }
      }
    }

    // Mise à jour optimiste du cache : useAffiliate dédoublonne pendant 60 s
    // et ne revalide pas au retour de focus. Sans ce coup de pouce, un retour
    // rapide sur le tableau de bord relisait `tour_done: false`.
    try {
      await refreshAffiliate(
        (courant) => (courant ? { ...courant, tour_done: true } : courant),
        { revalidate: true },
      );
    } catch { /* le cache se remettra d'aplomb au prochain chargement */ }
  }, [refreshAffiliate, user?.id]);

  if (loading || affiliateLoading) {
    return <DashboardSkeleton />;
  }

  if (affiliateError?.response?.status === 403) {
    // Un seul statut HTTP (403) pour deux réalités : « pas affilié » et
    // « affilié suspendu ». Le backend porte un code dans la réponse pour les
    // distinguer : sinon un compte suspendu lirait « programme privé » comme
    // s'il n'avait jamais rejoint, ce qui masquerait la raison réelle.
    const detail403 = affiliateError.response.data?.detail;
    const code403 = detail403 && (typeof detail403 === "object" ? detail403.code : detail403);
    const suspendu = code403 === "suspended";
    const ferme = code403 === "closed";

    if (ferme) {
      /* UN DOSSIER FERME N'EST PAS UN INCONNU.
         Il lisait « Accès sur invitation » : le programme disait à quelqu'un
         qu'il venait de fermer qu'il n'avait jamais été invité. Et la
         fermeture est refusée tant qu'il reste des commissions non versées —
         donc on peut l'affirmer ici sans réserve, ce qui est précisément ce
         qu'on veut lui dire. */
      return (
        <div className="bg-clinical min-h-screen">
          <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="affiliate-closed">
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-glacier mb-3">
              {L("DOSSIER FERMÉ", "ACCOUNT CLOSED")}
            </p>
            <h1 className="font-display text-[32px] font-bold text-nordfjord mb-4">
              {L("Votre dossier d'affilié est fermé", "Your affiliate account is closed")}
            </h1>
            <p className="text-glacier leading-relaxed mb-2">
              {L("Votre participation au programme d'affiliation a pris fin. Toutes vos commissions acquises ont été versées avant la fermeture — un dossier ne se ferme pas tant qu'il reste quelque chose à payer.",
                 "Your participation in the affiliate program has ended. All earned commissions were paid before closing — an account cannot be closed while anything remains payable.")}
            </p>
            <p className="text-glacier leading-relaxed mb-8">
              {L("Votre compte client et vos commandes ne changent pas. Écrivez-nous si vous souhaitez revenir.",
                 "Your customer account and orders are unaffected. Write to us if you would like to come back.")}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a href="mailto:info@fironova.com"
                className="btn-pill btn-nova" data-testid="closed-support">
                {L("Nous écrire", "Write to us")}
              </a>
              <button onClick={logout} className="btn-pill btn-outline" data-testid="closed-logout">
                {L("Se déconnecter", "Log out")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (suspendu) {
      return (
        <div className="bg-clinical min-h-screen">
          <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="affiliate-suspended">
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-error mb-3">
              {L("COMPTE SUSPENDU", "ACCOUNT SUSPENDED")}
            </p>
            <h1 className="font-display text-[32px] font-bold text-nordfjord mb-4">
              {L("Votre compte a été suspendu", "Your account has been suspended")}
            </h1>
            <p className="text-glacier leading-relaxed mb-2">
              {L(
                "Votre participation au programme d'affiliation est temporairement suspendue.",
                "Your participation in the affiliate program has been temporarily suspended."
              )}
            </p>
            <p className="text-glacier leading-relaxed mb-8">
              {L(
                "Contactez-nous pour en savoir plus : les commissions déjà acquises et vérifiées restent tracées, et aucun versement en cours n'est perdu.",
                "Contact us for details: already earned and verified commissions remain recorded, and no pending payout is lost."
              )}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a href="mailto:info@fironova.com"
                className="btn-pill btn-nova" data-testid="suspended-support">
                {L("Contacter le support", "Contact support")}
              </a>
              <button onClick={logout} className="btn-pill btn-outline" data-testid="suspended-logout">
                {L("Se déconnecter", "Log out")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-clinical min-h-screen">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="affiliate-not-member">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
            {L("PROGRAMME PRIVÉ", "PRIVATE PROGRAM")}
          </p>
          <h1 className="font-display text-[32px] font-bold text-nordfjord mb-4">
            {L("Accès sur invitation", "Invitation only")}
          </h1>
          {user ? (
            /* MIREILLE : une personne CONNECTEE tombait sur ce mur apres son
               lien magique, sans que rien ne dise qu'elle etait bien
               connectee — la page laissait croire que la connexion avait
               echoue. La distinction change tout : le compte existe, il
               n'est simplement pas affilie au programme. */
            <>
              <p className="text-glacier leading-relaxed">
                {L(
                  "Vous êtes bien connecté(e) — mais votre compte n'est pas affilié au programme, qui reste sur invitation. Votre compte client et vos commandes ne changent pas.",
                  "You are signed in — but your account is not part of the affiliate program, which remains invitation-only. Your customer account and orders are unchanged."
                )}
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap mt-8">
                <Link to="/account" className="btn-pill btn-nova" data-testid="not-member-account">
                  {L("Aller à mon compte", "Go to my account")}
                </Link>
                <button onClick={logout} className="btn-pill btn-outline" data-testid="not-member-logout">
                  {L("Se déconnecter", "Log out")}
                </button>
              </div>
            </>
          ) : (
            <p className="text-glacier leading-relaxed">
              {L(
                "Le programme d'affiliation Fironova est privé et fonctionne uniquement sur invitation. Si vous avez reçu une invitation, activez-la depuis le lien de votre courriel.",
                "The Fironova affiliate program is private and invitation-only. If you received an invitation, activate it from the link in your email."
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* SANS FICHE, ON N'AFFICHE PAS UN TABLEAU DE BORD FAUX.
   *
   * Seul le 403 avait un écran dédié. Pour un 500, un délai dépassé ou une
   * coupure réseau, `data` vaut null, les deux gardes ci-dessus sont franchies
   * et tout le rendu part avec `data?.x` partout. Un affilié Diamant à 20 %
   * lisait alors : palier vide, « · 0 % », « une commande de 100 $ vous
   * rapporte 0,00 $ », et : parce que `next_tier` est absent : « 🏆 Palier
   * maximal atteint ». Le panneau de versement disparaissait, et le bouton
   * « Copier » du lien restait actif : il copiait une chaîne vide en affichant
   * « Copié ✓ ». La personne partageait un lien mort.
   *
   * Aucune de ces valeurs n'est fausse au sens du code : elles sont toutes le
   * repli d'un champ absent. C'est précisément le problème : rien ne distingue
   * « zéro » de « je ne sais pas ».
   */
  if (!data) {
    return (
      <div className="bg-clinical min-h-screen">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="affiliate-unavailable">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
            {L("DONNÉES INDISPONIBLES", "DATA UNAVAILABLE")}
          </p>
          <h1 className="font-display text-[32px] font-bold text-nordfjord mb-4">
            {L("Vos chiffres n'ont pas pu être chargés", "Your figures could not be loaded")}
          </h1>
          <p className="text-glacier leading-relaxed mb-8">
            {L("Rien n'est perdu : vos commissions et votre palier sont intacts. C'est l'affichage qui n'a pas pu récupérer vos données.",
               "Nothing is lost: your commissions and tier are intact. It is the display that could not fetch your data.")}
          </p>
          <button onClick={() => refreshAffiliate()}
            className="btn-pill btn-nova" data-testid="affiliate-retry">
            {L("Réessayer", "Try again")}
          </button>
        </div>
      </div>
    );
  }

  const tierJeton = TIER_META[data?.tier]?.jeton || "--fn-palier-defaut";
  // LE SYMBOLE ET LE LIBELLE N'ONT PAS LE MEME SEUIL.
  //
  // 4,5:1 vaut pour du TEXTE ; un objet graphique n'exige que 3:1. En durcissant
  // les six paliers au seuil du texte, j'avais eteint les symboles sans raison.
  // Le trait VIF sert aux cartes KPI de l'onglet Performance : au seuil
  // d'un accent, pas d'un texte.
  const tierVif = `rgb(var(${tierJeton.replace("--fn-palier-", "--fn-vif-")}))`;
  // Le libelle garde `tierColor`, le symbole reprend `tierVif`.
  // LE RANG COLORE LA PAGE.
  //
  // Mireille : « il n'y a aucune couleur, c'est trop blanc ». La reponse n'est
  // pas d'ajouter des couleurs decoratives — un seul accent par page reste la
  // regle — mais de rendre l'accent PERSONNEL : c'est le palier de l'affiliee
  // qui teinte son bandeau. Diamant le tire vers le violet, Or vers l'ambre.
  // Elle reconnait son rang avant de lire un mot, et monter d'un palier change
  // visiblement sa page. Une couleur qui recompense vaut mieux qu'une couleur
  // qui decore.
  //
  // Le degrade part du haut-droit et se dissout : la lueur reste derriere le
  // chiffre sans jamais passer sous le texte, ou elle mangerait le contraste.
  // La lueur emploie le jeton VIF : au seuil du texte elle virait au terne, et
  // c'est precisement ce que Mireille appelait « trop blend ». Deux sources,
  // l'une chaude au coin haut-droit, l'autre plus large et plus basse : une
  // seule tache ronde se lit comme un projecteur, deux se lisent comme une
  // lumiere.
  const tierVifJeton = tierJeton.replace("--fn-palier-", "--fn-vif-");
  const tierLueur = [
    `radial-gradient(90% 120% at 100% 0%, rgb(var(${tierVifJeton}) / 0.55) 0%, rgb(var(${tierVifJeton}) / 0.14) 45%, transparent 72%)`,
    `radial-gradient(70% 100% at 78% 110%, rgb(var(--fn-nova) / 0.20) 0%, transparent 60%)`,
  ].join(", ");
  const tierLabel = TIER_META[data?.tier]?.[lang] || data?.tier;
  const comp = COMPLIANCE_META[data?.compliance_status] || COMPLIANCE_META.compliant;

  // Ce qu'une vente rapporte. L'exemple est ancre sur la BASE COMMISSIONNABLE,
  // pas sur le prix affiche avant rabais : ainsi le taux du palier s'applique
  // tel quel : 100 $ de base a 10 % donnent 10 $ : et la phrase ne melange pas
  // deux montants differents. Annoncer « une vente de 100 $ rapporte 9 $ »
  // etait exact mais illisible : le lecteur ne sait pas lequel des deux
  // chiffres est le sien.

  // Jalons de demarrage, deduits des donnees reelles : jamais d'etape declaree
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
  // Il qualifie ce dont la bulle parle : argent acquis, argent en attente,
  // règle à respecter : au lieu de colorer pour colorer.
  /* L'ORDRE SUIT LES ONGLETS, un par un, et chaque etape declare le SIEN.
   *
   * La refonte mobile — « je ne veux pas que tout soit deroule sur une page du
   * haut a la fin » — a vide l'apercu de huit blocs sur onze, chacun rejoignant
   * l'onglet dont il releve. Les etapes de la visite, elles, ont garde leurs
   * anciennes declarations : « Valide ne veut pas dire verse » et « Le seuil de
   * versement » demandaient encore l'apercu, alors que leurs cibles etaient
   * parties vers Performance et Paiements.
   *
   * Une cible introuvable est SAUTEE au bout d'une seconde, sans bruit. Ces
   * deux bulles — le delai de sept jours et le seuil de versement, les deux
   * notions d'argent qui comptent le plus pour un debutant — ne s'affichaient
   * donc plus du tout, et rien ne le signalait.
   *
   * L'ordre ci-dessous visite chaque onglet UNE SEULE FOIS. Corriger
   * seulement les declarations aurait suffi a faire apparaitre les bulles,
   * mais la visite aurait saute d'un onglet a l'autre six fois : on lit mal
   * une page qui se derobe. Le recit tient toujours : ce qu'on partage, ce
   * qu'on gagne, d'ou viennent les ventes, quand on est paye, l'historique,
   * les regles, ce qu'il faut faire, l'aide, la reference.
   */
  const TOUR = [
    // Cible le panneau lien+code, TOUJOURS présent : et non le bloc des
    // produits à promouvoir, qui n'apparaît qu'une fois des ventes réalisées.
    // La première bulle pointait donc dans le vide pour un nouvel affilié,
    // c'est-à-dire pour la seule personne à qui la visite s'adresse.
    { cible: "affiliate-link-panel", ton: "nova", onglet: "overview",
      titre: L("Votre lien et votre code", "Your link and code"),
      texte: L("Partagez l'un ou l'autre. Le lien crédite la visite en cours ; après quoi, votre contact doit saisir votre code. Le code, lui, n'expire jamais et fonctionne même à l'oral.",
               "Share either one. The link credits the current visit; after that, your contact needs to enter your code. The code never expires and works even spoken aloud.") },

    // Le palier vit sur la carte, en haut de l'apercu : meme onglet que la
    // bulle precedente, donc aucun saut.
    { cible: "affiliate-tier-badge", ton: "acquis", onglet: "overview",
      titre: data?.tier_agreement
        ? L("Votre taux convenu", "Your agreed rate")
        : L("Votre palier", "Your tier"),
      texte: data?.tier_agreement
        ? L("Il résulte d'une entente et ne suit pas le barème. Il ne varie pas avec votre volume de ventes et ne baisse jamais automatiquement.",
            "It comes from an agreement and does not follow the scale. It does not vary with your sales volume and never decreases automatically.")
        // « GLISSANTS » EST FAUX depuis que la fenêtre est calendaire
        // (`tier_basis: calendar_12m`). La carte dit « les douze mois clos » :
        // la visite disait autre chose que l'écran qu'elle commente.
        : L("Il suit vos ventes validées sur les douze mois clos, et monte dès le seuil franchi. De 10 % à 20 % selon le palier.",
            "It follows your validated sales over the last twelve closed months, and rises as soon as a threshold is crossed. From 10% to 20%.") },

    // ── Performance ──
    { cible: "affiliate-kpis", ton: "acquis", onglet: "performance",
      titre: L("Validé ne veut pas dire versé", "Validated is not paid"),
      /* « FAIT PROGRESSER VOTRE PALIER » EST FAUX SOUS ENTENTE. Le taux vient
         de l'entente, il ne monte pas avec le volume. Et cette bulle pointe
         les cartes de Performance : elle promettait donc une progression à
         quelqu'un dont le taux est fixé par contrat, dans l'écran même où il
         vérifie ses chiffres. Le reste de la bulle — le délai, les
         réclamations — vaut pour tout le monde. */
      texte: data?.tier_agreement
        ? L(`Une commande devient « validée » ${data?.approval_hold_days ?? 7} jours après avoir été passée. C'est ce montant qui porte votre commission. Si une réclamation est déposée, la commission reste en attente jusqu'à la décision.`,
            `An order becomes “validated” ${data?.approval_hold_days ?? 7} days after it is placed. That amount is what your commission is paid on. If a claim is filed, the commission stays pending until it is resolved.`)
        : L(`Une commande devient « validée » ${data?.approval_hold_days ?? 7} jours après avoir été passée. C'est ce montant qui fait progresser votre palier. Si une réclamation est déposée, la commission reste en attente jusqu'à la décision.`,
            `An order becomes “validated” ${data?.approval_hold_days ?? 7} days after it is placed. That amount is what moves your tier. If a claim is filed, the commission stays pending until it is resolved.`) },
    { cible: "affiliate-performance", ton: "nova", onglet: "performance",
      titre: L("D'où viennent vos ventes", "Where your sales come from"),
      texte: L("Clics, conversions, produits qui marchent, appareils utilisés. C'est ici qu'on voit ce qui fonctionne avant de le répéter.",
               "Clicks, conversions, products that work, devices used. This is where you see what works before repeating it.") },

    // ── Paiements ──
    { cible: "payout-estimate", ton: "attente", onglet: "payments",
      titre: L("Le seuil de versement", "The payout threshold"),
      // Le seuil est LU du serveur, jamais écrit en dur : une valeur figée ici
      // divergerait de AFFILIATE_PAYOUT_MIN_CAD au premier changement, et la
      // visite affirmerait alors un montant que le système n'applique plus.
      texte: L(`Les versements partent une fois par mois, à partir de ${money(data?.payout_min_cad)}. En dessous, rien n'est perdu : le solde s'ajoute au mois suivant.`,
               `Payouts go out monthly, from ${money(data?.payout_min_cad)}. Below that nothing is lost: the balance carries over.`) },
    { cible: "affiliate-payments", ton: "acquis", onglet: "payments",
      titre: L("L'historique de vos versements", "Your payout history"),
      texte: L("Chaque versement avec son montant, sa devise, le taux de change retenu et sa référence. Exportable en CSV pour votre comptabilité.",
               "Every payout with its amount, currency, the exchange rate used and its reference. Exportable to CSV for your bookkeeping.") },

    // ── Le reste du menu ──
    { cible: "affiliate-compliance", ton: "regle", onglet: "compliance",
      titre: L("Ce qui peut suspendre votre compte", "What can suspend your account"),
      texte: L("Communication privée uniquement, et aucune allégation de santé : ni posologie, ni effet thérapeutique. C'est le seul manquement qui suspend sans préavis, parce qu'il nous engage tous les deux.",
               "Private communication only, and no health claims : no dosage, no therapeutic effect. It is the one breach that suspends without notice, because it commits us both.") },
    { cible: "affiliate-payout-address", ton: "attente", onglet: "settings",
      titre: L("À faire avant votre premier versement", "Do this before your first payout"),
      texte: L("Sans adresse de portefeuille, vos commissions s'accumulent sans pouvoir vous être envoyées. Renseignez-la dès maintenant : une adresse Ethereum (0x…) ou Tron (T…).",
               "Without a wallet address, your commissions build up with no way to reach you. Set it now: an Ethereum (0x…) or Tron (T…) address.") },
    { cible: "affiliate-support", ton: "regle", onglet: "support",
      titre: L("Une question ?", "A question?"),
      texte: L("Écrivez-nous d'ici : votre code, votre palier et votre configuration sont joints automatiquement. Réponse sous un à deux jours ouvrables.",
               "Write to us from here: your code, tier and settings are attached automatically. Reply within one to two business days.") },
    { cible: "affiliate-tab-faq", ton: "regle", onglet: "overview",
      titre: L("Vos questions", "Your questions"),
      texte: L("Le détail des règles s'y trouve, au menu avec le reste : calcul des commissions, attribution, adresses de portefeuille. Vous pouvez relancer cette visite depuis là.",
               "The detailed rules live there, in the menu with the rest: commission calculation, attribution, wallet addresses. You can restart this tour from there.") },
  ];

  const payoutMin = Number(data?.payout_min_cad || 0);
  const dueNow = Number(data?.approved_commission || 0);
  // Le cycle de versement part le 1er du mois suivant : l'annoncer dit a
  // l'affilie QUAND son argent partira, pas seulement combien.
  const prochainCycle = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    .toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
      { year: "numeric", month: "long", day: "numeric" });
  const payoutPct = payoutMin > 0 ? Math.min(100, Math.round((dueNow / payoutMin) * 100)) : null;

  // La date d'adhesion, pour l'en-tete. Replie sur vide quand la fiche n'a
  // pas de date : une etiquette sans valeur vaut mieux qu'une date inventee.
  const moisAdhesion = (() => {
    const d = new Date(data?.created_at || "");
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
      { month: "long", year: "numeric", timeZone: "UTC" });
  })();


  // Conditions non acceptées pour la version courante : on rend UNIQUEMENT
  // l'écran d'acceptation. Pas une surcouche par-dessus le tableau de bord -
  // un affilié verrait ses chiffres derrière et pourrait fermer la fenêtre,
  // et rien ne prouverait plus qu'il a lu quoi que ce soit.
  if (data && data.terms_ok === false) {
    // Une date d'acceptation déjà présente signifie que l'affilié avait accepté
    // une version antérieure : c'est une révision, pas une première visite.
    return <AffiliateTermsGate L={L} lang={lang} onDone={refreshAffiliate}
                               dejaAccepte={Boolean(data?.terms_accepted_at)} />;
  }

  return (
    <div className="relative bg-clinical min-h-screen">
      {/* LE FOND N'EST PLUS UN BLANC UNI. Deux lueurs tres douces, l'une
          nova en haut a gauche, l'autre glacier a droite : la page respire
          sans voler l'attention a la carte. Elles suivent les jetons, donc
          le mode nuit. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
           style={{ background:
             "radial-gradient(55% 60% at 18% 0%, rgb(var(--fn-nova) / 0.06) 0%, transparent 70%)," +
             "radial-gradient(45% 50% at 88% 0%, rgb(var(--fn-glacier) / 0.09) 0%, transparent 70%)" }} />
      {tourOuvert && (
        <GuidedTour steps={TOUR} L={L} onClose={fermerTour} onTab={setTab} />
      )}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16"
           data-testid="affiliate-dashboard">
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
            <h1 className="font-display text-[28px] sm:text-[34px] font-semibold text-nordfjord leading-[1.1]">
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
          </div>
          {/* LES DOUBLONS SORTENT. La pastille de palier repete la carte,
              celle de conformite repete son onglet. A la place, l'identite
              que Mireille reclame : la date d'adhesion et le code, copiable
              la ou l'oeil le trouve. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="font-data text-[12px] text-glacier">
              {moisAdhesion && (
                <>{L("Membre depuis", "Member since")}{" "}
                  <span className="text-nordfjord font-semibold">{moisAdhesion}</span>
                  {" · "}</>
              )}
              {L("Code", "Code")}{" "}
              <span className="text-nordfjord font-semibold tracking-[0.08em]">
                {data?.code || "-"}
              </span>{" "}
              <button onClick={copyCode} data-testid="affiliate-copy-code-header"
                className="px-3 py-2 border border-ash rounded-md text-nova-texte
                           font-data text-[12px] font-semibold
                           hover:border-nova hover:text-nova
                           transition-colors active:scale-[0.97]"
                style={{ borderRadius: "var(--r-m)" }}>
                {codeCopie ? L("Copié ✓", "Copied ✓") : L("Copier", "Copy")}
              </button>
            </p>
            <ClocheAffilie L={L} onOuvrirParametres={() => setTab("settings")} />

            {/* LE MENU COMPTE. Mireille : l'option jour/nuit devait etre
                ailleurs, et l'icone compte doit mener au compte client.
                Les deux vivent ici, avec la deconnexion. */}
            <div className="relative" ref={menuCompte}>
              <button onClick={() => setMenuCompteOuvert((o) => !o)}
                aria-label={L("Compte", "Account")}
                data-testid="affiliate-account-menu"
                className="p-2.5 rounded-full border border-ash text-glacier
                           hover:text-nordfjord hover:border-nova transition-colors
                           active:scale-[0.97]">
                <User size={16} />
              </button>
              {menuCompteOuvert && (
                <div className="absolute right-0 top-11 z-50 w-[240px]
                                rounded-xl border border-ash bg-white overflow-hidden"
                     style={{ boxShadow: "var(--ombre-flotte)" }}
                     data-testid="affiliate-account-menu-panel">
                  <Link to="/account" data-testid="account-menu-client"
                    className="block px-4 py-3 text-[13px] text-nordfjord
                               hover:bg-clinical transition-colors">
                    {L("Mon compte client", "My customer account")}
                  </Link>
                  <div className="flex items-center justify-between px-4 py-2
                                  border-t border-ash">
                    <span className="text-[13px] text-nordfjord">
                      {L("Mode nuit", "Dark mode")}
                    </span>
                    <ThemeToggle />
                  </div>
                  <button onClick={logout} data-testid="account-menu-logout"
                    className="block w-full text-left px-4 py-3 border-t border-ash
                               text-[13px] text-glacier hover:text-error hover:bg-clinical
                               transition-colors">
                    {L("Se déconnecter", "Log out")} →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LES ONGLETS TENAIENT SUR TROIS RANGEES SUR UN TELEPHONE.
            Six pastilles en flex-wrap, c'est trois lignes avant le moindre
            chiffre : l'affilie devait defiler pour voir ses gains. Ils
            glissent desormais horizontalement sur une seule ligne, avec un
            arret magnetique sur chacun — la physique du navigateur, qui bat
            toujours un ressort fait main.
            L'onglet actif se ramene en vue au chargement : revenir sur
            « Paiements » ne doit pas obliger a rechercher l'onglet. */}
        {/* LE MENU PARTAGE : meme barre sur le tableau de bord et sur la
            page FAQ, donc meme ordre, memes libelles, meme style — les deux
            ecrans ne peuvent pas diverger. Voir OngletsAffilie. */}
        <OngletsAffilie actif={tab} L={L} onTab={setTab} actifRef={ongletActif} />

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="space-y-5 sm:space-y-6" data-testid="affiliate-overview">
            {/* L'APERCU NE GARDE QUE TROIS BLOCS.
                Il en portait onze, sur 650 lignes : la carte, le versement, le
                palier, la fenetre, les chiffres cles, les statistiques,
                l'echelle, l'activite, le lien... Mireille : « je ne veux pas
                que tout soit deroule sur une page du haut a la fin ».
                Chaque bloc a rejoint l'onglet dont il releve. Deux ont
                disparu — progression de palier et « vos 12 derniers mois » —
                parce que la carte les porte desormais, et que leur texte
                decrivait encore la fenetre glissante supprimee. */}
            {/* Bandeau. Tant que rien n'a ete gagne, un « 0,00 $ » en gros
                caracteres n'enseigne rien : on montre ce qu'une vente vaut. Des
                qu'il y a des gains, le montant reel est plus utile. */}
            {/* LE MOMENT FORT DE LA PAGE, ET IL ETAIT INVISIBLE.
                Le 2026-09-25, une passe de nettoyage a retire `bg-nordfjord`
                de ce bandeau SANS toucher aux `text-white` qu'il contenait :
                six lignes de texte blanc sur une page blanche. L'affiliee
                ouvrait son compte devant un cadre vide — exactement la plainte
                « les informations ne sont pas faciles a trouver ».

                Il est reconstruit comme ce qu'il doit etre : la seule surface
                sombre de la page, et son plus gros chiffre. C'est ce qu'on
                vient voir en ouvrant son compte d'affiliee — pas un menu, pas
                un tableau : ce qu'on a gagne. La maille moleculaire et la
                texture de bruit le rattachent au hero de la boutique : c'est
                la meme marque, vue de l'interieur. */}
            {/* LE BANDEAU DEVIENT UNE CARTE A TROIS BANDES.
                Il portait le chiffre du mois et le palier ; six autres blocs
                disaient le reste, disperses plus bas dans un apercu de 650
                lignes. Mireille : « les gains du mois sont beaucoup trop loin
                dans le tableau », puis « je ne veux pas que tout soit deroule
                sur une page du haut a la fin ».
                La carte reunit l'argent, la preuve et les paliers dans un seul
                objet, dans cet ordre. Voir components/CarteAffilie.jsx. */}
            <CarteAffilie data={data} insights={insights} L={L} money={money}
                          tierLabel={tierLabel} tierJeton={tierJeton}
                          tierLueur={tierLueur} />

            {/* LES BOITES N'ONT PAS TOUTES LE MEME RANG.
                Mireille : « les priorites des boites ». Elles portaient toutes
                le meme `bg-white rounded-xl border border-ash p-5` : une page
                ou chaque bloc reclame la meme attention n'a pas de hierarchie,
                et l'oeil ne sait pas ou se poser.
                Trois niveaux, un par role : le bandeau FLOTTE (ce qu'on vient
                voir), les blocs d'action sont LEVES (ce qu'on peut faire), la
                reference reste POSEE (ce qu'on consulte). */}
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
                        style={{ boxShadow: i === nextStep ? "var(--ombre-leve)" : "var(--ombre-pose)" }}
                        className={`bg-white rounded-xl border p-5 transition-[transform,box-shadow,border-color]
                          duration-200 ease-out hover:-translate-y-0.5 hover:border-nova ${
                          i === nextStep ? "border-nova" : "border-ash"}`}>
                      <p className="font-data text-[10px] uppercase tracking-[0.18em] text-glacier">
                        {st.done
                          ? L("Fait", "Done")
                          : `${L("Étape", "Step")} ${i + 1}`}
                      </p>
                      <p className="font-semibold text-nordfjord mt-1 flex items-center gap-1.5">
                        {st.done && <Check size={14} className="text-success shrink-0" aria-hidden="true" />}
                        {st.t}
                      </p>
                      <p className="text-[12px] text-glacier mt-0.5">{st.d}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Referral link */}
            <div className="bg-white rounded-xl border border-ash p-5 sm:p-6"
                 data-testid="affiliate-link-panel">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">
                {L("VOTRE LIEN", "YOUR LINK")}
              </p>

              {/* Le code vit desormais dans l'en-tete, copiable en un clic :
                  le panneau ne le repete plus. */}
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="flex-1 min-w-[240px] font-data text-sm text-nordfjord bg-clinical rounded-lg px-4 py-3 border border-ash break-all">
                      {refLink}
                    </code>
                    <button onClick={copyLink} data-testid="affiliate-copy-link"
                            className="px-5 py-3  bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition" style={{ borderRadius: "var(--r-m)" }}>
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
                  "Communication privée uniquement : ne partagez jamais ce lien via des publications, vidéos ou forums publics.",
                  "Private communication only : never share this link through public posts, videos, or forums."
                )}
              </p>
            </div>

            {/* Top products share widget */}
            {topProducts.length > 0 && (refCode || "").length > 0 && (
              <div className="bg-white rounded-xl border border-ash p-5 sm:p-6" data-testid="affiliate-share-widget">
                <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                  <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                    {personalTop
                      ? L("VOS MEILLEURS PRODUITS", "YOUR BEST-SELLING PRODUCTS")
                      : L("PRODUITS À METTRE EN AVANT", "PRODUCTS TO PROMOTE")}
                  </p>
                  {/* « attribution automatique » sans borne laissait croire que
                      le clic suffit, pour toujours. Il vaut pour la visite en
                      cours. Ce panneau s'affiche aux affiliés SANS vente -
                      donc aux moins informés, ceux qui vont bâtir leur idée du
                      programme sur cette ligne. */}
                  <p className="font-data text-[10px] text-glacier">
                    {personalTop
                      ? L("Classés par ventes générées grâce à votre code",
                          "Ranked by sales generated through your code")
                      : L("Un clic vous crédite la commande passée pendant cette visite",
                          "One click credits you the order placed during that visit")}
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
                <p className="mt-3 text-[12px]">
                  <Link to="/" className="text-nova underline"
                        data-testid="share-catalogue-link">
                    {L("Voir tout le catalogue et partager d'autres produits",
                       "See the full catalogue and share other products")}
                  </Link>
                </p>
                <p className="font-data text-[10px] text-glacier mt-3 leading-relaxed">
                  {personalTop
                    ? L("Ces produits ont déjà convaincu votre audience. Un rappel bien placé peut relancer les ventes.",
                        "These products already resonate with your audience. A well-timed reminder can drive repeat sales.")
                    : L("Astuce : ces liens produits atterrissent directement sur un composé précis : vos prospects voient immédiatement de quoi il s'agit.",
                        "Tip: product links land directly on a specific compound, so your prospects know right away what they are looking at.")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* PERFORMANCE */}
        {tab === "performance" && (
          <div className="space-y-6" data-testid="affiliate-performance">
            <header>
              <h2 className="font-display text-[22px] font-bold text-nordfjord leading-tight">
                {L("Performance", "Performance")}
              </h2>
              <p className="text-[13px] text-glacier mt-1">
                {L("vos chiffres et votre activité", "your numbers and your activity")}
              </p>
            </header>
            {/* VENUS DE L'APERCU. Chiffres cles, statistiques, echelle des
                paliers et activite recente : de la mesure, donc de la
                performance. L'apercu n'a pas a les porter. */}
            {/* KPI cards : la devise est explicite. Les montants sont en CAD
                alors que le versement part en USDT/USDC : sans etiquette, un
                affilie qui voit « 250 $ » et recoit 180 USDT croit a une
                retenue. La conversion n'apparaissait qu'APRES un versement,
                dans l'historique : donc jamais pour qui n'a pas encore ete paye. */}
            {/* DEUX cartes, pas quatre. Ce bandeau ne porte que le chiffre
                d'affaires : les commissions vivent dans le panneau de
                versement, et l'activité : clics, conversion, commandes, panier
                : dans la rangée d'indicateurs plus bas. Chacune de ces trois
                zones répond à une question distincte, et aucune ne répète les
                chiffres d'une autre. */}
            {/* DEUX COLONNES DES LE TELEPHONE. Ce sont deux nombres : les
                empiler poussait le second sous la ligne de flottaison, alors
                que c'est precisement la comparaison des deux qui interesse
                l'affilie — ce qu'il a gagne en tout, et ce qui compte pour son
                palier. */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4" data-testid="affiliate-kpis">
              <KpiCard label={L("Ventes validées cumulées", "Cumulative validated sales")}
                       valeurBrute={data?.cumulative_revenue} format={money} sub="CAD" teinte={tierVif} />
              {/* LE SOUS-TITRE DEPEND DU REGIME. « fixe votre palier » est faux
                  sous entente : le taux vient de l'entente, pas de la fenêtre.
                  Le chiffre garde son intérêt — c'est l'activité de l'année —
                  mais on ne lui prête pas un effet qu'il n'a pas. */}
              <KpiCard label={L("12 derniers mois", "Last 12 months")}
                       valeurBrute={data?.rolling12_revenue} format={money}
                       sub={data?.tier_agreement
                         ? L("CAD · douze mois clos", "CAD · last twelve closed months")
                         : L("CAD · fixe votre palier", "CAD · sets your tier")}
                       teinte={tierVif} />
            </div>

            {/* Insights secondaires : clics / conversion / commandes / panier.
                CHAQUE VIGNETTE DIT SA FENETRE. Ces quatre chiffres comptent
                depuis l'ouverture du compte ; la carte « sources de vos clics »
                plus bas compte sur 30 jours. Deux totaux de clics differents
                sur le meme ecran, sans un mot pour les distinguer, se lisent
                comme une erreur : et on finit par ne plus croire ni l'un ni
                l'autre. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniInsight label={L("Clics sur votre lien", "Clicks on your link")}
                           fenetre={L("depuis le début", "all time")}
                           value={insights?.clicks != null ? insights.clicks.toLocaleString("en-CA") : "-"} />
              <MiniInsight label={L("Taux de conversion", "Conversion rate")}
                           fenetre={L("depuis le début", "all time")}
                           value={insights?.conversion_rate != null ? `${(insights.conversion_rate * 100).toFixed(1)}%` : "-"} />
              <MiniInsight label={L("Commandes validées", "Validated orders")}
                           fenetre={L("depuis le début", "all time")}
                           value={insights?.validated_orders != null ? insights.validated_orders.toLocaleString("en-CA") : "-"} />
              <MiniInsight label={L("Panier moyen", "Avg order")}
                           fenetre={L("sous-total produits", "product subtotal")}
                           value={money(insights?.avg_order_value)} />
            </div>

            {/* Échelle des paliers et simulateur. Masquée sous entente : le
                barème ne s'applique pas à ces comptes, leur montrer une échelle
                qu'ils ne gravissent pas serait une fausse promesse : et cela
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

            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4">
                {L("VENTES VALIDÉES : 12 DERNIERS MOIS", "VALIDATED SALES : LAST 12 MONTHS")}
              </p>
              <p className="font-data text-[11px] text-glacier mb-4 -mt-3">
                {L("Sous-total des produits, remise déduite : hors livraison et taxes. C'est la base qui porte votre commission.",
                   "Product subtotal, less discount : shipping and taxes excluded. This is the base your commission is paid on.")}
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
                      <Line type="monotone" dataKey="revenue" name={L("Ventes", "Sales")} stroke="#0B2E4F" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="commission" name={L("Commissions", "Commissions")} stroke="#00B8D4" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="reversed" name={L("Annulées (remboursements)", "Cancelled (refunds)")} stroke="#D64545" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
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
                {L("Derniers 30 jours : pages d'atterrissage, référents et appareils.",
                   "Last 30 days : landing pages, referrers and devices.")}
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
                  {/* « APPORTÉS » et non « RATTACHÉS », et la nuance n'est pas
                      cosmétique. Le sous-titre annonçait un rattachement à vie
                      qui attribuait toute commande future, avec ou sans code.
                      Cette règle a été retirée : une commande n'ouvre droit à
                      commission que si le lien ou le code est utilisé POUR
                      ELLE. Laisser l'ancienne promesse ferait compter l'affilié
                      sur un revenu qui n'arrivera pas. */}
                  <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
                    {L("CLIENTS QUE VOUS AVEZ APPORTÉS", "CUSTOMERS YOU BROUGHT IN")}
                  </p>
                  <p className="font-data text-[10px] text-glacier mt-0.5">
                    {L(
                      "Historique de vos apports. Leurs commandes futures ne vous rapportent QUE si votre lien ou votre code est utilisé.",
                      "A record of who you brought in. Their future orders earn you a commission ONLY when your link or code is used."
                    )}
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-1  bg-clinical text-nordfjord text-xs font-medium" style={{ borderRadius: "var(--r-m)" }} data-testid="attached-customers-count">
                  {customers.length}
                </span>
              </div>
              {customers.length === 0 ? (
                <div className="p-8 text-center text-glacier text-sm" data-testid="attached-customers-empty">
                  {L(
                    "Aucun client apporté pour l'instant. Partagez votre lien ou votre code pour amener votre premier client.",
                    "No customers brought in yet. Share your link or code to bring in your first customer."
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
                        <th className="text-right px-4 py-3">{L("Ventes", "Sales")}</th>
                        <th className="text-right px-4 py-3">{L("Commissions", "Commissions")}</th>
                        <th className="text-left px-4 py-3">{L("Dernière", "Last")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* `c.id` : un identifiant dérivé : et non le courriel.
                          Le `data-testid` réinjectait l'adresse COMPLÈTE dans
                          le HTML de la page : le masquage à l'écran ne servait
                          à rien, il suffisait d'inspecter l'élément. L'adresse
                          arrive désormais déjà masquée du serveur, donc plus
                          rien à masquer ici. */}
                      {customers.map((c) => (
                        <tr key={c.id || c.email} className="border-b border-ash/60 hover:bg-clinical/40"
                            data-testid={`attached-customer-${c.id || ""}`}>
                          <td className="px-6 py-3">
                            <div className="font-medium text-nordfjord truncate max-w-[240px]">
                              {c.email || "-"}
                            </div>
                            {c.has_account && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-data text-nova mt-0.5">
                                ✓ {L("compte lié", "linked account")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-data text-xs text-glacier">
                            {c.bound_at ? new Date(c.bound_at).toLocaleDateString(lang) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5  text-[10px] font-data uppercase tracking-wider bg-clinical text-nordfjord" style={{ borderRadius: "var(--r-m)" }}>
                              {c.source === "click" ? L("lien", "link")
                                : c.source === "code" ? L("code", "code")
                                : c.source === "binding" ? L("récurrent", "returning")
                                : c.source === "backfill" || c.source === "backfill_pass2" ? L("historique", "backfill")
                                : (c.source || "-")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-data font-semibold">{c.orders_count || 0}</td>
                          <td className="px-4 py-3 text-right font-data">{money(c.revenue_validated || 0)}</td>
                          <td className="px-4 py-3 text-right font-data font-semibold text-nova">
                            {money(c.commission_validated || 0)}
                          </td>
                          <td className="px-4 py-3 font-data text-xs text-glacier">
                            {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString(lang) : "-"}
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
              <ReferralTable rows={refPageRows} lang={lang} L={L} money={money} loading={refLoading} />
              <Pagination page={refPage} total={refTotal} pageSize={PAGE_SIZE}
                onChange={goRefPage} L={L} />
            </div>
          </div>
        )}

        {/* PAYMENTS */}
        {tab === "payments" && (
          <div className="space-y-6" data-testid="affiliate-payments">
            <header>
              <h2 className="font-display text-[22px] font-bold text-nordfjord leading-tight">
                {L("Paiements", "Payments")}
              </h2>
              <p className="text-[13px] text-glacier mt-1">
                {L("votre argent : le bilan, le cycle, le seuil, l'historique",
                   "your money: the total, the cycle, the threshold, the history")}
              </p>
            </header>

            {/* L'ORDRE DE CET ONGLET EST CELUI QU'ELLE A DICTÉ.
                Mireille : « Paid avec référence le mois dernier [...] devrait
                se retrouver en haut de page. Suivi du next payout. Ensuite le
                all time avec des filtres. »
                C'est l'ordre des questions qu'on se pose, dans cet ordre :
                « j'ai été payé ? », « et la prochaine fois ? », « combien en
                tout ? », « et le détail ? ». Le cumul était en tête et le fait
                accompli n'existait qu'en bas, dans une ligne de tableau. */}
            <DernierVersement versement={dernierPaye} L={L} money={money} lang={lang} />
            {/* VENUS DE L'APERCU. Le cycle et le prochain versement y
                occupaient 150 lignes alors qu'ils parlent de paiement : leur
                place est ici. La carte garde le montant en pied, en resume. */}
            {/* Le cycle de versement. « Commissions approuvées » mêlait deux
                choses : l'argent du mois clos, qui part dans les jours qui
                viennent, et celui du mois en cours, qui attendra. Un seul
                total pour deux échéances ne dit ni quand ni combien. */}
            {data?.payout_cycle && (
              <CycleVersement cycle={data.payout_cycle} seuil={data?.payout_min_cad}
                              adresse={data?.payout_address}
                              onReglages={() => setTab("settings")}
                              L={L} lang={lang} />
            )}

            {/* Prochain versement. Affiche meme a zero : c'est justement quand
                rien n'est accumule qu'un affilie doit connaitre le seuil. La
                version precedente se cachait dans ce cas, et un solde bloque
                sous le minimum ressemblait alors a une retenue inexpliquee. */}
            {/* Le prochain versement est une ACTION a venir, pas une archive :
                il se leve d'un cran au-dessus de la reference. */}
            {payoutMin > 0 && (
              <div className="bg-white rounded-xl border border-ash p-5 transition-[transform,box-shadow]
                              duration-200 ease-out hover:-translate-y-0.5"
                   style={{ boxShadow: "var(--ombre-leve)" }} data-testid="payout-estimate">
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
                      connu : y compris à zéro. C'est justement avant le premier
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
                            color: "rgb(var(--fn-palier-diamant))",
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
                       style={{ width: `${payoutPct || 0}%`, background: "rgb(var(--fn-nova))" }} />
                </div>

                {/* La regle du cycle, sans mystere : rien accumule, sous le
                    seuil (differe), ou verse a telle date. Et ce qui est
                    encore en maturation, separement : ce n'est PAS de
                    l'argent du, pas encore. */}
                <p className="font-data text-[11px] text-glacier mt-2" data-testid="payout-cycle">
                  {dueNow <= 0
                    ? L("Rien d'accumulé pour l'instant : vos gains du mois en cours restent visibles ci-dessus.",
                        "Nothing accumulated yet : this month's earnings stay visible above.")
                    : dueNow < payoutMin
                    ? L(`Sous le seuil de ${money(payoutMin)} : versé au premier cycle qui l'atteint.`,
                        `Below the ${money(payoutMin)} threshold: paid in the first cycle that reaches it.`)
                    : L(`Versement au cycle du ${prochainCycle}.`,
                        `Paid in the cycle of ${prochainCycle}.`)}
                </p>
                {Number(data?.pending_commission || 0) > 0 && (
                  <p className="font-data text-[11px] text-warning mt-1" data-testid="payout-maturing">
                    {L(`En maturation : ${money(data.pending_commission)}`,
                       `Maturing: ${money(data.pending_commission)}`)}
                  </p>
                )}

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
                    ? L("Seuil atteint : le versement part au prochain cycle mensuel.",
                        "Threshold met : the payout goes out at the next monthly cycle.")
                    : L("Rien n'est perdu sous le seuil : vos commissions restent à votre crédit et s'ajoutent au mois suivant.",
                        "Nothing is lost below the threshold: your commissions stay to your credit and carry over.")}
                </p>
                {/* La conversion s'affiche meme a solde nul. Elle ne servait
                    d'abord qu'a chiffrer un montant ; c'est en realite une
                    information de devise, et c'est AVANT le premier versement
                    qu'elle evite le malentendu : voir « 250 $ » puis recevoir
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
                      {" : "}
                      {L("taux de la Banque du Canada. Le taux définitif sera celui du jour du versement.",
                         "Bank of Canada rate. The final rate is the one on payout day.")}
                    </>
                  ) : (
                    L(" : au taux officiel de la Banque du Canada le jour du versement.",
                      " : at the official Bank of Canada rate on payout day.")
                  )}
                </p>
              </div>
            )}

            {/* LE CUMUL, troisième — « ensuite le all time ».
                ET LES TROIS CARTES QUI ÉTAIENT ICI SONT PARTIES. Elles
                affichaient `pending_commission`, `approved_commission` et
                `paid_commission` : exactement les trois montants que ce bloc
                montre, avec en plus leur proportion et leur sens. Deux
                lectures des mêmes chiffres sur un même écran, c'est ce qui
                fait qu'on finit par n'en croire aucune. */}
            <DepuisLeDebut data={data} series={series} L={L} money={money} lang={lang} />
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
                   aucun : precisement quand l'affilie ignore encore comment il
                   sera paye. Un ecran vide ne doit pas etre un ecran muet. */
                <div className="py-10 px-6 max-w-xl mx-auto text-center">
                  <p className="text-glacier text-sm">
                    {L("Aucun paiement pour l'instant.", "No payments yet.")}
                  </p>
                  <dl className="mt-5 text-left space-y-2.5 font-data text-[12px]">
                    <div className="flex justify-between gap-4 border-b border-ash/60 pb-2">
                      <dt className="text-glacier">{L("Seuil minimum", "Minimum threshold")}</dt>
                      <dd className="text-nordfjord font-semibold">
                        {data?.payout_min_cad != null ? `${money(data.payout_min_cad)} CAD` : "-"}
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
                  {/* DEUX RENDUS, UNE SEULE SOURCE.
                      Mireille : « assure-toi que tout fonctionne aussi sur
                      mobile ». Cette table portait six colonnes — huit avec la
                      date de paiement et le bouton de détail — en défilement
                      horizontal. Sur 375 px on ne lit pas une table de huit
                      colonnes : on la fait glisser en espérant retrouver la
                      ligne de départ.
                      Le dépôt n'avait aucun patron table/cartes. Celui-ci
                      garde la table à partir de `sm`, où elle est le bon
                      outil, et sert des cartes en dessous. `versementLisible`
                      prépare les champs UNE fois pour les deux : deux
                      balisages, c'est deux occasions de diverger, pas deux
                      vérités. */}

                  {/* ---- CARTES, sous `sm` ---- */}
                  {payLoading ? (
                    <p className="sm:hidden px-5 py-8 text-center text-[13px] text-glacier">
                      {L("Chargement…", "Loading…")}
                    </p>
                  ) : (
                    <ul className="sm:hidden divide-y divide-ash/60"
                        data-testid="historique-cartes">
                      {payPageRows.map((p) => {
                        const v = versementLisible(p, lang);
                        return (
                          <li key={p.id} className="px-5 py-4">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-data text-[12px] text-nordfjord font-semibold">
                                {v.periode}
                              </span>
                              <span className="font-display text-[16px] font-bold text-nordfjord tabular-nums shrink-0">
                                {money(v.cad)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap mt-1.5">
                              <PayoutStatus status={p.status} lang={lang} />
                              {v.paye && (
                                <span className="font-data text-[11px] text-glacier">
                                  {L(`payé le ${v.paye}`, `paid ${v.paye}`)}
                                </span>
                              )}
                            </div>

                            {v.recuLisible && (
                              <p className="font-data text-[11px] text-nova-texte mt-1.5">
                                {v.recuLisible}
                                {v.fx && (
                                  <span className="text-glacier/70">
                                    {` · 1 CAD ≈ ${Number(v.fx).toFixed(4)} USD`}
                                  </span>
                                )}
                              </p>
                            )}

                            {p.reference && (
                              <p className="font-data text-[10px] text-glacier/80 mt-1 leading-relaxed">
                                {L("réf ", "ref ")}
                                <code className="break-all select-all">{p.reference}</code>
                              </p>
                            )}

                            {/* 44 px de hauteur, `touch-action` et un `:active` :
                                un bouton de 24 px au doigt se rate. */}
                            <button onClick={() => setDetailVersement(p.id)}
                              className="mt-2.5 w-full h-11 rounded-lg border border-ash
                                         font-data text-[11px] font-semibold uppercase tracking-[0.1em]
                                         text-nordfjord hover:bg-clinical transition-colors
                                         active:scale-[0.98]"
                              style={{ touchAction: "manipulation" }}
                              data-testid={`detail-bouton-${p.id}`}>
                              {L("Voir les commandes", "See the orders")}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* ---- TABLE, à partir de `sm` ---- */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left font-data text-[11px] uppercase tracking-wider text-glacier border-b border-ash">
                          {/* « Période COUVERTE » : le mot seul laissait lire
                              l'étiquette de run comme une période. */}
                          <th className="px-6 py-3">{L("Période couverte", "Period covered")}</th>
                          <th className="px-6 py-3">{L("Montant CAD", "Amount CAD")}</th>
                          <th className="px-6 py-3">{L("Payé le", "Paid on")}</th>
                          <th className="px-6 py-3">{L("Reçu", "Received")}</th>
                          <th className="px-6 py-3">{L("Statut", "Status")}</th>
                          <th className="px-6 py-3">{L("Référence", "Reference")}</th>
                          <th className="px-6 py-3"><span className="sr-only">{L("Détail", "Detail")}</span></th>
                        </tr>
                      </thead>
                      {payLoading ? (
                        <TableSkeleton cols={7} />
                      ) : (
                        <tbody>
                        {payPageRows.map((p) => {
                          const v = versementLisible(p, lang);
                          return (
                            <tr key={p.id} className="border-b border-ash/60">
                              <td className="px-6 py-3 font-data text-nordfjord align-top"
                                  data-testid={`historique-periode-${p.id}`}>
                                {v.periode}
                              </td>
                              <td className="px-6 py-3 font-semibold text-nordfjord align-top tabular-nums">
                                {money(v.cad)}
                              </td>
                              {/* LA DATE DU PAIEMENT. `paid_at` arrivait du
                                  serveur depuis toujours, et aucune colonne ne
                                  le lisait. */}
                              <td className="px-6 py-3 font-data text-[12px] text-glacier align-top"
                                  data-testid={`historique-paye-${p.id}`}>
                                {v.paye || <span className="text-glacier/50">-</span>}
                              </td>
                              <td className="px-6 py-3 font-semibold text-nova align-top">
                                {v.recuLisible
                                  ? (
                                    <>
                                      <span>{v.recuLisible}</span>
                                      {v.fx && (
                                        <span className="block font-data text-[10px] font-normal text-glacier/70">
                                          {`1 CAD ≈ ${Number(v.fx).toFixed(4)} USD`}
                                          {v.source === "bank_of_canada"
                                            ? L(" · Banque du Canada", " · Bank of Canada")
                                            : v.source === "fallback"
                                              ? L(" · estimation", " · fallback")
                                              : ""}
                                        </span>
                                      )}
                                    </>
                                  )
                                  : <span className="text-glacier/50">-</span>}
                              </td>
                              <td className="px-6 py-3 align-top">
                                <PayoutStatus status={p.status} lang={lang} />
                              </td>
                              <td className="px-6 py-3 font-data text-[11px] text-glacier break-all max-w-[200px] align-top">
                                {p.reference
                                  ? <code className="select-all">{p.reference}</code>
                                  : "-"}
                              </td>
                              <td className="px-6 py-3 align-top text-right">
                                <button onClick={() => setDetailVersement(p.id)}
                                  className="px-3 py-1.5 rounded-md border border-ash font-data text-[11px]
                                             text-nordfjord hover:bg-clinical transition-colors
                                             active:scale-[0.97] whitespace-nowrap"
                                  style={{ touchAction: "manipulation" }}
                                  data-testid={`detail-bouton-table-${p.id}`}>
                                  {L("Détail", "Detail")}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        </tbody>
                      )}
                    </table>
                  </div>
                  <p className="px-6 pt-4 pb-1 font-data text-[10px] text-glacier/80 leading-relaxed border-t border-ash/60">
                    {/* Ne dit plus « indexés 1:1 » : c'est précisément
                        l'hypothèse que le calcul a cessé de faire. USDC est
                        tombé à 0,87 en mars 2023. La quantité de jetons
                        s'ajuste désormais au prix réel, et le texte doit le
                        dire : sinon un affilié qui compte ses jetons trouve un
                        écart avec ce qu'on lui a écrit. */}
                    {L("Les commissions sont calculées en CAD, converties en USD au taux officiel de la Banque du Canada le jour du versement, puis payées en jetons. Si le jeton s'écarte du dollar américain, la quantité envoyée est ajustée pour que vous receviez bien le montant dû.",
                       "Commissions are computed in CAD, converted to USD at the Bank of Canada official rate on payout day, then paid in tokens. If the token drifts from the US dollar, the quantity sent is adjusted so you receive the amount owed.")}
                  </p>
                  <Pagination page={payPage} total={payTotal} pageSize={PAGE_SIZE}
                    onChange={goPayPage} L={L} />
                </>
              )}
            </div>

            {/* LA FENÊTRE DE DÉTAIL.
                Mireille : « il faudrait que l'affiliée puisse constater quels
                sont les commandes [que] représente ce paiement, incluant bien
                sûr les commandes remboursées ou annulées. (donc un bouton ou
                avec une fenêtre contextuelle) ».
                Montée seulement quand on l'ouvre : elle charge son contenu à
                l'ouverture, donc la garder en vie invisible ferait une requête
                par versement affiché. */}
            {detailVersement && (
              <DetailVersement payoutId={detailVersement}
                               L={L} money={money} lang={lang}
                               onClose={() => setDetailVersement(null)} />
            )}
          </div>
        )}

        {/* COMPLIANCE */}
        {tab === "compliance" && (
          <div className="space-y-6" data-testid="affiliate-compliance">
            <header>
              <h2 className="font-display text-[22px] font-bold text-nordfjord leading-tight">
                {L("Conformité", "Compliance")}
              </h2>
              <p className="text-[13px] text-glacier mt-1">
                {L("votre statut et vos obligations", "your status and your obligations")}
              </p>
            </header>
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
            <header>
              <h2 className="font-display text-[22px] font-bold text-nordfjord leading-tight">
                {L("Paramètres", "Settings")}
              </h2>
              <p className="text-[13px] text-glacier mt-1">
                {L("votre adresse de versement", "your payout address")}
              </p>
            </header>
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-1">
                {L("PARAMÈTRES DE PAIEMENT : USDT / USDC", "PAYOUT SETTINGS : USDT / USDC")}
              </p>
              <p className="text-xs text-glacier mb-5 leading-relaxed">
                {L("Fironova verse vos commissions en USDT ou USDC, sur Ethereum (ERC-20) ou Tron (TRC-20) selon l'adresse que vous indiquez. Le montant est converti à partir du CAD au taux officiel de la Banque du Canada le jour de l'exécution du paiement. Les frais de réseau sont déduits du versement : ils sont nettement plus faibles sur Tron.",
                   "Fironova pays your commissions in USDT or USDC, on Ethereum (ERC-20) or Tron (TRC-20) depending on the address you provide. Amounts are converted from CAD at the official Bank of Canada rate on the payout date. Network fees are deducted from the payout : they are markedly lower on Tron.")}
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
                        {L("✓ Adresse Tron (TRC-20) : frais de réseau plus faibles.",
                           "✓ Tron address (TRC-20) : lower network fees.")}
                      </p>
                    );
                  }
                  // Preview checksum EIP-55 (approximation client : le serveur valide définitivement).
                  const body = raw.slice(2);
                  const isChecksummed = body !== body.toLowerCase() && body !== body.toUpperCase();
                  return (
                    <p className={`mt-1.5 text-[11px] ${isChecksummed ? "text-success" : "text-warning"}`}>
                      {isChecksummed
                        ? L("✓ Adresse Ethereum checksummée : vérification EIP-55 à l'enregistrement.",
                            "✓ Checksummed Ethereum address : EIP-55 verification on save.")
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
                className="px-6 py-3  bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition disabled:opacity-50" style={{ borderRadius: "var(--r-m)" }}>
                {savingPay ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
              </button>
              {/* Tron RETIRE de la liste des reseaux interdits : le backend
                  l'accepte (_detect_payout_network renvoie 'trc20') et propage
                  le reseau au CSV NOWPayments. Le meme ecran confirmait plus
                  haut « ✓ Adresse Tron (TRC-20) : frais plus faibles » tout en
                  annoncant ici une perte definitive sur Tron : contradiction
                  dangereuse, susceptible de faire remplacer une adresse
                  parfaitement valide. Le reseau est deduit de l'adresse, pas
                  choisi separement : il n'y a donc rien a accorder. */}
              <p className="text-[10px] text-glacier/80 mt-4 leading-relaxed">
                {L("⚠️ Deux réseaux sont acceptés : Ethereum (adresse 0x…) et Tron (adresse T…). Envoyer sur tout autre réseau : BSC, Polygon, Solana : entraînera une perte définitive des fonds.",
                   "⚠️ Two networks are accepted: Ethereum (0x… address) and Tron (T… address). Sending on any other network : BSC, Polygon, Solana : will result in permanent loss.")}
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
            <div className="bg-white rounded-xl border border-ash p-6">
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-2">
                {L("MOT DE PASSE", "PASSWORD")}
              </p>
              {pwLess ? (
                <p className="text-xs text-glacier mb-4 leading-relaxed">
                  {L("Votre compte a été activé par invitation, sans mot de passe. Définissez-en un pour pouvoir vous connecter directement à l'avenir.",
                     "Your account was activated by invitation, without a password. Set one so you can sign in directly in the future.")}
                </p>
              ) : (
                <p className="text-xs text-glacier mb-4 leading-relaxed">
                  {L("Changez le mot de passe de votre compte.", "Change your account password.")}
                </p>
              )}
              {!pwLess && (
                <label className="block mb-3">
                  <span className="font-data text-xs text-glacier">{L("Mot de passe actuel", "Current password")}</span>
                  <input type="password" autoComplete="current-password"
                    value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })}
                    data-testid="affiliate-pw-current"
                    className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none" />
                </label>
              )}
              <label className="block mb-3">
                <span className="font-data text-xs text-glacier">{L("Nouveau mot de passe", "New password")}</span>
                <input type="password" autoComplete="new-password"
                  value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })}
                  data-testid="affiliate-pw-new"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none" />
                <span className="block mt-1 text-[10px] text-glacier/80">
                  {L("8 caractères minimum, avec une majuscule, une minuscule, un chiffre et un caractère spécial.",
                     "At least 8 characters, with uppercase, lowercase, a number and a special character.")}
                </span>
              </label>
              <label className="block mb-5">
                <span className="font-data text-xs text-glacier">{L("Confirmer le mot de passe", "Confirm password")}</span>
                <input type="password" autoComplete="new-password"
                  value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                  data-testid="affiliate-pw-confirm"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none" />
              </label>
              <button onClick={savePassword} disabled={savingPw}
                data-testid="affiliate-save-password"
                className="px-6 py-3  bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider hover:opacity-90 transition disabled:opacity-50" style={{ borderRadius: "var(--r-m)" }}>
                {savingPw ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
              </button>
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
  // ne peut évidemment pas vérifier qu'il a été LU : mais on peut refuser
  // l'affirmation à qui n'a même pas ouvert la page, et c'est déjà la
  // différence entre une case cochée par réflexe et un geste délibéré.
  const [luTermes, setLuTermes] = useState(false);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const complet = terms && age && research;

  // Fermer la fenêtre ne vaut lecture que si le bouton « J'ai lu » a été
  // utilisé : donc après défilement complet. Échap et le clic à l'extérieur
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
            trois jours lui fait croire que son compte s'est réinitialisé : et
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
              ouvert le texte ET l'avoir déroulé jusqu'au bas : le clic seul
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
                className="flex-1 text-center px-5 py-3  border border-ash font-data text-xs font-bold uppercase tracking-wider text-glacier hover:border-glacier transition" style={{ borderRadius: "var(--r-m)" }}>
            {L("Refuser", "Decline")}
          </Link>
          <button onClick={accepter} disabled={!complet || busy} data-testid="terms-submit"
                  className="flex-[2] px-5 py-3  bg-nova text-nordfjord font-data text-xs font-bold uppercase tracking-wider disabled:opacity-40 transition" style={{ borderRadius: "var(--r-m)" }}>
            {busy ? L("Enregistrement…", "Saving…") : L("Accepter et continuer", "Accept and continue")}
          </button>
        </div>
        <p className="font-data text-[11px] text-glacier">
          {L("Refuser vous ramène à l'accueil. Votre invitation reste valide : vous pourrez accepter plus tard.",
             "Declining returns you home. Your invitation stays valid : you can accept later.")}
        </p>
      </div>
    </div>
  );
}

// LES DEUX CHIFFRES QUI COMPTENT, ET ILS COMPTENT VRAIMENT.
//
// Mireille : « aucune profondeur, aucun dynamisme, aucune vie ». Cette carte
// posait un montant fini sur un fond plat, au meme plan que tout le reste.
//
// Trois choses la reveillent, et chacune DIT quelque chose :
//   — le montant compte jusqu'a sa valeur : la progression EST la lecture ;
//   — un filet de couleur court en haut, teinte au palier : la carte
//     appartient visiblement au compte de cette personne ;
//   — elle se leve de deux pixels au survol, avec son ombre : le relief
//     repond, au lieu de rester une image.
function KpiCard({ label, value, sub, accent, valeurBrute, format, teinte }) {
  return (
    <div
      style={{
        boxShadow: accent ? "var(--ombre-leve)" : "var(--ombre-pose)",
        // Meme traitement que CarteAffilie : la carte accent restait un
        // panneau BLANC eclatant en mode nuit. Surface marine constante,
        // jetons de texte figes sur les valeurs de jour.
        ...(accent ? { "--fn-clinical": "247 250 252", "--fn-mist": "183 202 221" } : {}),
      }}
      className={`relative overflow-hidden rounded-xl border p-5
                  transition-[transform,box-shadow] duration-200 ease-out
                  hover:-translate-y-0.5 ${
        accent ? "bg-marine border-marine" : "bg-white border-ash"}`}>
      {/* Le filet de tete : un degrade qui s'eteint vers la droite, pour que
          la couleur signe la carte sans la souligner comme un onglet. */}
      {teinte && (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: `linear-gradient(90deg, ${teinte} 0%, transparent 85%)` }} />
      )}
      <p className={`font-data text-[10px] font-semibold uppercase tracking-[0.2em] mb-2 ${accent ? "text-nova" : "text-glacier"}`}>
        {label}
      </p>
      {valeurBrute != null && format ? (
        <ChiffreAnime valeur={valeurBrute} format={format}
          className={`block font-display text-[26px] sm:text-[30px] font-bold leading-none tracking-[-0.02em] ${accent ? "text-white" : "text-nordfjord"}`} />
      ) : (
        <p className={`font-display text-[26px] sm:text-[30px] font-bold leading-none tracking-[-0.02em] ${accent ? "text-white" : "text-nordfjord"}`}>{value}</p>
      )}
      {/* Devise ou precision. Sans elle, rien ne distingue un montant en CAD
          d'un montant en USD sur un ecran ou les deux coexistent. */}
      {sub && (
        <p className={`font-data text-[10px] uppercase tracking-[0.16em] mt-2 ${accent ? "text-mist" : "text-glacier"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function MiniInsight({ label, value, fenetre }) {
  return (
    <div className="rounded-xl border border-ash bg-white px-4 py-3">
      <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-glacier mb-1">{label}</p>
      <p className="font-display text-xl font-bold text-nordfjord tabular-nums">{value}</p>
      {fenetre && (
        <p className="font-data text-[10px] text-glacier mt-0.5">{fenetre}</p>
      )}
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

// « AAAA-MM » -> « août 2026 ». Un mois écrit en chiffres oblige a le
// décoder ; écrit en toutes lettres, il se lit.
// Ce qui doit partir, et ce qui attend. La couleur ne sert qu'au retard :
// partout ailleurs, la hiérarchie passe par la taille et le blanc.
function CycleVersement({ cycle, seuil, adresse, onReglages, L, lang }) {
  const du = Number(cycle?.due_now || 0);
  const enCours = Number(cycle?.current_cycle || 0);
  const retard = !!cycle?.overdue && du > 0;
  const sousLeSeuil = seuil != null && du > 0 && du < Number(seuil);
  /* SANS ADRESSE, RIEN NE PART — et personne ne le disait.
     L'envoi cree bien le versement, puis le saute : « missing address or
     unsupported currency ». L'affilie lisait « En cours » indefiniment. La
     visite guidee l'explique une fois, au tout debut ; apres, plus rien. Et
     l'administration a un compteur `no_payout_address` : la seule personne
     qui peut regler le probleme etait la seule a ne pas le savoir.

     Conditionne a `du > 0` : annoncer « ajoutez votre adresse » a quelqu'un
     qui n'a encore rien gagne est du bruit, et le bruit fait ignorer le
     signal le jour ou il compte. */
  const sansAdresse = du > 0 && !String(adresse || "").trim();

  return (
    <div className="bg-white rounded-xl border border-ash p-6" data-testid="cycle-versement">
      <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-5">
        {L("PROCHAIN VERSEMENT", "NEXT PAYOUT")}
      </p>

      <div className="flex items-baseline justify-between gap-6 flex-wrap">
        <p className="font-display text-[28px] font-semibold text-nordfjord tabular-nums"
           data-testid="cycle-du">
          {money(du)}
        </p>
        <div className="text-right">
          <p className="font-data text-xs uppercase tracking-[0.14em] text-glacier">
            {L(`À verser · ${moisLisible(cycle?.period, lang)}`,
               `To be paid · ${moisLisible(cycle?.period, lang)}`)}
          </p>
          <p className={`font-data text-xs mt-1 ${retard ? "text-error" : "text-glacier"}`}
             data-testid="cycle-echeance">
            {retard
              ? L("En retard : l'échéance est passée",
                   "Overdue : the deadline has passed")
              : L(`Avant le ${jourLisible(cycle?.due_by, lang)} · ${cycle?.days_left} jour(s)`,
                   `By ${jourLisible(cycle?.due_by, lang)} · ${cycle?.days_left} day(s)`)}
          </p>
        </div>
      </div>

      {/* LA DEDUCTION EST DITE, jamais subie.
          MIREILLE, 02/10/2026 : « the commission to be paid is not updated,
          that does not make sense since we have to get back some of what was
          overpaid in a previous payout ».
          Une commande remboursée APRÈS son versement laisse une créance :
          l'argent est parti, la vente n'a pas eu lieu. Le montant annoncé est
          désormais NET de cette dette — et un montant plus bas que ses
          commissions validées, sans un mot pour l'expliquer, se lit comme une
          erreur. On montre donc les trois nombres : ce qui est acquis, ce qui
          est déduit, ce qui part. */}
      {Number(cycle?.creance || 0) > 0 && (
        <div className="mt-3 rounded-lg border border-warning/35 bg-warning/[0.06] p-3"
             data-testid="cycle-creance">
          <p className="font-data text-[11px] text-nordfjord leading-relaxed">
            {L(`${money(cycle.acquis)} de commissions validées, moins ${money(cycle.creance)} déjà versés sur des commandes remboursées depuis.`,
               `${money(cycle.acquis)} in validated commissions, less ${money(cycle.creance)} already paid on orders refunded since.`)}
          </p>
          <p className="font-data text-[11px] text-glacier mt-1 leading-relaxed">
            {L("Ces ventes n'ont pas eu lieu : la commission suit la vente, et le montant avait déjà été versé.",
               "Those sales did not happen: commission follows the sale, and the amount had already been paid out.")}
          </p>
          {Number(cycle?.creance_reportee || 0) > 0 && (
            /* La dette dépasse l'acquis : rien ne part ce cycle-ci, et le
               reste suit. Le taire ferait croire à un versement oublié. */
            <p className="font-data text-[11px] text-warning mt-1.5 leading-relaxed"
               data-testid="cycle-creance-reportee">
              {L(`Il reste ${money(cycle.creance_reportee)} à reporter sur le cycle suivant.`,
                 `${money(cycle.creance_reportee)} remains to carry to the next cycle.`)}
            </p>
          )}
        </div>
      )}

      {sansAdresse && (
        <div className="mt-3 rounded-lg border border-error/35 bg-error/[0.06] p-3"
             data-testid="cycle-sans-adresse">
          <p className="font-data text-[11px] font-semibold text-error leading-relaxed">
            {L("Ce versement ne pourra pas partir : il manque votre adresse de paiement.",
               "This payout cannot go out: your payout address is missing.")}
          </p>
          <p className="font-data text-[11px] text-glacier mt-1 leading-relaxed">
            {L("Vos commissions restent acquises et s'accumulent — mais sans adresse de portefeuille, nous n'avons aucun moyen de vous les envoyer.",
               "Your commissions stay earned and keep adding up — but without a wallet address we have no way to send them to you.")}
          </p>
          {onReglages && (
            <button onClick={onReglages} type="button"
              className="mt-2.5 px-3 py-1.5 rounded-md bg-nordfjord text-white font-data
                         text-[11px] font-semibold active:scale-[0.97] transition-transform"
              style={{ touchAction: "manipulation" }}
              data-testid="cycle-aller-reglages">
              {L("Ajouter mon adresse", "Add my address")}
            </button>
          )}
        </div>
      )}

      {sousLeSeuil && (
        <p className="font-data text-[11px] text-warning mt-3" data-testid="cycle-sous-seuil">
          {L(`Sous le seuil de ${money(seuil)} : le montant est reporté au cycle suivant.`,
             `Below the ${money(seuil)} threshold: this amount rolls over to the next cycle.`)}
        </p>
      )}

      <div className="border-t border-ash mt-5 pt-4 flex items-baseline justify-between gap-6 flex-wrap">
        <p className="font-display text-xl font-bold text-glacier tabular-nums"
           data-testid="cycle-en-cours">
          {money(enCours)}
        </p>
        <p className="font-data text-xs uppercase tracking-[0.14em] text-glacier text-right">
          {L(`En cours · ${moisLisible(cycle?.current_period, lang)} : versé au cycle suivant`,
             `In progress · ${moisLisible(cycle?.current_period, lang)} : paid next cycle`)}
        </p>
      </div>
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
            {L("Commande", "Order")} <span className="font-semibold">{e.label || "-"}</span>
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
          {L("Paiement", "Payout")} <span className="font-semibold">{e.label || "-"}</span>
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

function ReferralTable({ rows, lang, L, money, loading }) {
  if (!loading && !rows.length) {
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
        {loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ash/60">
                <td className="px-6 py-3 font-data text-nordfjord">{r.order_number || "-"}</td>
                <td className="px-6 py-3 text-glacier">{money(r.base_amount)}</td>
                <td className="px-6 py-3 font-semibold text-nordfjord">{money(r.commission_amount)}</td>
                <td className="px-6 py-3"><ReferralStatus status={r.status} lang={lang} /></td>
                <td className="px-6 py-3 font-data text-[11px] text-glacier">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        )}
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

/**
 * L'ÉTAT D'UN VERSEMENT, DU POINT DE VUE DE L'AFFILIÉ.
 *
 * MIREILLE, 01/10/2026 : « on ne devrait pas voir comment cela a été payé » —
 * précisé : « je parle de la méthode, manuel ou autre, j'ai vu que c'était
 * indiqué manuel ».
 *
 * Cette table était un MIROIR 1:1 des états internes : « En file (manuel) »,
 * « Payé (manuel) », « Traitement », « Envoi en cours ». La façon dont le
 * virement a été exécuté — lot automatisé ou geste à la main — est de la
 * plomberie. Pour l'affilié, `paid` et `paid_manual` sont le même fait : il a
 * son argent.
 *
 * ET DEUX ÉTATS ÉCRITS EN BASE N'Y FIGURAIENT PAS. `creating` et `review`
 * tombaient sur `map.ready` : un versement RETENU EN VÉRIFICATION s'affichait
 * « Prêt ». C'est le plus grave des deux défauts, parce qu'il ne laissait pas
 * fuir de la plomberie — il cachait un blocage.
 *
 * `review` et `failed` sont réunis : pour l'affilié il n'y a aucune
 * différence, l'argent n'est pas parti et c'est à nous d'agir. Mais ils ne
 * sont pas TUS, parce qu'un versement bloqué touche son argent et que le
 * silence serait pire que le jargon.
 *
 * L'écran faisait exactement l'inverse : du jargon sur ce qui ne le concerne
 * pas, et du silence sur ce qui le concerne.
 */
/* La projection et les libellés vivent dans `lib/statutVersement.js` : la
   même table existait ici, dans AdminPayouts, et NULLE PART dans la fiche —
   qui affichait donc le jeton anglais brut. Voir l'en-tête du module. */

/**
 * Les champs d'un versement, préparés UNE fois pour les deux rendus.
 *
 * L'historique s'affiche en cartes sous `sm` et en table au-delà. Répéter la
 * préparation dans les deux balisages, c'est garantir qu'un jour l'un dira la
 * période couverte et l'autre l'étiquette de run.
 */
function versementLisible(p, lang) {
  const devise = String(p.currency || "").toLowerCase();
  const jetonConnu = ["usdt", "usdc"].includes(devise);
  const recu = p.amount;
  return {
    // Repli pour les versements anciens sans champs de conversion.
    cad: p.amount_cad ?? p.amount,
    // LA PÉRIODE COUVERTE, avec l'étiquette de run en dernier recours : mieux
    // vaut un mois approximatif qu'une case vide sur un relevé d'argent.
    periode: periodeLisible(p.periode_couverte, lang, moisLisible(p.period, lang)),
    paye: p.paid_at ? momentLisible(p.paid_at, lang) : null,
    // La quantité de jetons n'a de sens qu'avec sa devise : un nombre nu, sur
    // un écran où tout est en dollars, se lit comme un second montant CAD.
    recuLisible: recu != null && devise
      ? `${jetonConnu ? Number(recu).toFixed(2) : recu} ${devise.toUpperCase()}`
      : "",
    fx: p.fx_rate_cad_to_usd,
    source: p.fx_source,
  };
}

function PayoutStatus({ status, lang }) {
  // UN ÉTAT INCONNU VAUT « EN COURS », jamais « Prêt » — la règle est dans
  // `etatVersement`. Affirmer un état précis à partir de rien est précisément
  // ce qui a fait annoncer « Prêt » pour un versement en vérification.
  const m = libelleVersement(status, lang);
  /* UN ECHEC A DEJA RENDU SES COMMISSIONS, et le taire se lisait comme une
     erreur. Le webhook remet `payout_id` a None sur les lignes approuvees :
     elles repartent donc dans le cycle suivant. Sans cette phrase, l'affilie
     voyait un versement « en vérification » ET le meme montant recompte dans
     son prochain cycle — deux fois le meme argent a l'ecran, ce qui ressemble
     a une erreur meme quand il n'y en a pas.

     La note est ici, dans le badge, parce que l'historique se rend DEUX fois
     (cartes sous `sm`, table au-dela) : l'ecrire dans chaque balisage, c'est
     garantir qu'un jour l'un la dira et l'autre pas. `basis-full` la fait
     tomber a la ligne dans la rangee en flex de la carte. */
  const rendues = commissionsRenduesAuCycle(status);
  return (
    <>
      <span className={`px-2.5 py-1 rounded-full font-data text-[10px] font-semibold ${m.cls}`}
            data-testid="payout-status">
        {m.texte}
      </span>
      {rendues && (
        <p className="basis-full font-data text-[11px] text-glacier mt-1 leading-relaxed"
           data-testid="payout-rendu-au-cycle">
          {lang === "fr"
            ? "L'envoi n'a pas abouti. Ces commissions sont reparties dans votre prochain versement : rien n'est perdu."
            : "The transfer did not go through. These commissions went back into your next payout: nothing is lost."}
        </p>
      )}
    </>
  );
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
