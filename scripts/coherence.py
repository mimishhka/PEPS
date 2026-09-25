"""Les erreurs qu'aucun test unitaire ne peut voir.

POURQUOI CE SCRIPT EXISTE.

Le projet a 820 tests et on trouvait encore des defauts un par un, en les
decouvrant a l'usage. Ce n'etait pas un manque de tests : c'etait la mauvaise
FAMILLE de tests. Un test unitaire verifie qu'un morceau se comporte bien.
Toutes les erreurs trouvees recemment vivaient ENTRE les morceaux, la ou chaque
cote passe son propre test tout en contredisant l'autre :

  - « packing » existait dans le flux d'expedition mais manquait aux requetes
    de Dispatch : une commande en preparation etait invisible ;
  - les pages promettaient 14 h, le code appliquait 13 h ;
  - le frontend lisait « preorder_allowed », le backend ecrivait
    « preorder_enabled » ;
  - la politique de securite autorisait un domaine que plus rien n'utilisait ;
  - des couleurs en dur ignoraient le mode nuit.

Chacune de ces erreurs est devenue une VERIFICATION permanente ci-dessous. Le
script ne trouve pas « toutes les erreurs » — rien ne le fait. Il trouve cette
famille-la, et il la trouvera toujours.

    python scripts/coherence.py            # rapport
    python scripts/coherence.py --strict   # code de sortie 1 s'il reste un ecart

A LANCER AVANT CHAQUE POUSSEE. Il ne touche a rien : lecture seule.
"""
import ast
import io
import json
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

RACINE = Path(__file__).resolve().parent.parent
SERVEUR = RACINE / "backend" / "server.py"
SRC = RACINE / "frontend" / "src"
INDEX_HTML = RACINE / "frontend" / "public" / "index.html"
TAILWIND = RACINE / "frontend" / "tailwind.config.js"

ECARTS = []


def lire(chemin):
    try:
        return io.open(chemin, encoding="utf-8", errors="replace").read()
    except FileNotFoundError:
        return ""


def ecart(verification, probleme, pourquoi):
    ECARTS.append((verification, probleme, pourquoi))


def titre(n, texte):
    print(f"\n{n}. {texte}")
    print("   " + "-" * (len(texte) + 2))


# ===========================================================================
# A. Chaque etat du flux d'expedition est connu des requetes de Dispatch.
#
# LE DEFAUT D'ORIGINE : FULFILLMENT_FLOW declarait « packing », mais les deux
# requetes de admin_dispatch_today ne le listaient pas. Une commande en
# preparation n'etait ni dans la file ni dans les retards — invisible. Et une
# commande « packed » d'un lot anterieur tombait dans le meme trou.
# ===========================================================================
def verifier_etats_expedition():
    titre("A", "Les etats du flux sont tous connus des requetes de Dispatch")
    src = lire(SERVEUR)

    m = re.search(r"FULFILLMENT_FLOW\s*=\s*\[([^\]]+)\]", src)
    if not m:
        ecart("A", "FULFILLMENT_FLOW introuvable", "le script ne peut pas verifier")
        return
    flux = re.findall(r'"([a-z_]+)"', m.group(1))
    print(f"   Flux declare : {' -> '.join(flux)}")

    # Les etats qui representent du TRAVAIL A FAIRE : tout ce qui precede
    # « shipped ». Une fois expediee, une commande n'est plus dans la file.
    try:
        avant_expedition = flux[: flux.index("shipped")]
    except ValueError:
        avant_expedition = flux
    print(f"   Travail a faire : {', '.join(avant_expedition)}")

    arbre = ast.parse(src)
    cible = next((n for n in ast.walk(arbre)
                  if isinstance(n, ast.AsyncFunctionDef) and n.name == "admin_dispatch_today"), None)
    if cible is None:
        ecart("A", "admin_dispatch_today introuvable", "le script ne peut pas verifier")
        return

    # Toutes les listes d'etats citees dans la fonction.
    listes = []
    for noeud in ast.walk(cible):
        if isinstance(noeud, ast.Dict):
            for cle, valeur in zip(noeud.keys, noeud.values):
                if (isinstance(cle, ast.Constant) and cle.value == "fulfillment_status"
                        and isinstance(valeur, ast.Dict)):
                    for c2, v2 in zip(valeur.keys, valeur.values):
                        if isinstance(c2, ast.Constant) and c2.value == "$in" and isinstance(v2, ast.List):
                            listes.append([e.value for e in v2.elts if isinstance(e, ast.Constant)])
    if not listes:
        ecart("A", "aucune liste d'etats trouvee dans la requete", "verification impossible")
        return

    couverts = set().union(*[set(l) for l in listes])
    print(f"   Etats cites dans les requetes : {', '.join(sorted(couverts))}")
    manquants = [e for e in avant_expedition if e not in couverts]
    if manquants:
        ecart("A", f"etat(s) du flux absent(s) des requetes : {', '.join(manquants)}",
              "une commande dans cet etat est invisible dans Dispatch : ni a etiqueter, "
              "ni en retard. Elle ne part jamais.")
    else:
        print("   OK — chaque etat de travail est couvert.")


