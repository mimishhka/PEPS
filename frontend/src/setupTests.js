// Chargé automatiquement par Create React App avant chaque suite.
//
// jest-dom ajoute les assertions qui parlent le DOM : toBeInTheDocument,
// toHaveTextContent, toBeVisible. Sans lui, un test d'interface se résume à
// comparer des chaînes, ce qui échoue mal et se lit encore plus mal.
import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// LE DÉLAI DES UTILITAIRES ASYNCHRONES, PORTÉ À CINQ SECONDES.
//
// `waitFor` et `findBy…` abandonnent au bout d'une seconde par défaut. Jest
// lance ici plusieurs suites EN PARALLÈLE : quand la plus lourde tombe en
// même temps qu'une autre, une seconde ne suffit plus pour un écran qui
// charge trois appels avant de rendre ses chiffres.
//
// Ce réglage ne rend AUCUNE assertion plus permissive : il ne change que le
// temps qu'on accorde avant de conclure. Un vrai défaut échoue toujours, il
// met simplement quelques secondes de plus à le dire.
//
// Il ne suffit pas non plus : une attente qui parie sur une DURÉE fixe
// (`setTimeout(r, 500)`) échoue quoi qu'on règle ici. La règle reste
// d'attendre une CONDITION.
configure({ asyncUtilTimeout: 5000 });
