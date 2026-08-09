"""Dry-run de la confirmation Interac Autodeposit — 100% lecture seule.

Valide, sans rien modifier :
  1. L'authentification Microsoft Graph (app-only, .env INTERAC_GRAPH_*)
  2. La lecture de la boîte orders@... (permission Mail.ReadWrite)
  3. L'extraction des références FN-... et des montants
  4. Le verdict qu'aurait produit le watchdog (auto-confirmé vs revue manuelle)

Aucun email n'est marqué lu, aucune commande n'est modifiée.

Usage (sur le serveur, dans backend/) :
    python3 dryrun_interac.py
"""
import asyncio

from server import (
    INTERAC_GRAPH_USER,
    _extract_interac_refs,
    _graph_access_token,
    _graph_unread_messages,
    _parse_amounts,
    _strip_html,
    db,
)


async def main() -> None:
    token = await _graph_access_token()
    if not token:
        print("ECHEC: jeton Graph introuvable -> .env INTERAC_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET manquants ou erreur OAuth.")
        return
    print(f"OK: jeton Graph obtenu (boite surveillee = {INTERAC_GRAPH_USER})")

    try:
        messages = await _graph_unread_messages(token)
    except Exception as ex:
        print(f"ECHEC: lecture de la boite -> {ex}")
        print("  Un 403 = consentement admin Mail.ReadWrite manquant ou secret errone.")
        return
    print(f"OK: {len(messages)} email(s) non lu(s) dans la boite\n")

    interac_msgs = [m for m in messages if "interac" in (((m.get("from") or {}).get("emailAddress") or {}).get("address") or "").lower()]
    print(f"-> {len(interac_msgs)} notification(s) Interac (expediteur interac.ca) parmi elles\n")

    for msg in interac_msgs:
        subj = msg.get("subject") or "(sans sujet)"
        from_addr = ((msg.get("from") or {}).get("emailAddress") or {}).get("address") or "?"
        body = msg.get("body") or {}
        text = f"{subj}\n{_strip_html(body.get('content') or '')}"
        refs = _extract_interac_refs(text)
        amounts = _parse_amounts(text)
        print(f"--- {subj} ---")
        print(f"    de: {from_addr}")
        print(f"    refs: {refs or 'AUCUNE'}")
        print(f"    montants trouves: {amounts or 'AUCUN'}")
        for ref in refs:
            order = await db.orders.find_one(
                {"order_number": ref, "payment_status": "awaiting_etransfer"}, {"_id": 0}
            )
            if not order:
                print(f"    [{ref}] -> AUCUNE commande en attente (deja payee ou inconnue)")
                continue
            total = float(order.get("total", 0))
            if not amounts or not any(abs(a - total) <= 0.01 for a in amounts):
                print(f"    [{ref}] -> REVUE MANUELLE (attendu {total:.2f} CAD, montant absent/divergent)")
            else:
                print(f"    [{ref}] -> SERAIT AUTO-CONFIRME (montant {total:.2f} CAD correspond)")
        print()

    print("AUCUN email marque lu, AUCUNE commande modifiee.")


if __name__ == "__main__":
    asyncio.run(main())
