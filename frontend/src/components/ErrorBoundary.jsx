// frontend/src/components/ErrorBoundary.jsx
// Capture toute erreur de rendu React et affiche une page propre au lieu d'un
// écran blanc. Bilingue FR/EN, identité NOVA. Composant de classe (obligatoire
// pour componentDidCatch — les hooks ne peuvent pas capturer les erreurs enfant).
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Journalisation locale. En prod, on pourrait relayer vers un service
    // (Sentry, etc.) ici — mais jamais exposer la stack à l'utilisateur.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // FR/EN sans dépendre du contexte (il pourrait être la source du crash).
    const lang = (typeof navigator !== "undefined" && navigator.language || "en")
      .toLowerCase().startsWith("fr") ? "fr" : "en";
    const t = {
      fr: {
        title: "Une erreur est survenue",
        body: "Quelque chose s'est mal passé de notre côté. Vous pouvez recharger la page ou revenir à l'accueil.",
        cta: "Retour à l'accueil",
        ruo: "Produits destinés à la recherche uniquement (RUO) · 19+",
      },
      en: {
        title: "Something went wrong",
        body: "An unexpected error occurred on our side. You can reload the page or return home.",
        cta: "Back to home",
        ruo: "For Research Use Only (RUO) · 19+",
      },
    }[lang];

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#F7FAFC", padding: "24px",
        fontFamily: "Inter, -apple-system, Segoe UI, sans-serif",
      }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
            fontSize: 22, color: "#0B2E4F", letterSpacing: "-0.02em", marginBottom: 24,
          }}>
            FIRONOVA<span style={{ color: "#00B8D4" }}> ·</span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700,
            color: "#0B2E4F", margin: "0 0 12px",
          }}>{t.title}</h1>
          <p style={{ color: "#3E5C76", fontSize: 15, lineHeight: 1.6, margin: "0 0 28px" }}>{t.body}</p>
          <button onClick={this.handleReload} style={{
            background: "#00B8D4", color: "#0B2E4F", fontWeight: 700,
            border: "none", padding: "13px 30px", borderRadius: 999,
            fontSize: 15, cursor: "pointer",
          }}>{t.cta}</button>
          <p style={{
            color: "#94A3B8", fontSize: 11, marginTop: 32,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
          }}>{t.ruo}</p>
        </div>
      </div>
    );
  }
}
