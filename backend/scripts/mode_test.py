#!/usr/bin/env python
"""Active ou retire les réglages de la période de test.

    python backend/scripts/mode_test.py --on     # poser les réglages
    python backend/scripts/mode_test.py --off    # les retirer
    python backend/scripts/mode_test.py          # dire où on en est

Trois délais rendent les tests impraticables tels quels : 30 minutes d'attente
par commande impayée, 7 jours pour voir une commission mûrir, et une fenêtre de
réclamation qui se referme au milieu des essais.

POURQUOI UN SCRIPT PLUTÔT QU'UNE ÉDITION À LA MAIN. Les trois valeurs se
posent et se retirent ensemble, dans un bloc délimité. On ne peut donc ni en
oublier une, ni créer un doublon en la redéfinissant plus bas dans le fichier
— où c'est la DERNIÈRE ligne qui gagne, ce qui produit des réglages
silencieusement faux.

Le fichier .env n'est jamais affiché : il contient les clés de production.
"""
import argparse
import pathlib
import re
import sys

DEBUT = "# ─── MODE TEST — retiré par mode_test.py --off ───"
FIN = "# ─── fin MODE TEST ───"

# DEUX RÉGLAGES DU DÉLAI DE PAIEMENT, et la distinction est essentielle.
#
# Trois minutes rendent le test d'expiration observable — mais elles rendent
# tout le reste INFAISABLE. Une commande payée est le préalable des
# commissions, des remboursements, de l'expédition ; or personne n'ouvre
# l'administration et ne confirme un paiement à la main en moins de trois
# minutes. La commande s'annule avant qu'on ait cliqué.
#
# On travaille donc en DEUX TEMPS :
#
#   --on           deux heures : de quoi payer, confirmer, expédier
#   --expiration   trois minutes : uniquement pour les tests d'expiration
#
# Les deux autres valeurs sont identiques dans les deux modes.
TTL_TRAVAIL = "2"
TTL_EXPIRATION = "0.05"

def reglages(ttl):
    return [
        ("UNPAID_ORDER_TTL_HOURS", ttl,
         ("3 minutes — POUR LES TESTS D'EXPIRATION SEULEMENT"
          if ttl == TTL_EXPIRATION else
          "2 heures — de quoi confirmer un paiement à la main")),
        ("AFFILIATE_APPROVAL_HOLD_DAYS", "0",
         "immédiat au lieu de 7 jours — sinon une semaine par commission"),
        ("REFUND_CLAIM_HOURS_AFTER_DELIVERY", "720",
         "30 jours au lieu de 48 h — sinon la fenêtre se ferme en plein test"),
    ]

REGLAGES = reglages(TTL_TRAVAIL)
NORMALES = {"UNPAID_ORDER_TTL_HOURS": "0.5",
            "AFFILIATE_APPROVAL_HOLD_DAYS": "7",
            "REFUND_CLAIM_HOURS_AFTER_DELIVERY": "48"}

RACINE = pathlib.Path(__file__).resolve().parent.parent
ENV = RACINE / ".env"


def lire():
    if not ENV.exists():
        print(f"Introuvable : {ENV}")
        print("Ce script doit tourner sur le serveur, où le .env existe.")
        raise SystemExit(1)
    return ENV.read_text(encoding="utf-8")


AVANT = "# valeur d'origine : "


def valeurs_memorisees(texte):
    """Ce que le bloc a mis de côté au moment du --on."""
    bloc = re.search(re.escape(DEBUT) + r"(.*?)" + re.escape(FIN), texte, re.S)
    if not bloc:
        return {}
    return dict(re.findall(rf"{re.escape(AVANT)}(\w+)=(\S*)", bloc.group(1)))


def sans_bloc(texte):
    """Retire le bloc de test ET toute définition isolée des trois clés.

    Les deux, et pas seulement le bloc : une variable posée à la main ailleurs
    dans le fichier survivrait au --off et continuerait de s'appliquer sans que
    rien ne le signale.

    Mais supprimer ne suffit pas. Une première version effaçait purement, ce
    qui perdait EN SILENCE une valeur choisie délibérément — un délai réglé à
    1 h serait revenu au défaut de 0,5 sans que personne le remarque. Le bloc
    mémorise donc l'ancienne valeur au moment du --on, et le --off la remet.
    """
    texte = re.sub(re.escape(DEBUT) + r".*?" + re.escape(FIN) + r"\n?",
                   "", texte, flags=re.S)
    for cle, _, _ in REGLAGES:
        texte = re.sub(rf"^{cle}\s*=.*$\n?", "", texte, flags=re.M)
    return texte.rstrip("\n") + "\n"


