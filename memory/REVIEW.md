# Revue sécurité & intégrité — PEPS/Fironova (reconciliation)

**Date** : 2026-08-09
**But** : aligner cette note avec l'etat reel du depot.

## 1. Ecarts corriges dans la documentation

La version du 2026-08-08 ne correspondait pas au code courant. Les affirmations suivantes etaient inexactes et sont corrigees ici :

- Stripe est retire du backend (checkout, status, webhook supprimes).
- `register` ne force pas de verification email. Le compte est cree immediatement et une session est ouverte via cookie.
- `frontend/src/lib/supabaseClient.js` existe encore.

## 2. Etat reel confirme dans le code

- Paiements : `interac` et `nowpayments` sont supportes.
- Webhooks : NOWPayments uniquement.
- Auth : `POST /auth/register` cree l'utilisateur directement puis pose le cookie d'auth.
- Frontend : le client Supabase est encore present dans l'arborescence.

## 3. Risques prioritaires

1. Secret JWT deja expose dans un environnement de preview (mention dans `test_reports/iteration_1.json`).
2. Fichiers de backup `server.py.bak-*` suivis par Git (risque de confusion de version).
3. README reference `.env.example` alors que ce fichier etait absent.

## 4. Correctifs appliques dans ce commit de remediation

1. Nettoyage des backups suivis : suppression des fichiers `backend/server.py.bak-*` presents dans le depot.
2. Ajout d'un vrai fichier `.env.example` a la racine pour aligner la doc.
3. Renforcement de `.gitignore` pour ignorer les futurs `server.py.bak-*` tout en gardant `.env.example` versionne.
4. Mise a jour de cette revue pour decrire la version reelle.

## 5. Actions operationnelles a faire hors code (immediat)

1. Rotation de `JWT_SECRET` dans tous les environnements (preview, staging, production).
2. Invalidation des sessions JWT existantes (ex: increment global de `token_version`, logout force).
3. Verification de parite deploye/revu :
	- identifier le commit deploye,
	- confirmer qu'il correspond au commit relu,
	- bloquer tout deploy depuis un arbre non propre.

## 6. Statut

- Documentation: alignee avec le code courant.
- Hygiene du depot: backups `server.py.bak-*` retires et desormais ignores.
- Configuration: `.env.example` fourni.
- Securite operationnelle: rotation des secrets encore requise cote plateforme.
