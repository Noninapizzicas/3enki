#!/usr/bin/env bash
# Vuelca el inventario REAL de módulos (name/description/subscribes/publishes) con jq.
# Uso: bash scripts/inventario-modulos.sh [ruta_modules]
# Ruta por defecto: /opt/enki/modules
# Cada hoja se juzga por su module.json real, no por su nombre.
set -euo pipefail
MODULES="${1:-/opt/enki/modules}"
cd "$MODULES"
for f in $(find . -maxdepth 3 -name module.json | sort); do
  echo "=== $f ==="
  jq -r '{name, description, subscribes: [.subscribes[]?.event], publishes: [.publishes[]?.event]}' "$f" 2>/dev/null
done 2>/dev/null
