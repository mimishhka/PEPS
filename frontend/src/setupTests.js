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

// ET LE DÉLAI DE JEST LUI-MÊME, QUI COURAIT CONTRE LE PRÉCÉDENT.
//
// `asyncUtilTimeout` accorde cinq secondes à `waitFor`. Le délai par test de
// Jest est, lui, resté à sa valeur par défaut : cinq secondes aussi. Les deux
// partent donc ensemble, et c'est Jest qui gagne — il tue le test à l'instant
// précis où l'attente allait aboutir.
//
// Tant que la machine est rapide, l'attente se termine bien avant et personne
// ne voit rien. Sous charge, elle s'étire : le 11/10/2026, deux exécutions
// complètes de suite ont échoué sur des suites DIFFÉRENTES — Login, AdminEmails
// et Checkout d'abord, puis CorrigerAdresse et AdminAffiliates — toutes sur
// « Exceeded timeout ». Une suite qui désigne un coupable différent à chaque
// passage ne signale pas un défaut : elle signale sa propre horloge.
//
// Vingt secondes laissent les cinq secondes d'attente aboutir, avec de la
// marge pour le rendu autour. Aucune assertion n'en devient plus permissive :
// un vrai défaut échoue toujours, il met seulement plus longtemps à le dire.
jest.setTimeout(20000);
