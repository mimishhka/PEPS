// La langue demandée par le lien.
//
// MIREILLE, 01/10/2026 : « si je choisis une langue pour mon affilié, il
// recevra le courriel dans la langue demandée, sauf que le lien ne redirige
// pas vraiment vers la page dans la bonne langue — pareil lorsque la personne
// utilise le lien magique pour se connecter ».
//
// La langue ne venait que de localStorage, avec l'anglais par défaut. Un
// affilié francophone qui n'avait JAMAIS visité le site n'avait donc rien en
// mémoire : courriel en français, page en anglais.
//
// SUR MOBILE, c'est encore plus net : un lien ouvert depuis Gmail ou Mail
// s'affiche dans un navigateur intégré, un contexte de stockage NEUF où
// localStorage est vide. Le paramètre d'URL est la seule chose qui survive au
// passage du courriel à la page.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LanguageProvider, useLang } from "./LanguageContext";

jest.mock("../lib/i18n", () => ({ t: (lang, path) => `${lang}:${path}` }));

function Sonde() {
  const { lang, toggle } = useLang();
  return (
    <div>
      <span data-testid="langue">{lang}</span>
      <button onClick={toggle} data-testid="basculer">x</button>
    </div>
  );
}

/* La langue est lue dans l'initialiseur du `useState`, donc UNE SEULE FOIS au
 * premier rendu. L'URL doit être en place avant, comme elle l'est quand le
 * navigateur ouvre le lien du courriel. */
const arriverSur = (recherche) => {
  window.history.replaceState({}, "", `/auth/callback${recherche}`);
  render(<LanguageProvider><Sonde /></LanguageProvider>);
};

const langue = () => screen.getByTestId("langue").textContent;

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("le lien impose la langue", () => {
  test("LE CAS DE MIREILLE : un lien en français ouvre le site en français", () => {
    // Rien en mémoire : c'est la situation d'un affilié qui reçoit son
    // invitation sans avoir jamais visité le site.
    arriverSur("?token=abc&lang=fr");
    expect(langue()).toBe("fr");
  });

  test("et un lien en anglais, en anglais", () => {
    window.localStorage.setItem("fironova_lang", "fr");
    arriverSur("?token=abc&lang=en");
    expect(langue()).toBe("en");
  });

  test("le lien l'emporte sur la préférence retenue", () => {
    /* Volontaire. Qui reçoit un courriel en français veut lire le site en
     * français — même si ce navigateur avait servi à quelqu'un d'autre, ce qui
     * arrive sur un ordinateur partagé. Le sélecteur reste là pour changer. */
    window.localStorage.setItem("fironova_lang", "en");
    arriverSur("?token=abc&lang=fr");
    expect(langue()).toBe("fr");
  });

  test("« fr-CA » vaut « fr »", () => {
    // Les deux premières lettres suffisent : un client de courriel ou un
    // partage peut rallonger le code.
    arriverSur("?lang=fr-CA");
    expect(langue()).toBe("fr");
  });

  test("la casse n'a pas d'importance", () => {
    arriverSur("?lang=FR");
    expect(langue()).toBe("fr");
  });
});

describe("ce que le lien ne doit PAS pouvoir faire", () => {
  test("une langue inconnue est ignorée, la préférence tient", () => {
    // Plutôt que de remplacer un choix exprimé par quelque chose
    // d'incompréhensible.
    window.localStorage.setItem("fironova_lang", "fr");
    arriverSur("?lang=de");
    expect(langue()).toBe("fr");
  });

  test("un paramètre vide ne change rien", () => {
    window.localStorage.setItem("fironova_lang", "fr");
    arriverSur("?lang=");
    expect(langue()).toBe("fr");
  });
});

describe("sans paramètre, rien ne change", () => {
  test("la préférence retenue s'applique", () => {
    window.localStorage.setItem("fironova_lang", "fr");
    arriverSur("?token=abc");
    expect(langue()).toBe("fr");
  });

  test("sans rien du tout, le repli", () => {
    arriverSur("");
    expect(langue()).toBe("en");
  });
});

describe("la langue est retenue", () => {
  test("le lien l'inscrit pour la navigation qui suit", async () => {
    // Sinon la page d'arrivée serait en français et la suivante en anglais.
    arriverSur("?lang=fr");
    expect(window.localStorage.getItem("fironova_lang")).toBe("fr");
  });

  test("le sélecteur garde le dernier mot", async () => {
    arriverSur("?lang=fr");
    await userEvent.click(screen.getByTestId("basculer"));
    expect(langue()).toBe("en");
    expect(window.localStorage.getItem("fironova_lang")).toBe("en");
  });
});
