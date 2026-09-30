# Les plans de tests E2E

Ces trois fichiers vivaient hors du dépôt — sur le disque seulement, dans le
dossier de la copie de test. Une mise à jour du plan n'était donc versionnée
nulle part : personne ne pouvait voir ce qui avait changé, ni depuis quand, et
un nettoyage du dossier aurait emporté le travail. Ils sont ici désormais.

| Fichier | Rôle |
|---|---|
| `E2E_Test_Plan_FIRONOVA.xlsx` | Le plan, en anglais — ~170 cas sur 14 modules |
| `Plan_de_tests_E2E_FIRONOVA.xlsx` | Le même plan, en français |
| `E2E_Test_Plan_FIRONOVA_resultats.xlsx` | L'exécution du 27/09/2026 et l'état de chaque correction |

## Ce qu'ils contiennent

Le plan couvre le site public, le catalogue, le panier et la caisse, les
paiements, les comptes, les pages légales, l'espace affilié, l'admin, et le
non-fonctionnel (responsive, sécurité, accessibilité, i18n).

Le fichier de **résultats** porte en plus un onglet « Rapport QA » : les
21 corrections relevées à l'exécution, chacune avec son statut et le détail de
ce qui a été fait. C'est le document à ouvrir pour savoir où on en est.

## Deux limites, à savoir avant de s'y fier

**Un `.xlsx` ne se compare pas.** Git le versionne comme un bloc binaire :
on sait *qu'il* a changé, jamais *ce qui* a changé. Le message de commit doit
donc porter la substance de la modification — sinon l'historique ne dit rien.

**Les plans NORDPEP sont restés dehors.** Ils portent l'ancienne marque et ne
décrivent plus le site. Les rapatrier aurait laissé croire qu'ils font encore
autorité.

## La convention

Toute modification d'un plan se commite avec le **pourquoi** dans le message :
quelle attente est devenue fausse, et ce que le site fait réellement. Sans
cela, un plan corrigé est indiscernable d'un plan corrompu.