# ===========================================================================
# B. Chaque domaine autorise par la politique de securite sert vraiment.
#
# LE DEFAUT D'ORIGINE : la politique autorisait ws1.postescanada-canadapost.ca
# a executer du code sur la page de paiement, longtemps apres le retrait de la
# librairie. Une permission orpheline sur un ecran de paiement.
# ===========================================================================
def verifier_politique_securite():
    titre("B", "Chaque domaine autorise par la politique de securite sert encore")
    html = lire(INDEX_HTML)
    m = re.search(r'Content-Security-Policy"\s+content="([^"]+)"', html)
    if not m:
        print("   (aucune politique declaree dans index.html)")
        return
    politique = m.group(1)
    domaines = sorted(set(re.findall(r"https://([a-z0-9.*-]+\.[a-z]{2,})", politique)))
    if not domaines:
        print("   (aucun domaine externe autorise)")
        return

    # On cherche chaque domaine dans le code et les pages, politique exclue.
    corpus = html.replace(politique, "")
    for chemin in list(SRC.rglob("*.js")) + list(SRC.rglob("*.jsx")) + list((RACINE / "frontend" / "public").glob("*")):
        if chemin.is_file():
            corpus += lire(chemin)

    for d in domaines:
        if "*" in d:
            racine_domaine = d.replace("*.", "")
            utilise = racine_domaine in corpus
        else:
            utilise = d in corpus
        if utilise:
            print(f"   OK      {d}")
        else:
            ecart("B", f"{d} est autorise mais n'apparait nulle part dans le code",
                  "une permission de script tiers qui ne sert plus reste une porte ouverte, "
                  "y compris sur la page de paiement.")
            print(f"   ORPHELIN {d}")


# ===========================================================================
# C. Chaque couleur employee dans le code existe comme jeton.
#
# LE DEFAUT D'ORIGINE : le hero portait #B7CADD, #0D3560 en dur. En mode nuit
# les roles s'echangent, ces valeurs ne suivaient pas, et le texte devenait
# quasi invisible sur fond clair.
# ===========================================================================
def verifier_couleurs():
    titre("C", "Aucune couleur en dur hors des jetons (le mode nuit les ignore)")
    jetons = set(re.findall(r'"?([a-z][a-z0-9-]*)"?\s*:\s*"rgb\(var\(--fn-', lire(TAILWIND)))
    print(f"   Jetons declares : {', '.join(sorted(jetons)) or '(aucun)'}")

    # La VITRINE et l'ADMIN ne portent pas le meme risque. Une couleur en dur
    # dans la vitrine casse le mode nuit sous les yeux d'une cliente. Dans
    # l'admin, plusieurs sont volontaires : l'apercu Google reproduit les
    # couleurs exactes d'un resultat de recherche, ce n'est pas du theme mais
    # du contenu. On les signale sans les compter comme ecart.
    vitrine, admin = {}, {}
    for chemin in SRC.rglob("*.jsx"):
        if ".test." in chemin.name:
            continue
        cible = admin if "/admin/" in chemin.as_posix() else vitrine
        contenu = lire(chemin)
        for m in re.finditer(r'(?:bg|text|border|from|to|via)-\[#([0-9A-Fa-f]{3,8})\]', contenu):
            # UNE COULEUR EN DUR ACCOMPAGNEE D'UNE VARIANTE « dark: » SUR LE
            # MEME ELEMENT N'EST PAS UN DEFAUT : le mode nuit est traite
            # explicitement. Un controle qui signale ce cas apprend a
            # l'utilisateur a ignorer ses alertes — c'est pire que pas de
            # controle. On regarde l'attribut className qui contient la
            # couleur, et on passe s'il porte sa contrepartie nuit.
            debut = contenu.rfind('className=', 0, m.start())
            fin = contenu.find('"', contenu.find('"', debut) + 1) if debut != -1 else -1
            attribut = contenu[debut:fin] if debut != -1 and fin != -1 else ""
            if re.search(r'\bdark:(?:bg|text|border)-', attribut):
                continue
            cible.setdefault("#" + m.group(1).upper(), set()).add(chemin.relative_to(RACINE).as_posix())

    if not vitrine and not admin:
        print("   OK — aucune couleur hexadecimale en dur.")
        return
    for couleur, fichiers in sorted(vitrine.items()):
        exemples = ", ".join(sorted(fichiers)[:2])
        suite = f" (+{len(fichiers) - 2})" if len(fichiers) > 2 else ""
        ecart("C", f"{couleur} en dur dans la VITRINE : {exemples}{suite}",
              "cette couleur ne suit pas le theme : en mode nuit elle reste identique "
              "alors que le fond s'inverse. C'est le defaut qui rendait le hero illisible.")
        print(f"   VITRINE  {couleur}  {exemples}{suite}")
    if not vitrine:
        print("   OK — aucune couleur en dur dans la vitrine.")
    for couleur, fichiers in sorted(admin.items()):
        exemples = ", ".join(sorted(fichiers)[:2])
        print(f"   admin    {couleur}  {exemples}  (a verifier, souvent volontaire)")


