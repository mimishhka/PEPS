import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { ThemeProvider } from "@/contexts/ThemeContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Rejets de promesse non attrapés.
//
// La surcouche de développement affichait « [object Object] » à chaque
// chargement d'un écran admin. Ce libellé vient de webpack-dev-server, qui fait
// « error instanceof Error ? error : new Error(error) » : tout rejet ne portant
// pas une Error se réduit donc à cette chaîne, qui n'apprend rien.
//
// Deux traitements, volontairement dissymétriques :
//
//   — Un 401 sur une sonde d'authentification est une RÉPONSE, pas un incident.
//     /admin/autologin demande « ai-je déjà une session ? » ; /auth/refresh
//     tente de la renouveler. « Non » est un résultat normal quand personne
//     n'est connecté, et n'a rien à faire dans un bandeau d'erreur.
//
//   — Tout le reste est journalisé avec son URL, son statut et son objet
//     d'origine, puis laissé remonter. On rend lisible, on ne masque pas.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const status = reason?.response?.status;
  const url = String(reason?.config?.url || "");
  const isAuthProbe =
    status === 401 && /\/admin\/autologin|\/auth\/refresh|\/auth\/me/.test(url);

  if (isAuthProbe) {
    event.preventDefault();
    return;
  }

  console.error("[rejet non attrapé]", {
    url: url || null,
    statut: status ?? null,
    message: reason?.message ?? String(reason),
    estError: reason instanceof Error,
    origine: reason,
  });
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {/* ThemeProvider enveloppe TOUT : la classe qu'il pose vit sur <html>, et
        s'applique donc aussi bien à la boutique qu'à l'administration et à
        l'espace affilié. Un seul point de décision pour tout le site. */}
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
