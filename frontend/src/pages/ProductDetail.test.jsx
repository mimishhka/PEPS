// La fiche produit : ce qu'elle dit de l'état du stock et du certificat.
//
// Deux décisions du 2026-09-20 sont verrouillées ici.
//
// 1. Sous la photo, plus rien. Les pastilles « Certificat d'analyse
//    disponible » et « COA · À VENIR » répétaient une information déjà portée
//    par la colonne de droite, là où on décide d'acheter.
// 2. « Précommande » ne peut plus masquer la rupture. Une variante en
//    précommande sans un seul flacon en tablette doit le dire : sinon le
//    client lit « Précommande » et comprend « expédié demain ».
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ProductDetail from "./ProductDetail";
import api from "../lib/api";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ slug: "bpc-157" }),
  Link: ({ to, children, ...reste }) => <a href={to} {...reste}>{children}</a>,
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));

jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ t: (k) => k, lang: "fr" }),
}));
jest.mock("../contexts/CartContext", () => ({ useCart: () => ({ add: jest.fn() }) }));
// La fiche lit le seuil de gratuité depuis la configuration du site pour
// déduire le badge « livraison gratuite » des formats de vente.
jest.mock("../contexts/SiteConfigContext", () => ({
  useSiteConfig: () => ({ freeShippingThresholdCad: 200 }),
}));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../hooks/useAffiliate", () => ({ __esModule: true, default: () => ({ affiliate: null }) }));
jest.mock("../components/brand", () => ({ Seal: () => null }));
jest.mock("../components/ProductImage", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/LoadingSkeletons", () => ({ ProductDetailSkeleton: () => null }));
// La fiche demande une CONFIRMATION avant une precommande. Sans ce double,
// `useConfirm` exige son fournisseur et le rendu casse avant la premiere
// assertion — la fiche entiere devenait intestable.
jest.mock("../components/ConfirmDialog", () => ({
  useConfirm: () => () => Promise.resolve(true),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

// Une seule variante par cas : avec plusieurs, le sélecteur de dosage répète
// les libellés et la recherche par texte ne désigne plus la pastille.
const fiche = (variante) => ({
  id: "p-1",
  slug: "bpc-157",
  name_fr: "BPC-157",
  name_en: "BPC-157",
  price_cad: 100,
  purity: "≥ 99 %",
  variants: [{
    id: "v-1", name: "10.0mg", sku: "BPC-157-10MG",
    price: 100, sale_price: null, preorder_price: 85,
    badge_coming_soon: false, preorder_note: "", coa_url: "",
    ...variante,
  }],
});

const afficher = async (variante) => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.includes("/related") ? [] : fiche(variante),
  }));
  render(<ProductDetail />);
  await waitFor(() => expect(screen.getByTestId("product-detail-page")).toBeInTheDocument());
};

/* DEUX variantes, uniquement pour les cas qui portent sur le sélecteur :
 * il n'est rendu que si `variants.length > 1`. Le premier jet de ces tests
 * utilisait le lot à une variante : le sélecteur n'existait pas, l'assertion
 * était sautée, et le test passait sans rien vérifier. */
const ficheDeuxDosages = () => ({
  ...fiche({ stock: 12 }),
  variants: [
    { id: "v-1", name: "5.0mg", sku: "BPC-157-5MG", price: 64.99, stock: 12,
      sale_price: null, preorder_price: 55, badge_coming_soon: false,
      preorder_note: "", coa_url: "" },
    { id: "v-2", name: "10.0mg", sku: "BPC-157-10MG", price: 100, stock: 8,
      sale_price: null, preorder_price: 85, badge_coming_soon: false,
      preorder_note: "", coa_url: "" },
  ],
});

const afficherDeuxDosages = async () => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.includes("/related") ? [] : ficheDeuxDosages(),
  }));
  render(<ProductDetail />);
  await waitFor(() => expect(screen.getByTestId("product-detail-page")).toBeInTheDocument());
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("en précommande sans stock, la pastille annonce aussi la rupture", async () => {
  await afficher({
    stock: 0, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });

  // L'ORDRE DIT LEQUEL COMPTE. « Précommande · Rupture » se lisait comme une
  // contradiction (rapport E2E #20) : on annoncait une precommande, puis on
  // la dementait. L'etat REEL vient d'abord — c'est une rupture —, la
  // precommande suit comme le recours offert.
  expect(screen.getByTestId("stock-state")).toHaveTextContent("Rupture · Précommande");
});

