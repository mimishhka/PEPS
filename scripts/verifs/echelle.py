# -*- coding: utf-8 -*-
"""Une lecture sans borne sur une collection qui grandit.

POURQUOI CE CONTROLE EXISTE
---------------------------
MIREILLE, 01/10/2026 :

    « partout ou on cumule des donnees (historique) il faut s'assurer que
      lorsqu'il y en aura plusieurs et peut-etre des milliers ce soit
      travaillable [...] il faut penser a ce site dans 1 an ou deux »
    « mais tout le site doit etre concu pour une expansion possible, quelle
      que soit l'information »

Ce n'est pas une correction d'ecran, c'est une PROPRIETE que le site doit
avoir. Une propriete ne tient pas par la vigilance : elle tient par un
controle.

L'etat du depot au moment d'ecrire cette sonde :

    _cursor_all(cursor) = [doc async for doc in cursor]   17 appels
    to_list(None)                                          9
    to_list(100..5000), plafonds fixes                    44

`_cursor_all` porte pourtant une docstring sans ambiguite — « only when the
endpoint contract requires all rows ». Elle est juste ; c'est l'usage qui a
derive, dix-sept fois. Corriger les dix-sept sans poser de controle, c'est
garantir un dix-huitieme le mois prochain.

LE PLAFOND MUET EST PIRE QUE LA LENTEUR
---------------------------------------
`to_list(500)` ne plante pas. Il rend cinq cents lignes sur douze mille, et
l'ecran a l'air juste. Personne ne le decouvre en testant avec vingt lignes :
on le decouvre le jour ou un total est faux dans une conciliation, et on ne
sait pas depuis quand.

CE QU'IL COUVRE, ET CE QU'IL NE COUVRE PAS
------------------------------------------
Il verifie que toute lecture d'une collection de CROISSANCE est bornee : soit
par un `.limit(n)`, soit par un `to_list(n)` avec un entier. Il ne juge pas si
la borne est la BONNE — un plafond de 500 sur un ecran qui en montre 50 reste
une decision humaine.

Il ne regarde PAS les collections de configuration : leur taille est bornee
par le metier, pas par le temps. Paginer la liste des zones d'expedition
serait du bruit.

Les agregations qui REDUISENT (`$group`, `$count`) sont acceptees : elles
rendent une ligne par mois ou par client, pas une par evenement. C'est
precisement ce qu'on veut encourager.
"""
import pathlib
import re
import sys

# Une ligne par evenement : elles ne cessent jamais de grandir.
CROISSANCE = {
    "orders",
    "users",
    "affiliate_referrals",
    "affiliate_clicks",
    "affiliate_payouts",
    "affiliate_notifications",
    "affiliate_tickets",
    "customer_tickets",
    "email_outbox",
    "stock_movements",
    "payment_transactions",
    "subscribers",
    "admin_audit_log",
    "magic_tokens",
    "webhook_events",
    "refresh_sessions",
    "order_messages",
    "affiliate_payout_notices",
    "affiliate_payout_deferrals",
}

# Bornees par le metier et non par le temps : on les laisse tranquilles.
# Ecrite pour que l'ajout d'une collection oblige a trancher de quel cote elle
# tombe, plutot que de la laisser passer par oubli.
CONFIGURATION = {
    "menus", "shipping_zones", "shipping_boxes", "categories",
    "email_templates", "seo_settings", "staff", "staff_invites",
    "products", "coupons", "affiliates", "manifests", "settings",
    "affiliate_bindings", "payout_runs", "affiliate_payment_runs",
    "low_stock_alerts", "interac_reconciliation_queue", "test",
    "affiliate_email_jobs", "stock_notifications", "shipping_methods",
}

LECTURE = re.compile(r"\bdb\.([a-z_0-9]+)\.(find|aggregate)\s*\(")
BORNE = re.compile(r"\.limit\s*\(\s*[^)\s]")
# Un plafond n'est pas toujours un entier nu : `to_list(min(limit, 500))`
# borne tout aussi bien. Seul `None` ne borne rien.
PLAFOND = re.compile(r"\.to_list\s*\(\s*(?!None\s*\))[^)\s]")
SANS_BORNE = re.compile(r"\.to_list\s*\(\s*None\s*\)")
REDUIT = re.compile(r'"\$group"|"\$count"|count_documents')
# Un curseur remis a `_csv_cursor_response` est consomme EN FLUX : rien n'est
# materialise, et un export de 500 000 lignes passe deja. C'est le bon patron,
# pas un oubli — il ne faut surtout pas le « corriger ».
FLUX = re.compile(r"_csv_cursor_response")


