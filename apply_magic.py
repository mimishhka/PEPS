#!/usr/bin/env python3
import ast, hashlib, shutil, sys, os, datetime
PATH = "backend/server.py"
if not os.path.exists(PATH):
    print("ERREUR: lance depuis /app (backend/server.py introuvable). "); sys.exit(1)
src = open(PATH, encoding="utf-8").read()
if "/auth/magic/request" in src:
    print("Déjà appliqué. Rien à faire."); sys.exit(0)
IMP_OLD = "from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File"
if IMP_OLD not in src:
    print("ERREUR: import fastapi introuvable."); sys.exit(1)
src = src.replace(IMP_OLD, IMP_OLD + ", Body", 1)
ANCHOR = '@api.get("/auth/me")\nasync def me(user: dict = Depends(get_current_user)):\n    return user\n'
if ANCHOR not in src:
    print("ERREUR: ancre /auth/me introuvable."); sys.exit(1)
BLOCK = open("magic_backend_block.py", encoding="utf-8").read()
src = src.replace(ANCHOR, ANCHOR + "\n\n" + BLOCK + "\n", 1)
REG_OLD = "        asyncio.create_task(_trash_auto_purge_watchdog())\n        asyncio.create_task(_rollover_watchdog())"
if REG_OLD not in src:
    print("ERREUR: ancre startup introuvable."); sys.exit(1)
src = src.replace(REG_OLD, REG_OLD + "\n        asyncio.create_task(_magic_tokens_cleanup())", 1)
try:
    ast.parse(src)
except SyntaxError as e:
    print("ERREUR de syntaxe, aucune écriture:", e); sys.exit(1)
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy(PATH, f"{PATH}.bak-{stamp}")
open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — appliqué. Backup: {PATH}.bak-{stamp}")
print("MD5:", hashlib.md5(src.encode()).hexdigest())
print("Redémarre le backend Emergent.")