test("UN CERTIFICAT MANQUANT N'EST PAS UNE RUPTURE DE STOCK", async () => {
  /* MIREILLE, 11/10/2026 : « j'ai rajouté du BPC-157 mais pour lequel je n'ai
   * pas encore de COA. Il sort en précommande comme s'il n'était pas en
   * stock [...] il ne faut pas que la commande soit traitée comme une
   * précommande. »
   *
   * Ce test disait l'inverse jusqu'au 11/10/2026 : il vérifiait que ce lot
   * s'annonçait « Précommande ». Il a été corrigé, pas contourné — c'est la
   * règle métier qui a changé, pas le code qui s'est mis à mentir. Le lot est
   * en tablette : il s'annonce en stock, et l'avertissement dit ce qui
   * manque vraiment. */
  await afficher({
    stock: 12, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });

  const pastille = screen.getByTestId("stock-state");
  expect(pastille).toHaveTextContent("En stock");
  expect(pastille).not.toHaveTextContent("Précommande");
  expect(pastille).not.toHaveTextContent("Rupture");
  expect(screen.getByTestId("avertissement-coa")).toBeInTheDocument();
});

test("et le bouton ajoute normalement, sans parler de précommande", async () => {
  await afficher({
    stock: 12, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });
  const bouton = screen.getByTestId("product-add-to-cart");
  expect(bouton).toBeEnabled();
  expect(bouton).not.toHaveTextContent(/PRÉCOMMANDE/i);
});

test("sans stock, le certificat ne change rien : c'est bien une précommande", async () => {
  // La rupture, elle, reste une vraie raison. Et on n'y ajoute pas
  // l'avertissement : le délai d'arrivée est déjà le sujet.
  await afficher({
    stock: 0, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
  });
  expect(screen.getByTestId("stock-state")).toHaveTextContent("Rupture · Précommande");
  expect(screen.queryByTestId("avertissement-coa")).toBeNull();
});

test("hors précommande, la rupture se dit comme avant", async () => {
  await afficher({
    stock: 0, preorder_enabled: false,
    coa_status: "available", badge_coa_pending: false,
    coa_url: "/uploads/coa/bpc157.pdf",
  });

  expect(screen.getByTestId("stock-state")).toHaveTextContent("Rupture");
});

test("aucune pastille de COA sous la photo, certificat disponible ou non", async () => {
  await afficher({
    stock: 5, preorder_enabled: false,
    coa_status: "available", badge_coa_pending: false,
    coa_url: "/uploads/coa/bpc157.pdf",
  });

  expect(screen.queryByTestId("coa-badge-verified")).not.toBeInTheDocument();
  expect(screen.queryByTestId("coa-badge-pending")).not.toBeInTheDocument();
  // Le certificat reste accessible : c'est le bouton qui le porte, pas une
  // pastille décorative.
  expect(screen.getByTestId("download-coa")).toHaveAttribute("href", "/uploads/coa/bpc157.pdf");
});

test("la note de précommande reste affichable quand l'admin en écrit une", async () => {
  await afficher({
    stock: 0, preorder_enabled: true,
    coa_status: "pending", badge_coa_pending: true,
    preorder_note: "Expédié dès le 15 novembre",
  });

  expect(screen.getByTestId("preorder-note")).toHaveTextContent("Expédié dès le 15 novembre");
});

