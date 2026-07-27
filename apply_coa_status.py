#!/usr/bin/env python3
# Refactor COA -> coa_status (source de vérité unique par variante).
# Idempotent, backup horodaté, validation AST avant écriture.
# À lancer depuis /app :  python3 apply_coa_status.py
import ast, hashlib, shutil, sys, os, datetime

PATH = "backend/server.py"
if not os.path.exists(PATH):
    print("ERREUR: lance depuis /app (backend/server.py introuvable)."); sys.exit(1)

s = open(PATH, encoding="utf-8").read()

if "coa_status: str" in s and "MIGRATION — variant.coa_status" in s:
    print("Déjà appliqué. Rien à faire."); sys.exit(0)

edits = []

# 1. Model
edits.append((
'''    badge_coa_available: bool = False
    badge_coa_pending: bool = False
    badge_coming_soon: bool = False
    coa_url: str = ""''',
'''    # COA status — single source of truth per variant (replaces the two legacy
    # booleans badge_coa_available / badge_coa_pending which could contradict).
    #   "available" : a COA exists for this lot (coa_url should be set).
    #   "pending"   : COA not ready yet but coming — shown for transparency.
    #                 The variant stays purchasable, with a visible warning.
    #   "none"      : nothing shown.
    coa_status: str = "none"  # "available" | "pending" | "none"
    # Legacy booleans kept for backward-compat / rollback; no longer read for display.
    badge_coa_available: bool = False
    badge_coa_pending: bool = False
    badge_coming_soon: bool = False
    coa_url: str = ""''',
"model"))

# 2. Preorder logic
edits.append((
'        coa_coming = bool(v.get("badge_coa_pending") or v.get("badge_coming_soon"))',
'''        # coa_status "pending" no longer blocks or forces preorder on its own
        # (variant stays purchasable with a warning). Only badge_coming_soon
        # (product not yet launched) drives the "coming" preorder path here.
        coa_coming = bool(v.get("badge_coming_soon"))''',
"preorder"))

# 3. Synthetic _default variant
edits.append((
'''        "badge_coa_available": bool(p.get("coa_url")),
        "badge_coa_pending": not bool(p.get("coa_url")),
        "badge_coming_soon": False,
        "coa_url": p.get("coa_url", "") or "",''',
'''        "coa_status": "available" if p.get("coa_url") else "none",
        "badge_coa_available": bool(p.get("coa_url")),
        "badge_coa_pending": not bool(p.get("coa_url")),
        "badge_coming_soon": False,
        "coa_url": p.get("coa_url", "") or "",''',
"default_variant"))

# 4. Seed default_variant
edits.append((
'''            "badge_coa_available": True,
            "badge_coa_pending": False,
            "badge_coming_soon": False,
            "preorder_enabled": False,''',
'''            "coa_status": "available",
            "badge_coa_available": True,
            "badge_coa_pending": False,
            "badge_coming_soon": False,
            "preorder_enabled": False,''',
"seed_variant"))

# 5. Migration (append after shipping methods insert_many block)
mig_anchor='''                "name": "International Tracked",
                "cost_cad": 45.0,
                "eta_days": "10-20 business days",
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ])
'''
mig_block=mig_anchor+'''
    # ------------------------------------------------------------------
    # MIGRATION — variant.coa_status (single source of truth)
    # Converts legacy per-variant booleans to the new coa_status field, once,
    # only on variants that don't yet have it. Non-destructive: legacy booleans
    # are left in place for rollback. Mapping:
    #   coa_url present OR badge_coa_available  -> "available"
    #   else badge_coa_pending                  -> "pending"
    #   else                                    -> "none"
    # ------------------------------------------------------------------
    async for prod in db.products.find({"variants": {"$exists": True, "$ne": []}}, {"variants": 1}):
        vs = prod.get("variants") or []
        changed = False
        for v in vs:
            if "coa_status" in v and v["coa_status"] in ("available", "pending", "none"):
                continue
            if v.get("coa_url") or v.get("badge_coa_available"):
                v["coa_status"] = "available"
            elif v.get("badge_coa_pending"):
                v["coa_status"] = "pending"
            else:
                v["coa_status"] = "none"
            changed = True
        if changed:
            await db.products.update_one({"_id": prod["_id"]}, {"$set": {"variants": vs}})
'''
edits.append((mig_anchor, mig_block, "migration"))

# Apply
for old,new,label in edits:
    c=s.count(old)
    if c!=1:
        print(f"ERREUR ancre '{label}': trouvée {c} fois (attendu 1). Aucune écriture."); sys.exit(1)
    s=s.replace(old,new,1)

# Validate before writing
try:
    ast.parse(s)
except SyntaxError as e:
    print("ERREUR de syntaxe après patch, aucune écriture:", e); sys.exit(1)

stamp=datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy(PATH, f"{PATH}.bak-{stamp}")
open(PATH,"w",encoding="utf-8").write(s)
print(f"OK — appliqué. Backup: {PATH}.bak-{stamp}")
print("MD5:", hashlib.md5(s.encode()).hexdigest())
print("Redémarre le backend Emergent — la migration convertit tes variantes au démarrage.")