def etat(texte):
    actifs = []
    for cle, valeur, _ in REGLAGES:
        m = re.search(rf"^{cle}\s*=\s*(\S+)", texte, re.M)
        actifs.append((cle, m.group(1) if m else None))
    return actifs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--on", action="store_true",
                    help="poser les réglages de test (2 h pour payer)")
    ap.add_argument("--expiration", action="store_true",
                    help="idem, mais 3 minutes pour payer — pour les seuls "
                         "tests d'expiration, puis revenir à --on")
    ap.add_argument("--off", action="store_true",
                    help="retirer les réglages et remettre ce qui était là")
    ap.add_argument("--defauts", action="store_true",
                    help="retirer les réglages ET les anciennes valeurs, pour "
                         "que les défauts du code s'appliquent")
    args = ap.parse_args()

    texte = lire()

    if sum((args.on, args.expiration, args.off, args.defauts)) > 1:
        print("Une seule option à la fois.")
        return 1
    if args.defauts:
        args.off = True
    # Le mode expiration est un mode « on » avec un délai plus court.
    reglages_actifs = reglages(TTL_EXPIRATION if args.expiration else TTL_TRAVAIL)
    pose = args.on or args.expiration

    if not pose and not args.off:
        # TROIS états, pas deux. Une valeur qui diffère du défaut n'est pas
        # forcément un réglage de test : elle peut être un choix délibéré.
        # Les confondre ferait crier au loup sur une configuration saine.
        mode_test = DEBUT in texte
        # Une valeur est « de test » si elle correspond a L'UN ou L'AUTRE des
        # deux modes : 2 h de travail, ou 3 minutes d'expiration.
        valeurs_test = {}
        for jeu in (reglages(TTL_TRAVAIL), reglages(TTL_EXPIRATION)):
            for c, v, _ in jeu:
                valeurs_test.setdefault(c, set()).add(v)
        print("État actuel :\n")
        for cle, valeur in etat(texte):
            attendue = NORMALES[cle]
            if valeur is None:
                print(f"  {cle:36} absent → défaut du code ({attendue})")
            elif mode_test and valeur in valeurs_test.get(cle, ()):
                court = valeur == TTL_EXPIRATION
                note = " ⚠ TEST — expiration (3 min)" if court else " ⚠ valeur de TEST"
                print(f"  {cle:36} {valeur:8}{note}")
            elif valeur == attendue:
                print(f"  {cle:36} {valeur:8} valeur normale")
            else:
                print(f"  {cle:36} {valeur:8} valeur personnalisée")
        print(f"\n  mode test actif : {'OUI' if mode_test else 'non'}")
        if mode_test:
            print("  → à retirer avec --off avant la remise en service.")
        return 0

    # Ce qui était en place AVANT — soit dans le fichier, soit déjà mis de
    # côté par un --on précédent (relancer --on deux fois ne doit pas mémoriser
    # les valeurs de test comme si elles étaient les vôtres).
    deja = valeurs_memorisees(texte)
    origine = {}
    for cle, _, _ in REGLAGES:
        if cle in deja:
            origine[cle] = deja[cle]
        else:
            m = re.search(rf"^{cle}\s*=\s*(\S*)", texte, re.M)
            origine[cle] = m.group(1) if m else ""

    nouveau = sans_bloc(texte)

    if pose:
        lignes = [DEBUT,
                  "# Posé pour la campagne de tests. À RETIRER ensuite :",
                  "#     python backend/scripts/mode_test.py --off"]
        for cle, valeur, pourquoi in reglages_actifs:
            lignes.append(f"# {pourquoi}")
            lignes.append(f"{AVANT}{cle}={origine[cle]}")
            lignes.append(f"{cle}={valeur}")
        lignes.append(FIN)
        nouveau = nouveau + "\n" + "\n".join(lignes) + "\n"
    elif args.defauts:
        # On n'écrit RIEN. Les trois clés disparaissent du fichier, et le code
        # applique ses propres valeurs.
        #
        # C'est ce qu'il faut quand une ancienne valeur contredit la politique
        # voulue : le serveur portait UNPAID_ORDER_TTL_HOURS="24", héritée
        # d'avant la décision des 30 minutes. Un --off ordinaire l'aurait
        # fidèlement restaurée, et la décision serait restée lettre morte.
        pass
    else:
        # Remettre ce qui était là, et seulement cela. Une clé absente à
        # l'origine reste absente : le code a ses propres défauts, les
        # réinscrire donnerait l'illusion d'un choix qui n'a jamais été fait.
        restaurees = [f"{c}={v}" for c, v in origine.items() if v]
        if restaurees:
            nouveau = nouveau + "\n" + "\n".join(restaurees) + "\n"

    ENV.write_text(nouveau, encoding="utf-8")

    if pose:
        print("Réglages de test posés.\n")
        # reglages_actifs, pas REGLAGES : ce dernier est fige sur le mode
        # travail, et affichait donc 2 h alors qu'on venait d'ecrire 3 minutes.
        for cle, valeur, _ in reglages_actifs:
            print(f"  {cle}={valeur}")
        if args.expiration:
            print("\n⚠  Délai de paiement à 3 MINUTES — pour les tests")
            print("   d'expiration UNIQUEMENT. Revenez ensuite à --on, sinon")
            print("   vous ne pourrez plus confirmer un paiement à la main :")
            print("   la commande s'annulera avant que vous ayez cliqué.")
        print("\n⚠  Ces valeurs ne doivent PAS survivre à la campagne.")
        print("   Laissées en place, elles signifient des commissions")
        print("   acquises instantanément.\n")
    elif args.defauts:
        print("Réglages de test retirés, et les anciennes valeurs effacées.")
        print("Le code applique désormais ses propres défauts :\n")
        for cle, attendue in NORMALES.items():
            print(f"  {cle}={attendue}")
        print()
    else:
        print("Réglages de test retirés. Ce qui était là est remis :\n")
        divergent = []
        for cle, attendue in NORMALES.items():
            v = origine.get(cle) or ""
            if not v:
                print(f"  {cle} absent → défaut du code ({attendue})")
            else:
                print(f"  {cle}={v}")
                if v != attendue:
                    divergent.append((cle, v, attendue))
        if divergent:
            # Le point qui compte : une valeur restaurée peut CONTREDIRE la
            # politique du code. Le dire ici, au moment où on la remet, plutôt
            # que de laisser la découverte pour plus tard.
            print("\n⚠  Une valeur remise diffère du défaut du code :")
            for cle, v, attendue in divergent:
                print(f"     {cle} = {v}, alors que le code prévoit {attendue}")
            print("   Si ce n'est pas voulu, effacez-la :")
            print("     python backend/scripts/mode_test.py --defauts")
        print()

    print("Redémarrer pour que ce soit pris en compte :")
    print("  sudo supervisorctl restart backend")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