describe("ce que la colonne de droite montre, et dans quel ordre", () => {
  /* MIREILLE, 11/10/2026 : « pas besoin du prix sur la carte de dosage.
   * ensuite les fonts de prix et des quantités sont beaucoup trop grandes ??
   * ou c'est moi qui rêve ». Elle ne rêvait pas : le prix était en 28 px de
   * chasse fixe, ce qui occupe la largeur d'un titre et passait devant le nom
   * du produit. */

  test("LE PRIX NE SE REPETE PAS SUR LA PASTILLE DE DOSAGE", async () => {
    // Il est juste en dessous et suit la sélection : l'écrire deux fois
    // ferait douter de l'un des deux. Même règle que sur la carte.
    await afficherDeuxDosages();
    const selecteur = screen.getByTestId("variant-selector");
    expect(selecteur).toHaveTextContent("5 mg");
    expect(selecteur).toHaveTextContent("10 mg");
    expect(selecteur.textContent).not.toMatch(/\$|\d+[.,]\d{2}/);
  });

  test("et le prix affiché reste bien celui du dosage choisi", async () => {
    await afficherDeuxDosages();
    expect(screen.getByTestId("product-price")).toHaveTextContent(/64/);
  });

  test("le prix ne crie plus plus fort que le nom du produit", async () => {
    // 24 px, contre 28 px au nom sur téléphone. Le test fige le chiffre :
    // c'est un arbitrage visuel, et il doit se voir s'il change.
    await afficher({ stock: 12 });
    expect(screen.getByTestId("product-price").className).toMatch(/text-\[24px\]/);
  });

  test("LA PURETE RESTE AU-DESSUS DU BOUTON, le reste descend", async () => {
    /* La colonne faisait passer la séquence puis six lignes de
     * spécifications AVANT le prix : il fallait défiler devant des données de
     * référence pour atteindre ce qu'on était venu faire. */
    await afficher({ stock: 12, sku: "BPC-157-10MG" });
    const page = screen.getByTestId("product-detail-page");
    const purete = screen.getByTestId("purete-en-tete");
    const bouton = screen.getByTestId("product-add-to-cart");
    const technique = screen.getByTestId("donnees-techniques");

    const position = (el) => [...page.querySelectorAll("*")].indexOf(el);
    expect(position(purete)).toBeLessThan(position(bouton));
    expect(position(technique)).toBeGreaterThan(position(bouton));
  });

  test("une donnée absente ne laisse plus une ligne « - »", async () => {
    // « LOT ACTUEL : - » occupait une ligne entière pour dire qu'on ne sait
    // pas. La forme, elle, est connue pour tous les produits et reste.
    await afficher({ stock: 12, sku: "" });
    const technique = screen.getByTestId("donnees-techniques");
    expect(technique).not.toHaveTextContent(/SKU/);
    expect(technique).not.toHaveTextContent(/LOT ACTUEL/);
    // L'apparence, elle, garde un repli : « Forme : Lyophilisé » était
    // écrite en dur pour tous les produits, et une information présente
    // depuis toujours ne doit pas disparaître parce qu'on a ajouté mieux
    // à côté.
    expect(technique).toHaveTextContent(/APPARENCE/);
    expect(technique).toHaveTextContent(/lyophilis/i);
  });
});

describe("le profil moléculaire montre la matière, jamais l'effet", () => {
  /* MIREILLE, 11/10/2026 : « il n'y a rien dessus, aucune info ». Cinq
   * champs dormaient en base — apparence, solubilité, conservation, formule,
   * longueur de séquence. Ils avaient disparu EN MÊME TEMPS que la
   * description libre et la catégorie, retirées parce que « leurs libellés
   * décrivaient un effet ». La précaution visait juste, mais ratissait trop
   * large. */

  /* `fiche()` verse ce qu'on lui donne dans la VARIANTE, pas dans le produit.
   * Le premier jet de ce test y a mis l'apparence et la solubilité, qui se
   * lisent sur le PRODUIT : la fiche affichait le repli « Poudre
   * lyophilisée » et le test a échoué en désignant le bon coupable. */
  const MATIERE = {
    appearance: "Poudre lyophilisée blanche",
    solubility: "Soluble dans l'eau",
    storage: "−20 °C, à l'abri de la lumière",
    molecular_formula: "C62H98N16O22",
    sequence_length: 15,
  };

  test("les champs de matière sortent enfin", async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.includes("/related") ? [] : { ...fiche({ stock: 12 }), ...MATIERE },
    }));
    render(<ProductDetail />);
    await waitFor(() => expect(screen.getByTestId("product-detail-page")).toBeInTheDocument());

    const bloc = screen.getByTestId("donnees-techniques");
    expect(bloc).toHaveTextContent("Poudre lyophilisée blanche");
    expect(bloc).toHaveTextContent("Soluble dans l'eau");
    expect(bloc).toHaveTextContent("−20 °C");
    expect(bloc).toHaveTextContent("C62H98N16O22");
    expect(bloc).toHaveTextContent("15 acides aminés");
  });

  test("MECHANISM ET RESEARCH_AREAS RESTENT DEHORS", async () => {
    /* Le garde-fou qui compte. Ces deux champs vivent dans le même objet
     * produit, à deux lignes des cinq qu'on vient de publier, et le réflexe
     * d'ajouter « tant qu'à y être » est exactement ce qui ferait basculer
     * la fiche d'une description de matière à une revendication d'effet. */
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.includes("/related") ? [] : {
        ...fiche({ stock: 12 }),
        ...MATIERE,
        mechanism: "Potentialise la libération d'hormone de croissance",
        research_areas: ["Réparation tissulaire", "Anti-inflammatoire"],
        description_fr: "Favorise la guérison des tendons",
      },
    }));
    render(<ProductDetail />);
    await waitFor(() => expect(screen.getByTestId("product-detail-page")).toBeInTheDocument());

    const page = screen.getByTestId("product-detail-page").textContent;
    expect(page).not.toMatch(/Potentialise/i);
    expect(page).not.toMatch(/Réparation tissulaire/i);
    expect(page).not.toMatch(/Anti-inflammatoire/i);
    expect(page).not.toMatch(/guérison/i);
  });
});

