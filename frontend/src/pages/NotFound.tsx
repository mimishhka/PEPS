import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

export default function NotFound() {
  const { t } = useLang();
  useDocumentHead({
    title: "404",
    description: "Page not found.",
    noindex: true,
  });

  return (
    <div className="p-16 flex flex-col items-start gap-6" data-testid="notfound-page">
      <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">
        // 404
      </div>
      <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight">
        {t("notfound.title") !== "notfound.title" ? t("notfound.title") : "Page not found"}
      </h1>
      <p className="max-w-md text-foreground/70">
        {t("notfound.body") !== "notfound.body"
          ? t("notfound.body")
          : "The page you are looking for does not exist or has moved."}
      </p>
      <Link
        to="/"
        className="inline-block bg-ink text-white font-mono text-xs uppercase tracking-[0.2em] px-6 py-4 hover:bg-foreground/90 transition-colors"
        data-testid="notfound-home-link"
      >
        ← {t("nav.home") !== "nav.home" ? t("nav.home") : "Home"}
      </Link>
    </div>
  );
}