# ===========================================================================
# D. Le frontend et le backend parlent le meme vocabulaire d'etats.
#
# LE DEFAUT D'ORIGINE : le frontend lisait « preorder_allowed » quand le
# backend ecrivait « preorder_enabled ». Chaque cote passait ses tests : le
# backend ecrivait bien son champ, le frontend lisait bien le sien. Entre les
# deux, la precommande ne s'affichait jamais.
#
# Meme famille pour les etats d'expedition : une comparaison du frontend
# contre un etat que le backend n'ecrit jamais est du code mort silencieux.
# ===========================================================================
def verifier_vocabulaire():
    titre("D", "Le frontend compare des etats que le backend ecrit vraiment")
    src = lire(SERVEUR)

    # Le vocabulaire que le backend connait : les flux declares, plus tout
    # etat qu'il ecrit explicitement.
    connus = set()
    for m in re.finditer(r"FULFILLMENT_FLOW\s*=\s*\[([^\]]+)\]", src):
        connus |= set(re.findall(r'"([a-z_]+)"', m.group(1)))
    for m in re.finditer(r'"fulfillment_status"\s*:\s*"([a-z_]+)"', src):
        connus.add(m.group(1))
    for m in re.finditer(r'"payment_status"\s*:\s*"([a-z_]+)"', src):
        connus.add(m.group(1))
    # Les etats cites dans les requetes comptent aussi : ils existent en base.
    for m in re.finditer(r'"(?:fulfillment_status|payment_status)"\s*:\s*\{\s*"\$in"\s*:\s*\[([^\]]+)\]', src):
        connus |= set(re.findall(r'"([a-z_]+)"', m.group(1)))
    if not connus:
        ecart("D", "aucun vocabulaire d'etat trouve dans le backend", "verification impossible")
        return
    print(f"   Etats connus du backend : {', '.join(sorted(connus))}")

    # Les comparaisons du frontend sur un champ d'etat.
    suspects = {}
    motif = re.compile(r'(?:fulfillment_status|payment_status)\s*===?\s*["\']([a-z_]+)["\']')
    for chemin in SRC.rglob("*.jsx"):
        if ".test." in chemin.name:
            continue
        for m in motif.finditer(lire(chemin)):
            etat = m.group(1)
            if etat not in connus:
                suspects.setdefault(etat, set()).add(chemin.relative_to(RACINE).as_posix())

    if not suspects:
        print("   OK — chaque etat compare par le frontend existe cote backend.")
        return
    for etat, fichiers in sorted(suspects.items()):
        ecart("D", f"le frontend compare a « {etat} », que le backend n'ecrit jamais : "
                   + ", ".join(sorted(fichiers)[:2]),
              "la comparaison est toujours fausse. La branche ne s'execute jamais, "
              "et aucun test ne le signale puisque chaque cote est coherent avec lui-meme.")
        print(f"   INCONNU  {etat}  {', '.join(sorted(fichiers)[:2])}")


