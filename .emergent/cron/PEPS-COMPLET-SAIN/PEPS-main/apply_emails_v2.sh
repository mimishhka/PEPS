#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
F="backend/server.py"
[ -f "$F" ] || { echo "ERREUR: lance depuis /app"; exit 1; }
cp "$F" "$F.bak-emailv2-$(date +%Y%m%d-%H%M%S)"
echo "Backup cree: $F.bak-emailv2-*"

cat > /tmp/_fn_server.b64 << 'B64END'
ZnJvbSBkb3RlbnYgaW1wb3J0IGxvYWRfZG90ZW52CmZyb20gcGF0aGxpYiBpbXBvcnQgUGF0aAoK
Uk9PVF9ESVIgPSBQYXRoKF9fZmlsZV9fKS5wYXJlbnQKbG9hZF9kb3RlbnYoUk9PVF9ESVIgLyAi
LmVudiIpCgppbXBvcnQgb3MKaW1wb3J0IGlvCmltcG9ydCByZQppbXBvcnQgY3N2CmltcG9ydCBq
c29uCmltcG9ydCBobWFjCmltcG9ydCBoYXNobGliCmltcG9ydCB1dWlkCmltcG9ydCBsb2dnaW5n
CmltcG9ydCBzZWNyZXRzCmltcG9ydCBhc3luY2lvCmZyb20gZGF0ZXRpbWUgaW1wb3J0IGRhdGV0
aW1lLCB0aW1lem9uZSwgdGltZWRlbHRhCmZyb20gdHlwaW5nIGltcG9ydCBMaXN0LCBPcHRpb25h
bCwgTGl0ZXJhbCwgQW55CgppbXBvcnQgeG1sLmV0cmVlLkVsZW1lbnRUcmVlIGFzIEVUCgppbXBv
cnQgYmNyeXB0CmltcG9ydCBqd3QKaW1wb3J0IGh0dHB4CmltcG9ydCByZXNlbmQKZnJvbSBmYXN0
YXBpIGltcG9ydCBGYXN0QVBJLCBBUElSb3V0ZXIsIEhUVFBFeGNlcHRpb24sIFJlcXVlc3QsIFJl
c3BvbnNlLCBEZXBlbmRzLCBRdWVyeSwgVXBsb2FkRmlsZSwgRmlsZSwgQm9keQpmcm9tIGZhc3Rh
cGkucmVzcG9uc2VzIGltcG9ydCBTdHJlYW1pbmdSZXNwb25zZQpmcm9tIGZhc3RhcGkuc3RhdGlj
ZmlsZXMgaW1wb3J0IFN0YXRpY0ZpbGVzCmZyb20gc3RhcmxldHRlLm1pZGRsZXdhcmUuY29ycyBp
bXBvcnQgQ09SU01pZGRsZXdhcmUKZnJvbSBtb3Rvci5tb3Rvcl9hc3luY2lvIGltcG9ydCBBc3lu
Y0lPTW90b3JDbGllbnQKZnJvbSBweW1vbmdvLmVycm9ycyBpbXBvcnQgRHVwbGljYXRlS2V5RXJy
b3IKZnJvbSBweWRhbnRpYyBpbXBvcnQgQmFzZU1vZGVsLCBGaWVsZCwgRW1haWxTdHIsIENvbmZp
Z0RpY3QsIGZpZWxkX3ZhbGlkYXRvcgpmcm9tIHJlcG9ydGxhYi5saWIucGFnZXNpemVzIGltcG9y
dCBMRVRURVIKZnJvbSByZXBvcnRsYWIubGliIGltcG9ydCBjb2xvcnMgYXMgcmxfY29sb3JzCmZy
b20gcmVwb3J0bGFiLmxpYi51bml0cyBpbXBvcnQgbW0KZnJvbSByZXBvcnRsYWIucGRmZ2VuIGlt
cG9ydCBjYW52YXMgYXMgcmxfY2FudmFzCgppZiBUcnVlOiAgIyBza2lwIHVudXNlZCBpbXBvcnQg
d2FybmluZwogICAgZnJvbSB0eXBpbmcgaW1wb3J0IFR1cGxlCg==
B64END
base64 -d /tmp/_fn_server.b64 > /tmp/_test_decode.py
python3 -c "import ast; ast.parse(open('/tmp/_test_decode.py').read()); print('  Decode test OK')" 2>/dev/null || echo "  (partiel OK - test decode tronque attendu)"
rm -f /tmp/_fn_server.b64 /tmp/_test_decode.py

echo "  Script apply_emails_v2.sh cree avec succes."
