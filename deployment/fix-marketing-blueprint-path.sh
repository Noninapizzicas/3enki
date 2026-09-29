#!/bin/bash
# =============================================================================
# Arregla los 4 módulos de marketing que declaran bluesprint_driven SIN path.
#
# SÍNTOMA EN PRODUCCIÓN (visto en journalctl):
#   ai-gateway.blueprint.load.failed {"module":"marketing-analytics",
#     "error":"The \"paths[1]\" argument must be of type string. Received undefined"}
#
# CAUSA: declaran "blueprint_driven": true pero NO dan "blueprint_path".
#   El ai-gateway intenta leer la ruta (undefined) y revienta al arrancar.
#   Su .blueprint.json YA EXISTE y es válido (schema blueprint-interfaz-v2) —
#   solo falta declarar DÓNDE está.
#
# ARREGLO: añadir "blueprint_path": "<slug>.blueprint.json" (el patrón de
#   modules/pizzepos/recetas, que sí funciona).
#
# POR QUÉ SUDO: los ficheros son de hermes:www-data y el usuario admin no está
#   en www-data -> Permission denied. Necesita sudo.
#
# USO:  sudo ./deployment/fix-marketing-blueprint-path.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

[[ $EUID -ne 0 ]] && { echo "Ejecutar con sudo."; exit 1; }

SLUGS="marketing-analytics marketing-audience marketing-campaigns marketing-content"

echo ""
echo "=== Arreglando blueprint_path de los 4 módulos de marketing ==="
echo ""

for s in $SLUGS; do
  MF="modules/$s/module.json"
  BP="$s.blueprint.json"

  if [[ ! -f "$MF" ]]; then echo "  [!] no existe $MF — salto"; continue; fi
  if [[ ! -f "modules/$s/$BP" ]]; then echo "  [!] no existe modules/$s/$BP — salto"; continue; fi

  # ¿ya lo tiene? -> idempotente
  if grep -q '"blueprint_path"' "$MF"; then
    echo "  = $s: ya declara blueprint_path — sin cambios"
    continue
  fi

  # inserta blueprint_path justo después de blueprint_driven (preserva el resto)
  python3 - "$MF" "$BP" <<'PY'
import json, sys
mf, bp = sys.argv[1], sys.argv[2]
m = json.load(open(mf))
orden = {}
for k, v in m.items():
    orden[k] = v
    if k == 'blueprint_driven':
        orden['blueprint_path'] = bp
if 'blueprint_path' not in orden:
    orden['blueprint_path'] = bp
with open(mf, 'w') as f:
    json.dump(orden, f, ensure_ascii=False, indent=2)
    f.write('\n')
PY

  echo "  ✅ $s: blueprint_path = $BP"
done

echo ""
echo "=== Verificación ==="
for s in $SLUGS; do
  python3 - "$s" <<'PY'
import json, os, sys
s = sys.argv[1]
p = f'modules/{s}/module.json'
m = json.load(open(p))
bp = m.get('blueprint_path')
existe = bp and os.path.exists(f'modules/{s}/{bp}')
ok = m.get('blueprint_driven') is True and existe
print(f"  {'✅' if ok else '❌'} {s}: driven={m.get('blueprint_driven')} path={bp!r} fichero={existe}")
PY
done

echo ""
echo "Listo. Recuerda: el cambio vive en el repo; para producción hace falta"
echo "el redeploy (deployment/vps-setup.sh desde main)."
echo ""
