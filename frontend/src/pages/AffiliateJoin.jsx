// frontend/src/pages/AffiliateJoin.jsx — Activation MAGIC-LINK 1-CLIC.
// Le clic sur le lien d'invitation active le compte (passwordless),
// pose la session dans un cookie httpOnly et redirige sur /affiliate.
// Aucun gate connexion, aucun mot de passe.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";

export default function AffiliateJoin() {
  useDocumentHead({ title: "Activation affilié", path: "/affiliate/join", noindex: true });
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("activating"); // activating | error | success
  const [errorMsg, setErrorMsg] = useState("");
  const ran = useRef(false);

  const token = new URLSearchParams(location.search).get("token") || "";

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
      if (!token) {
        setStatus("error");
        setErrorMsg(lang === "fr" ? "Lien invalide." : "Invalid link.");
        return;
      }
    // Nettoie l'URL immédiatement pour ne pas laisser le token visible.
    const cleanUrl = `${location.pathname}${location.hash}`;
    window.history.replaceState({}, "", cleanUrl);

    (async () => {
      try {
        await api.post("/affiliate/join", { token });
        await refresh();
        setStatus("success");
        setTimeout(() => navigate("/affiliate", { replace: true }), 1200);
      } catch (e) {
        setErrorMsg(formatApiError(e.response?.data?.detail) || e.message);
        setStatus("error");
      }
    })();
  }, [token, location.pathname, location.hash, navigate, refresh, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-[85vh] grid place-items-center bg-clinical px-6" data-testid="affiliate-join">
      <div className="relative w-full max-w-md rounded-3xl border border-ash bg-white p-10 overflow-hidden">
        <div className="absolute inset-0 opacity-10"><MolecularMesh opacity={0.4} /></div>
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-8">
            <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={16} color="#0B2E4F" />
          </div>

          {status === "activating" && (
            <div className="text-center">
              <div className="h-10 w-10 rounded-full border-2 border-ash border-t-nova animate-spin mx-auto mb-6" />
              <h1 className="font-display text-[22px] font-bold text-nordfjord mb-2">
                {L("Activation de votre compte…", "Activating your account…")}
              </h1>
              <p className="text-sm text-glacier">
                {L("Cela ne prend qu'un instant.", "This only takes a moment.")}
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-nova/15 text-nova flex items-center justify-center text-3xl font-bold mx-auto mb-6">✓</div>
              <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2">
                {L("Bienvenue chez Fironova", "Welcome to Fironova")}
              </h1>
              <p className="text-sm text-glacier">
                {L("Redirection vers votre tableau de bord…", "Redirecting to your dashboard…")}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center" data-testid="affiliate-join-error">
              <div className="w-14 h-14 rounded-full bg-error/15 text-error flex items-center justify-center text-2xl font-bold mx-auto mb-6">!</div>
              <h1 className="font-display text-[22px] font-bold text-nordfjord mb-2">
                {L("Activation impossible", "Activation failed")}
              </h1>
              <p className="text-sm text-glacier mb-6">{errorMsg}</p>
              <p className="font-data text-[11px] text-glacier">
                {L("Si le problème persiste, contactez l'équipe Fironova.",
                   "If the problem persists, contact the Fironova team.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
