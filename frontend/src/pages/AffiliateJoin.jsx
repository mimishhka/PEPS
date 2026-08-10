// frontend/src/pages/AffiliateJoin.jsx — Activation d'un compte affilié via
// le token d'invitation. Requiert une session correspondant à l'email invité.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";

export default function AffiliateJoin() {
  useDocumentHead({ title: "Activation affilié", path: "/affiliate/join", noindex: true });
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const { user, checking, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("idle"); // idle | joining | error | success
  const [errorMsg, setErrorMsg] = useState("");
  const [payAddr, setPayAddr] = useState("");
  const [payCur, setPayCur] = useState("btc");
  const ran = useRef(false);

  const token = new URLSearchParams(location.search).get("token") || "";

  const doJoin = async () => {
    setStatus("joining");
    setErrorMsg("");
    try {
      await api.post("/affiliate/join", {
        token,
        payout_address: payAddr.trim(),
        payout_currency: payCur,
      });
      await refresh();
      setStatus("success");
      setTimeout(() => navigate("/affiliate", { replace: true }), 1200);
    } catch (e) {
      setErrorMsg(formatApiError(e.response?.data?.detail) || e.message);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (ran.current) return;
    if (!token) {
      ran.current = true;
      setStatus("error");
      setErrorMsg(L("Lien invalide.", "Invalid link."));
      return;
    }
    const cleanUrl = `${location.pathname}${location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
  }, [token, location.pathname, location.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="min-h-[85vh] grid place-items-center bg-clinical px-6">
        <div className="h-10 w-10 rounded-full border-2 border-ash border-t-nova animate-spin" />
      </div>
    );
  }

  // Non connecté : on invite à se connecter avec l'email de l'invitation.
  if (!user) {
    const next = "/affiliate/join";
    return (
      <div className="min-h-[85vh] grid place-items-center bg-clinical px-6" data-testid="affiliate-join">
        <div className="relative w-full max-w-md rounded-3xl border border-ash bg-white p-10 overflow-hidden text-center">
          <div className="absolute inset-0 opacity-10"><MolecularMesh opacity={0.4} /></div>
          <div className="relative">
            <div className="flex items-center justify-center gap-3 mb-8">
              <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
              <Wordmark size={16} color="#0B2E4F" />
            </div>
            <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2">
              {L("Activez votre compte affilié", "Activate your affiliate account")}
            </h1>
            <p className="text-sm text-glacier mb-8">
              {L("Connectez-vous avec l'adresse courriel qui a reçu cette invitation pour continuer.",
                "Sign in with the email address that received this invitation to continue.")}
            </p>
            <Link to={`/login?next=${encodeURIComponent(next)}`} className="inline-block btn-pill btn-nova" data-testid="affiliate-join-login">
              {L("Se connecter", "Sign in")} &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] grid place-items-center bg-clinical px-6" data-testid="affiliate-join">
      <div className="relative w-full max-w-md rounded-3xl border border-ash bg-white p-10 overflow-hidden">
        <div className="absolute inset-0 opacity-10"><MolecularMesh opacity={0.4} /></div>
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-8">
            <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={16} color="#0B2E4F" />
          </div>

          {status === "success" ? (
            <div className="text-center">
              <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2">
                {L("Compte activé ✓", "Account activated ✓")}
              </h1>
              <p className="text-sm text-glacier">{L("Redirection vers votre tableau de bord…", "Redirecting to your dashboard…")}</p>
            </div>
          ) : (
            <>
              <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2 text-center">
                {L("Finaliser l'activation", "Finish activation")}
              </h1>
              <p className="text-sm text-glacier mb-6 text-center">
                {L(`Connecté en tant que ${user.email}`, `Signed in as ${user.email}`)}
              </p>

              <label className="block mb-4">
                <span className="font-data text-xs text-glacier">{L("Adresse crypto de réception (optionnel)", "Crypto receiving address (optional)")}</span>
                <input value={payAddr} onChange={(e) => setPayAddr(e.target.value)} placeholder="bc1q…"
                  data-testid="affiliate-join-address"
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none" />
              </label>
              <label className="block mb-6">
                <span className="font-data text-xs text-glacier">{L("Devise", "Currency")}</span>
                <select value={payCur} onChange={(e) => setPayCur(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ash px-4 py-3 font-data text-sm text-nordfjord focus:border-nova outline-none">
                  <option value="btc">BTC</option>
                  <option value="eth">ETH</option>
                  <option value="usdttrc20">USDT (TRC20)</option>
                  <option value="usdterc20">USDT (ERC20)</option>
                  <option value="ltc">LTC</option>
                </select>
              </label>

              {status === "error" && (
                <p className="text-sm text-error mb-4 text-center" data-testid="affiliate-join-error">{errorMsg}</p>
              )}

              <button onClick={doJoin} disabled={status === "joining"}
                data-testid="affiliate-join-submit"
                className="w-full btn-pill btn-nova disabled:opacity-50">
                {status === "joining" ? L("Activation…", "Activating…") : L("Activer mon compte", "Activate my account")}
              </button>
              <p className="font-data text-[11px] text-glacier mt-4 text-center leading-relaxed">
                {L("Vous pourrez modifier ces informations plus tard depuis votre tableau de bord.",
                  "You can change these details later from your dashboard.")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