describe("les formats de vente", () => {
  /* MIREILLE, 21/10/2026, capture d'un concurrent à l'appui : « je parle de
   * quantité vendue, donc un lot de 10, un paquet de 10 [...] l'afficher
   * seulement si je veux le rendre public ». Puis : « le seuil pour la
   * livraison gratuite reste le même ».
   *
   * Le prix au flacon, l'économie et le badge de livraison SE CALCULENT. Les
   * stocker ferait trois valeurs de plus à tenir à jour, et elles
   * divergeraient du prix réel au premier changement. */
  const avecFormats = (packs) => afficher({ price: 79.99, stock: 500, packs });

  test("SANS FORMAT PUBLIÉ, LE SÉLECTEUR N'EXISTE PAS", async () => {
    // Un produit vendu au flacon seul garde exactement la fiche d'avant.
    await avecFormats([]);
    expect(screen.queryByTestId("selecteur-format")).not.toBeInTheDocument();
  });

  test("un format non publié ne s'affiche pas", async () => {
    await avecFormats([
      { qty: 3, price: 225.99, active: true },
      { qty: 10, price: 639.99, active: false },
    ]);
    expect(screen.getByTestId("format-3")).toBeInTheDocument();
    expect(screen.queryByTestId("format-10")).not.toBeInTheDocument();
  });

  test("le flacon seul apparaît à côté des formats, et part sélectionné", async () => {
    await avecFormats([{ qty: 3, price: 225.99, active: true }]);
    expect(screen.getByTestId("format-1")).toHaveAttribute("data-actif", "oui");
    expect(screen.getByTestId("format-3")).toHaveAttribute("data-actif", "non");
  });

  test("LE PRIX AU FLACON ET L'ÉCONOMIE SE CALCULENT", async () => {
    // 225,99 $ pour 3 flacons à 79,99 $ : 75,33 $ l'unité, 6 % d'économie.
    await avecFormats([{ qty: 3, price: 225.99, active: true }]);
    expect(screen.getByTestId("format-3-unitaire")).toHaveTextContent("75,33");
    expect(screen.getByTestId("format-3-economie")).toHaveTextContent("6");
  });

  test("LE BADGE DE LIVRAISON SUIT LE SEUIL, IL NE SE SAISIT PAS", async () => {
    /* Le seuil moqué vaut 200 $. Un drapeau saisi par format pourrait
     * promettre la gratuité pendant que la caisse facture le forfait ; en le
     * déduisant du seuil réel, il ne peut pas mentir. */
    await avecFormats([
      { qty: 2, price: 150.00, active: true },
      { qty: 5, price: 359.99, active: true },
    ]);
    expect(screen.queryByTestId("format-2-livraison")).not.toBeInTheDocument();
    expect(screen.getByTestId("format-5-livraison")).toBeInTheDocument();
  });

  test("choisir un format le rend actif", async () => {
    await avecFormats([{ qty: 5, price: 359.99, active: true }]);
    fireEvent.click(screen.getByTestId("format-5"));
    expect(screen.getByTestId("format-5")).toHaveAttribute("data-actif", "oui");
    expect(screen.getByTestId("format-1")).toHaveAttribute("data-actif", "non");
  });

  test("les formats s'affichent du plus petit au plus grand", async () => {
    await avecFormats([
      { qty: 10, price: 639.99, active: true },
      { qty: 3, price: 225.99, active: true },
      { qty: 5, price: 359.99, active: true },
    ]);
    const ordre = [...screen.getByTestId("selecteur-format").querySelectorAll("[data-testid]")]
      .map((e) => e.getAttribute("data-testid"))
      .filter((id) => /^format-\d+$/.test(id));
    expect(ordre).toEqual(["format-1", "format-3", "format-5", "format-10"]);
  });
});
