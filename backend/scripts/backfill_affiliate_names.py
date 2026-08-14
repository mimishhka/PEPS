"""Backfill first_name / last_name pour les affiliés existants (créés avant
le refactor Août 2026). Splitte le champ legacy `name` sur le premier espace.

Règles :
- Si first_name existe déjà → skip.
- Si name est vide → assign email prefix comme first_name, "" comme last_name
  (l'admin pourra corriger via la fiche).
- "Marie" → first_name="Marie", last_name=""
- "Marie Dubois" → first_name="Marie", last_name="Dubois"
- "Marie Anne Dubois" → first_name="Marie", last_name="Anne Dubois"

Idempotent — rejoue safe.
"""
import asyncio, os, sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    cursor = db.affiliates.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1,
                                     "first_name": 1, "last_name": 1, "company": 1})
    updated = skipped = 0
    async for aff in cursor:
        if aff.get("first_name"):
            skipped += 1
            continue
        raw_name = (aff.get("name") or "").strip()
        if raw_name:
            parts = raw_name.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""
        else:
            first_name = (aff.get("email") or "").split("@")[0] or "Affiliate"
            last_name = ""
        await db.affiliates.update_one(
            {"id": aff["id"]},
            {"$set": {
                "first_name": first_name,
                "last_name": last_name,
                "company": aff.get("company") or "",
            }},
        )
        print(f"  → {aff['email']}: '{raw_name}' → first={first_name!r} last={last_name!r}")
        updated += 1
    print("")
    print(f"Backfill terminé : {updated} mis à jour, {skipped} déjà OK.")


asyncio.run(main())
