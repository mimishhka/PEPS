import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, Wordmark, FnMark } from "../components/brand";
import { sanitizeRedirectTarget } from "../lib/redirects";

export default function AuthCallback() {
  useDocumentHead({ title: "Connexion", path: "/auth/callback", noindex: true });
  const { t } = useLang();
  const { verifyMagic } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("loading"); // loading | error
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = new URLSearchParams(location.search).get("token");
    if (!token) { setStatus("error"); return; }
    const redirectTo = sanitizeRedirectTarget("/account", "/account");
    const cleanUrl = `${location.pathname}${location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
    (async () => {
      const res = await verifyMagic(token);
      if (res.ok) navigate(redirectTo, { replace: true });
      else setStatus("error");
    })();
  }, [location.search, navigate, verifyMagic]);

  return (
    <div className="min-h-[85vh] grid place-items-center bg-clinical px-6" data-testid="auth-callback">
      <div className="relative w-full max-w-md rounded-3xl border border-ash bg-white p-10 overflow-hidden text-center">
        <div className="absolute inset-0 opacity-10"><MolecularMesh opacity={0.4} /></div>
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-8">
            <FnMark size={26} frame="#00B8D4" spark="#00B8D4" />
            <Wordmark size={16} color="#0B2E4F" />
          </div>
          {status === "loading" ? (
            <>
              <div className="mx-auto mb-6 h-10 w-10 rounded-full border-2 border-ash border-t-nova animate-spin" />
              <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2">
                {t("auth.verifying") || "Vérification du lien…"}
              </h1>
              <p className="text-sm text-glacier">
                {t("auth.verifyingSub") || "Un instant, on ouvre votre session."}
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-[24px] font-bold text-nordfjord mb-2">
                {t("auth.magicExpired") || "Lien invalide ou expiré"}
              </h1>
              <p className="text-sm text-glacier mb-8">
                {t("auth.magicExpiredSub") || "Les liens sont à usage unique et durent 15 minutes. Demandez-en un nouveau."}
              </p>
              <Link to="/login" className="inline-block btn-pill btn-nova" data-testid="callback-retry">
                {t("auth.signin") || "Connexion"} &rarr;
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
