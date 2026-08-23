import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import api, { formatApiError } from "../lib/api";

/**
 * Newsletter double opt-in confirmation landing page.
 * Called from the confirmation email link : /newsletter/confirm/:token?lang=fr|en
 * Auto-submits GET /api/newsletter/confirm/{token} on mount.
 */
export default function NewsletterConfirm() {
  const { token } = useParams();
  const [search] = useSearchParams();
  const lang = search.get("lang") === "fr" ? "fr" : "en";
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [state, setState] = useState("loading"); // loading | ok | already | expired | error
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/newsletter/confirm/${encodeURIComponent(token)}`);
        if (cancelled) return;
        setEmail(data?.email || "");
        setState(data?.already_confirmed ? "already" : "ok");
      } catch (err) {
        if (cancelled) return;
        const code = err?.response?.status;
        const msg = formatApiError(err?.response?.data?.detail) || err.message;
        setErrorMsg(msg);
        setState(code === 410 ? "expired" : "error");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const content = {
    loading: {
      icon: <Clock size={40} className="text-nova animate-pulse" />,
      title: L("Confirmation en cours…", "Confirming…"),
      body: L("Merci de patienter quelques instants.", "Please wait a moment."),
    },
    ok: {
      icon: <CheckCircle2 size={40} className="text-emerald-600" />,
      title: L("Inscription confirmée", "Subscription confirmed"),
      body: email
        ? L(`${email} est maintenant abonné à notre newsletter.`, `${email} is now subscribed to our newsletter.`)
        : L("Votre inscription est confirmée.", "Your subscription is confirmed."),
    },
    already: {
      icon: <CheckCircle2 size={40} className="text-emerald-600" />,
      title: L("Déjà confirmé", "Already confirmed"),
      body: L("Votre inscription était déjà active. Merci !", "Your subscription was already active. Thank you!"),
    },
    expired: {
      icon: <Clock size={40} className="text-amber-600" />,
      title: L("Lien expiré", "Link expired"),
      body: L(
        "Ce lien de confirmation a expiré. Réinscrivez-vous depuis la page d'accueil pour recevoir un nouveau lien.",
        "This confirmation link has expired. Please subscribe again from the home page to receive a new link."
      ),
    },
    error: {
      icon: <XCircle size={40} className="text-red-600" />,
      title: L("Erreur", "Error"),
      body: errorMsg || L("Une erreur est survenue.", "Something went wrong."),
    },
  }[state];

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" data-testid="newsletter-confirm-page">
      <div className="max-w-md w-full rounded-xl border border-nova/20 bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center mb-4">{content.icon}</div>
        <h1 className="text-2xl font-semibold text-nordfjord mb-2" data-testid="confirm-title">{content.title}</h1>
        <p className="text-compliance mb-6" data-testid="confirm-body">{content.body}</p>
        <Link
          to="/"
          data-testid="confirm-home-link"
          className="btn-pill btn-nova inline-flex items-center gap-2">
          {L("Retour à l'accueil", "Return to home")}
        </Link>
      </div>
    </div>
  );
}