# ===========================================================================
# E. Les promesses affichees et les reglages appliques disent la meme chose.
#
# LE DEFAUT D'ORIGINE : les pages Conformite et FAQ annoncaient une coupure a
# 14 h, le code appliquait ORDER_CUTOFF_HOUR=13. Une commande payee a 13 h 30
# etait annoncee « jour meme » et traitee le lendemain.
# ===========================================================================
def verifier_promesses():
    titre("E", "Les promesses des pages correspondent aux reglages du code")
    defaut = None
    # Le reglage s'ecrit : ORDER_CUTOFF_HOUR = int(os.environ.get("...", "13"))
    # C'est le defaut ENTRE GUILLEMETS qu'il faut lire. Un regex trop gourmand
    # attrapait la parenthese fermante et ne trouvait rien.
    m = re.search(r'ORDER_CUTOFF_HOUR\s*=\s*int\(\s*os\.environ\.get\([^,]+,\s*"(\d{1,2})"',
                  lire(SERVEUR))
    if m:
        defaut = int(m.group(1))
    print(f"   ORDER_CUTOFF_HOUR par defaut dans le code : {defaut if defaut is not None else '?'}")

    heures_fr, heures_en = set(), set()
    for nom in ("Compliance.jsx", "Faq.jsx"):
        t = lire(SRC / "pages" / nom)
        heures_fr |= {int(h) for h in re.findall(r"(?:avant|apr[eè]s)\s+(\d{1,2})\s*h\b", t)}
        for h, ampm in re.findall(r"(\d{1,2}):00\s*(a\.m\.|p\.m\.)", t):
            heures_en.add(int(h) + (12 if ampm.startswith("p") and int(h) != 12 else 0))

    print(f"   Heures annoncees en francais : {sorted(heures_fr) or '(aucune)'}")
    print(f"   Heures annoncees en anglais  : {sorted(heures_en) or '(aucune)'}")

    if defaut is None:
        print("   (reglage introuvable : verification impossible)")
        return
    for langue, heures in (("francaise", heures_fr), ("anglaise", heures_en)):
        fautives = sorted(h for h in heures if h != defaut)
        if fautives:
            ecart("E", f"la version {langue} annonce {fautives} alors que le code applique {defaut}",
                  "une commande payee entre les deux heures est annoncee « jour meme » et "
                  "traitee le lendemain.")
    if not any(h != defaut for h in heures_fr | heures_en):
        print("   OK — les pages et le code disent la meme heure.")


# ===========================================================================
def principal():
    strict = "--strict" in sys.argv
    print("=" * 74)
    print("COHERENCE — les erreurs qui vivent ENTRE les morceaux")
    print("=" * 74)
    print("\nUn test unitaire verifie qu'un morceau se comporte bien. Ces")
    print("verifications cherchent les endroits ou deux morceaux se")
    print("contredisent, alors que chacun passe son propre test.")

    for f in (verifier_etats_expedition, verifier_politique_securite,
              verifier_couleurs, verifier_vocabulaire, verifier_promesses):
        try:
            f()
        except Exception as e:
            ecart(f.__name__, f"la verification a echoue : {type(e).__name__} — {e}",
                  "un ecart non verifie n'est pas un ecart absent")

    print("\n" + "=" * 74)
    if not ECARTS:
        print("AUCUN ECART. Cette famille d'erreurs est propre.")
        print("\nCe que ce script NE voit PAS, et qui demande un oeil humain :")
        print("  - le rendu visuel et la mise en page ;")
        print("  - le comportement reel de Postes Canada, NOWPayments, Google ;")
        print("  - un parcours d'achat complet avec de vrais paiements ;")
        print("  - ce qui arrive apres plusieurs jours d'usage reel.")
        print("=" * 74)
        return 0

    print(f"{len(ECARTS)} ECART(S) A REGLER")
    print("=" * 74)
    for i, (verif, probleme, pourquoi) in enumerate(ECARTS, 1):
        print(f"\n{i}. [{verif}] {probleme}")
        print(f"   Consequence : {pourquoi}")
    print("\n" + "=" * 74)
    return 1 if strict else 0


if __name__ == "__main__":
    sys.exit(principal())
