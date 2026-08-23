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

REGLAGES = [
    ("UNPAID_ORDER_TTL_HOURS", "0.05",
     "3 minutes au lieu de 30 — sinon une attente par commande impayée"),
    ("AFFILIATE_APPROVAL_HOLD_DAYS", "0",
     "immédiat au lieu de 7 jours — sinon une semaine par commission"),
    ("REFUND_CLAIM_HOURS_AFTER_DELIVERY", "720",
     "30 jours au lieu de 48 h — sinon la fenêtre se ferme en plein test"),
]
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
                    help="poser les réglages de test")
    ap.add_argument("--off", action="store_true",
                    help="retirer les réglages et remettre ce qui était là")
    ap.add_argument("--defauts", action="store_true",
                    help="retirer les réglages ET les anciennes valeurs, pour "
                         "que les défauts du code s'appliquent")
    args = ap.parse_args()

    texte = lire()

    if sum((args.on, args.off, args.defauts)) > 1:
        print("Une seule option à la fois.")
        return 1
    if args.defauts:
        args.off = True

    if not args.on and not args.off and not args.defauts:
        # TROIS états, pas deux. Une valeur qui diffère du défaut n'est pas
        # forcément un réglage de test : elle peut être un choix délibéré.
        # Les confondre ferait crier au loup sur une configuration saine.
        mode_test = DEBUT in texte
        valeurs_test = {c: v for c, v, _ in REGLAGES}
        print("État actuel :\n")
        for cle, valeur in etat(texte):
            attendue = NORMALES[cle]
            if valeur is None:
                print(f"  {cle:36} absent → défaut du code ({attendue})")
            elif mode_test and valeur == valeurs_test[cle]:
                print(f"  {cle:36} {valeur:8} ⚠ valeur de TEST")
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

    if args.on:
        lignes = [DEBUT,
                  "# Posé pour la campagne de tests. À RETIRER ensuite :",
                  "#     python backend/scripts/mode_test.py --off"]
        for cle, valeur, pourquoi in REGLAGES:
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

    if args.on:
        print("Réglages de test posés.\n")
        for cle, valeur, _ in REGLAGES:
            print(f"  {cle}={valeur}")
        print("\n⚠  Ces valeurs ne doivent PAS survivre à la campagne.")
        print("   Laissées en place, elles signifient : 3 minutes pour payer,")
        print("   et des commissions acquises instantanément.\n")
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