def _chaine(texte, debut):
    """La chaine d'appels complete depuis `db.x.find(`, y compris `.to_list()`.

    Le code de ce depot ecrit ces chaines sur plusieurs lignes ; une analyse
    ligne par ligne verrait `find(` sans jamais voir le `to_list(500)` qui la
    termine, et crierait au loup partout.
    """
    i = texte.index("(", debut)
    profondeur = 0
    while i < len(texte):
        if texte[i] == "(":
            profondeur += 1
        elif texte[i] == ")":
            profondeur -= 1
            if profondeur == 0:
                i += 1
                break
        i += 1
    # On continue tant que la suite est `.methode(...)`.
    while True:
        j = i
        while j < len(texte) and texte[j] in " \n\t\r":
            j += 1
        suite = re.match(r"\.[a-z_]+\s*\(", texte[j:])
        if not suite:
            break
        i = j + suite.end() - 1
        profondeur = 0
        while i < len(texte):
            if texte[i] == "(":
                profondeur += 1
            elif texte[i] == ")":
                profondeur -= 1
                if profondeur == 0:
                    i += 1
                    break
            i += 1
    return texte[debut:i]


def verifier(fichiers):
    soucis = []
    for f in fichiers:
        try:
            texte = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for m in LECTURE.finditer(texte):
            collection = m.group(1)
            if collection not in CROISSANCE:
                if collection not in CONFIGURATION:
                    ligne = texte.count("\n", 0, m.start()) + 1
                    soucis.append((f, ligne, collection,
                                   "collection inconnue : classez-la dans "
                                   "CROISSANCE ou CONFIGURATION"))
                continue

            chaine = _chaine(texte, m.start())
            ligne = texte.count("\n", 0, m.start()) + 1

            # Une agregation qui REDUIT rend une ligne par mois ou par client,
            # pas une par evenement. C'est ce qu'on veut encourager.
            if m.group(2) == "aggregate":
                # Le pipeline est souvent construit dans une VARIABLE, quelques
                # lignes plus haut : `aggregate(pipeline)` ne montre alors aucun
                # `$group` dans la chaine elle-meme. On regarde donc aussi en
                # amont, la ou le pipeline a ete bati.
                amont = texte[max(0, m.start() - 2500):m.start()]
                if REDUIT.search(chaine) or REDUIT.search(amont):
                    continue
            # `_cursor_all(...)` materialise tout, quoi qu'il y ait dedans.
            avant = texte[max(0, m.start() - 60):m.start()]
            if "_cursor_all(" in avant:
                soucis.append((f, ligne, collection,
                               "_cursor_all : materialise TOUTE la collection"))
                continue
            # Le curseur part-il en flux vers le client ? On regarde en
            # AVAL : `cursor = db.x.find(...)` puis `_csv_cursor_response(cursor…)`
            # quelques lignes plus bas.
            if FLUX.search(texte[m.start():m.start() + 500]):
                continue
            if SANS_BORNE.search(chaine):
                soucis.append((f, ligne, collection, "to_list(None) : sans borne"))
                continue
            if BORNE.search(chaine) or PLAFOND.search(chaine):
                continue
            soucis.append((f, ligne, collection,
                           "ni .limit() ni to_list(n) : lecture non bornee"))
    return soucis


def _cibles(args):
    if args:
        return [pathlib.Path(a) for a in args if pathlib.Path(a).is_file()]
    racine = pathlib.Path(__file__).resolve().parents[2] / "backend"
    return ([racine / "server.py"]
            + sorted((racine / "services").glob("*.py"))
            + sorted((racine / "routers").glob("*.py")))


