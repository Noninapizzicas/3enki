#!/bin/bash
# =============================================================================
# setup-vps.sh (RAÍZ) — ALIAS LEGACY. Redirige al setup canónico.
#
# Este script era Gen-1 (instalaba en /srv/event-core + servicio event-core, sin
# el bloque Caddy /shop/*, sin enki-frontend). Producía VPS divergentes.
#
# El setup canónico es deployment/vps-setup.sh: instala en /opt/enki, crea los
# servicios enki + enki-frontend, y termina reconciliando + verificando con
# deployment/reconcile.js (el cerebro único). Todos los VPS quedan idénticos.
#
# Uso:
#   sudo ./setup-vps.sh tu-dominio.com    # con dominio (HTTPS + tiendas /shop/*)
#   sudo ./setup-vps.sh                    # modo IP (sin dominio, sin tiendas)
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  [!] setup-vps.sh (raíz) es LEGACY. Redirigiendo al setup canónico:"
echo "      → deployment/vps-setup.sh (/opt/enki + enki + reconciliador)"
echo ""

# El setup canónico pide root. Reenvía el dominio si se pasó (DOMAIN=... o \$1).
DOM="${1:-${DOMAIN:-}}"
if [ "$EUID" -ne 0 ]; then
    exec sudo bash "${SCRIPT_DIR}/deployment/vps-setup.sh" ${DOM:+"$DOM"}
else
    exec bash "${SCRIPT_DIR}/deployment/vps-setup.sh" ${DOM:+"$DOM"}
fi
