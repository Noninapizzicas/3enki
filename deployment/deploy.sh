#!/bin/bash
# =============================================================================
# Event Core (Enki) - Deploy convergente (perfil VPS)
#
# Uso:
#   cd /opt/enki   (o el repo que despliegas)
#   git pull
#   sudo ./deployment/deploy.sh
#
# Qué hace:
#   1. Copia el código actualizado a /opt/enki  (rsync)
#   2. Reinstala deps backend si package.json cambió
#   3. Rebuild frontend si cambió
#   4. RECONCILIA la infra (dirs, systemd, Caddy) con deployment/reconcile.js
#      → el reconciliador es idempotente y ES el que deja el VPS funcional e
#        idéntico en las 20 máquinas. Aquí NO se toca /etc a mano.
#
# El reconciliador detecta el dominio del Caddyfile vivo (o .env) él solo.
# =============================================================================

set -euo pipefail

INSTALL_DIR="/opt/enki"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

[[ $EUID -ne 0 ]] && { echo "Ejecutar con sudo: sudo ./deployment/deploy.sh"; exit 1; }

log "Desplegando desde ${REPO_DIR} → ${INSTALL_DIR}"

# ¿cambió package.json? ¿cambió el frontend?
NEED_NPM=false
diff -q "${REPO_DIR}/package.json" "${INSTALL_DIR}/package.json" &>/dev/null || NEED_NPM=true
NEED_BUILD=false
diff -rq "${REPO_DIR}/frontend/src" "${INSTALL_DIR}/frontend/src" &>/dev/null 2>&1 || NEED_BUILD=true

# 1) Copiar código (data/public/node_modules quedan intactos)
log "Copiando archivos..."
rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='data' \
    --exclude='public' \
    "${REPO_DIR}/" "${INSTALL_DIR}/"

# 2) Deps backend
if [ "$NEED_NPM" = true ]; then
    log "package.json cambió → npm install..."
    (cd "${INSTALL_DIR}" && npm install --production --silent 2>/dev/null)
else
    log "Dependencias backend sin cambios"
fi

# 3) Frontend
if [ "$NEED_BUILD" = true ]; then
    log "Frontend cambió → rebuild..."
    (cd "${INSTALL_DIR}/frontend" && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null)
else
    log "Frontend sin cambios"
fi

chown -R www-data:www-data "${INSTALL_DIR}" 2>/dev/null || true

# 4) RECONCILIAR la infra — UN solo cerebro, idempotente. Deja el VPS funcional
#    (dirs shop, ReadWritePaths, bloque Caddy /shop/*, servicios) e igual en todos.
#    Corre DESDE EL REPO (deployment/ se excluye del rsync a /opt/enki): el
#    reconciliador resuelve sus plantillas por __dirname y escribe rutas absolutas.
log "Reconciliando infra (dirs · systemd · Caddy)..."
node "${REPO_DIR}/deployment/reconcile.js"

echo ""
log "Deploy completado"
echo ""
