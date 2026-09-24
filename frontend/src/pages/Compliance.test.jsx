// Les deux promesses publiques qui doivent coller au code.
//
// Le 2026-09-23, les pages disaient « avant 14 h » alors que le code applique
// ORDER_CUTOFF_HOUR=13 par défaut : une commande payée à 13 h 30 était annoncée
// jour même et traitée le lendemain. La décision a été prise : c'est 13 h, et
// les pages sont corrigées. Ce test verrouille la décision.
//
// Même verrou pour le délai de paiement : 30 minutes. Le « 48 h » de l'ancien
// plan de test ne doit jamais ressurgir DANS LA PHRASE DU PAIEMENT — la page
// parle légitimement de 48 h ailleurs (fenêtre de remboursement), ce n'est
// pas la même promesse.
import { render, screen } from "@testing-library/react";

import Compliance from "./Compliance";

jest.mock("../contexts/LanguageContext", () => ({
  useLang: jest.fn(() => ({ lang: "fr" })),
}));

jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));

const { useLang } = require("../contexts/LanguageContext");

// CRA règle Jest sur resetMocks: true : l'implémentation du mock est vidée
// avant CHAQUE test. La langue doit donc être posée à l'intérieur de chacun.
const afficher = (lang) => {
  useLang.mockReturnValue({ lang });
  return render(<Compliance />);
};

describe("la coupure d'expédition promise", () => {
  it("annonce 13 h en français, plus jamais 14 h", () => {
    afficher("fr");
    expect(screen.getByText(/avant 13 h \(heure de l'Est\)/)).toBeInTheDocument();
    expect(screen.queryByText(/14 h/)).not.toBeInTheDocument();
  });

  it("annonce 1:00 p.m. en anglais, plus jamais 2:00 p.m.", () => {
    afficher("en");
    expect(screen.getByText(/before 1:00 p\.m\. Eastern time/)).toBeInTheDocument();
    expect(screen.queryByText(/2:00 p\.m\./)).not.toBeInTheDocument();
  });
});

describe("le délai de paiement promis", () => {
  it("la phrase du paiement dit 30 minutes, en français", () => {
    afficher("fr");
    // La phrase complète, pas un nombre flottant : c'est ELLE qui engage.
    const phrase = screen.getByText(/payées dans un délai de 30 minutes/);
    expect(phrase).toBeInTheDocument();
    expect(phrase.textContent).not.toMatch(/48|12 h/);
  });

  it("la phrase du paiement dit 30 minutes, en anglais", () => {
    afficher("en");
    const phrase = screen.getByText(/paid within 30 minutes/);
    expect(phrase).toBeInTheDocument();
    expect(phrase.textContent).not.toMatch(/48|12 h/);
  });
});
