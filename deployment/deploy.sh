#!/bin/bash
# =============================================================================
# Event Core (Enki) - Deploy rápido desde git pull
#
# Uso:
#   cd /ruta/al/repo
#   git pull
#   sudo ./deployment/deploy.sh
#
# Lo que hace:
#   1. Copia archivos actualizados a /opt/enki
#   2. Reinstala dependencias si package.json cambió
#   3. Rebuild frontend si cambió
#   4. Reinicia Event Core
#   (Caddy NO se reinicia - solo si cambió el Caddyfile)
# =============================================================================

set -euo pipefail

INSTALL_DIR="/opt/enki"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

[[ $EUID -ne 0 ]] && { echo "Ejecutar con sudo: sudo ./deployment/deploy.sh"; exit 1; }

log "Desplegando desde ${REPO_DIR} → ${INSTALL_DIR}"

# Detectar si package.json cambió
NEED_NPM=false
if ! diff -q "${REPO_DIR}/package.json" "${INSTALL_DIR}/package.json" &>/dev/null; then
    NEED_NPM=true
fi

# Detectar si frontend cambió
NEED_BUILD=false
if ! diff -rq "${REPO_DIR}/frontend/src" "${INSTALL_DIR}/frontend/src" &>/dev/null 2>&1; then
    NEED_BUILD=true
fi

# Copiar archivos
log "Copiando archivos..."
rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='deployment' \
    --exclude='data' \
    "${REPO_DIR}/" "${INSTALL_DIR}/"

# Dependencias backend
if [ "$NEED_NPM" = true ]; then
    log "package.json cambió → reinstalando dependencias..."
    cd "${INSTALL_DIR}"
    npm install --production --silent 2>/dev/null
else
    log "Dependencias backend sin cambios"
fi

# Frontend
if [ "$NEED_BUILD" = true ]; then
    log "Frontend cambió → rebuildeando..."
    cd "${INSTALL_DIR}/frontend"
    npm install --silent 2>/dev/null
    npm run build --silent 2>/dev/null
else
    log "Frontend sin cambios"
fi

# Permisos
chown -R www-data:www-data "${INSTALL_DIR}"

# Reiniciar Event Core
log "Reiniciando Event Core..."
systemctl restart enki
sleep 2

if systemctl is-active --quiet enki; then
    log "Event Core reiniciado OK"
else
    warn "Event Core no arrancó. Revisar: journalctl -u enki -f"
fi

# Caddy: solo reiniciar si cambió el Caddyfile
if ! diff -q "${REPO_DIR}/deployment/caddy/Caddyfile.vps" /etc/caddy/Caddyfile &>/dev/null; then
    log "Caddyfile cambió → actualizando Caddy..."
    cp "${REPO_DIR}/deployment/caddy/Caddyfile.vps" /etc/caddy/Caddyfile
    caddy fmt --overwrite /etc/caddy/Caddyfile
    systemctl restart caddy
else
    log "Caddy sin cambios (no se reinicia)"
fi

echo ""
log "Deploy completado"
echo ""
