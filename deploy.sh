#!/bin/bash
# =============================================================================
# deploy.sh (RAÍZ) — ALIAS LEGACY. Redirige al camino canónico convergente.
#
# Este script era Gen-1 (instalaba en /srv/event-core + servicio event-core, sin
# el bloque Caddy /shop/*). Fue la causa de que unos VPS quedaran "atrasados".
#
# El camino canónico es deployment/deploy.sh, que delega la infra al
# reconciliador idempotente (deployment/reconcile.js). Si este VPS todavía está
# en el layout viejo (/srv/event-core), el reconciliador lo MIGRA a /opt/enki
# solo, la primera vez. No hay que hacer nada a mano.
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "  [!] deploy.sh (raíz) es LEGACY. Redirigiendo al camino canónico:"
echo "      → deployment/deploy.sh (reconciliador convergente)"
echo ""

# git pull igual que antes (si es un repo), luego el deploy canónico.
if [ -d "${SCRIPT_DIR}/.git" ] && [[ "${1:-}" != "--no-pull" ]]; then
    BRANCH="$(git -C "${SCRIPT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
    git -C "${SCRIPT_DIR}" pull origin "${BRANCH}" || echo "  [!] git pull falló, sigo con el código actual"
fi

if [ "$EUID" -ne 0 ]; then
    exec sudo bash "${SCRIPT_DIR}/deployment/deploy.sh"
else
    exec bash "${SCRIPT_DIR}/deployment/deploy.sh"
fi