# ===========================================================================
# LE CLIQUET
# ===========================================================================
#
# Trente lectures non bornees existaient le jour ou cette sonde est nee. Les
# corriger demande de reecrire des endpoints un par un, et ce travail est
# decoupe en plusieurs livraisons — a la demande de Mireille, et avec raison.
#
# Une sonde qui echoue pendant tout ce temps serait desactivee le premier jour.
# Une sonde qui ne dit rien ne sert a rien. Le cliquet resout les deux : il
# TOLERE ce qui existait, et REFUSE tout ajout. Des ce commit, plus aucune
# lecture non bornee ne peut entrer dans le depot.
#
# LA CLE N'EST PAS LE NUMERO DE LIGNE. Un numero bouge a chaque edition, et un
# fichier de reference qui se perime a la premiere retouche est pire que pas de
# reference du tout : on finirait par le regenerer sans le lire. La cle est
# (fichier, collection, motif), et on compare des COMPTES.
#
# Le fichier ne se regenere pas tout seul. Quand un compte baisse, la sonde le
# dit et demande de l'abaisser a la main : c'est ainsi qu'il ne remonte jamais.

REFERENCE = pathlib.Path(__file__).with_name("echelle-connu.txt")


def _cle(f, coll, quoi):
    return f"{f.name}|{coll}|{quoi}"


def _lire_reference():
    if not REFERENCE.exists():
        return None
    connu = {}
    for ligne in REFERENCE.read_text(encoding="utf-8").splitlines():
        ligne = ligne.split("#", 1)[0].strip()
        if not ligne:
            continue
        cle, _, compte = ligne.rpartition("=")
        try:
            connu[cle.strip()] = int(compte.strip())
        except ValueError:
            continue
    return connu


def main(argv):
    fichiers = [f for f in _cibles(argv[1:]) if f.exists()]
    soucis = verifier(fichiers)

    comptes = {}
    for f, _n, coll, quoi in soucis:
        comptes[_cle(f, coll, quoi)] = comptes.get(_cle(f, coll, quoi), 0) + 1

    connu = _lire_reference()
    if connu is None:
        # Sans fichier de reference, la sonde est stricte : c'est l'etat
        # qu'on veut atteindre.
        for f, n, coll, quoi in soucis:
            print(f"  !! {f.name}:{n} — {coll} : {quoi}")
        if soucis:
            print(f"\n  {len(soucis)} lecture(s) a borner")
            return 1
        print(f"  echelle       ok  ({len(fichiers)} fichiers)")
        return 0

    # ON COMPARE DES COMPTES, DONC ON RAPPORTE UN ECART.
    #
    # Ma premiere redaction listait toutes les occurrences du motif dont le
    # compte avait monte, et annoncait « 2 lectures ajoutees » pour UNE seule.
    # Pire, la premiere ligne montree etait la plus ancienne du fichier — une
    # ligne innocente, en place depuis des mois. Un message qui accuse le
    # mauvais endroit fait perdre plus de temps qu'il n'en sauve.
    #
    # Les comptes ne disent pas LAQUELLE est nouvelle. On le dit franchement,
    # et on donne les positions ou chercher.
    excedents = []
    for cle in sorted(comptes):
        ecart = comptes[cle] - connu.get(cle, 0)
        if ecart > 0:
            excedents.append((cle, ecart, comptes[cle], connu.get(cle, 0)))

    if excedents:
        total = sum(e[1] for e in excedents)
        for cle, ecart, apres_n, avant_n in excedents:
            fichier, coll, quoi = cle.split("|", 2)
            print(f"  !! {fichier} — {coll} : {quoi}")
            print(f"       {avant_n} connue(s), {apres_n} trouvee(s) "
                  f"— {ecart} de plus")
            positions = [str(n) for f, n, c, q in soucis
                         if _cle(f, c, q) == cle]
            print(f"       lignes concernees : {', '.join(positions)}")
        print(f"\n  {total} lecture(s) NON BORNEE(S) ajoutee(s)")
        print("  Une collection qui grandit se lit par page, ou par agregation")
        print("  qui reduit. Jamais en entier : l'ecran aurait l'air juste et")
        print("  il mentirait.")
        return 1

    # Un compte qui BAISSE est une bonne nouvelle a enregistrer, sinon le
    # cliquet se desserre tout seul.
    reculs = [(cle, connu[cle], comptes.get(cle, 0))
              for cle in connu if comptes.get(cle, 0) < connu[cle]]
    restant = sum(comptes.values())
    if reculs:
        print(f"  echelle       ok  ({restant} connue(s), "
              f"{len(reculs)} corrigee(s) — abaissez echelle-connu.txt)")
        for cle, avant, apres in reculs[:10]:
            print(f"       {cle} = {apres}   (etait {avant})")
        return 0

    print(f"  echelle       ok  ({len(fichiers)} fichiers, "
          f"{restant} lecture(s) connue(s) a borner)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
