#!/bin/bash
# =============================================================================
# Event Core (Enki) - Setup para VPS con Caddy
#
# Este script instala y configura:
#   1. Node.js 20 LTS
#   2. Caddy (reverse proxy con HTTPS automático)
#   3. Event Core como servicio systemd
#
# Uso:
#   chmod +x vps-setup.sh
#   sudo ./vps-setup.sh
#
# Dominio: pizzepos.es (DNS debe apuntar a la IP del VPS antes de ejecutar)
# =============================================================================

set -euo pipefail

DOMAIN="pizzepos.es"
INSTALL_DIR="/opt/enki"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VERSION="20"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Verificar root
[[ $EUID -ne 0 ]] && err "Ejecutar con sudo: sudo ./vps-setup.sh"

echo ""
echo "============================================"
echo "  Event Core (Enki) - Setup VPS"
echo "  Dominio: ${DOMAIN}"
echo "============================================"
echo ""

# ---- 1. Dependencias del sistema ----
log "Actualizando sistema..."
apt-get update -qq
apt-get install -y -qq curl git build-essential > /dev/null

# ---- 2. Node.js ----
if command -v node &> /dev/null && node -v | grep -q "v${NODE_VERSION}"; then
    log "Node.js $(node -v) ya instalado"
else
    log "Instalando Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null
    log "Node.js $(node -v) instalado"
fi

# ---- 3. Caddy ----
if command -v caddy &> /dev/null; then
    log "Caddy ya instalado: $(caddy version)"
else
    log "Instalando Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https > /dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq caddy > /dev/null
    log "Caddy instalado: $(caddy version)"
fi

# ---- 4. Copiar proyecto ----
log "Instalando Event Core en ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

# Copiar archivos del proyecto (excluyendo node_modules y .git)
rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='deployment' \
    "${REPO_DIR}/" "${INSTALL_DIR}/"

# Instalar dependencias
cd "${INSTALL_DIR}"
npm install --production --silent 2>/dev/null
log "Dependencias instaladas"

# Build del frontend si tiene package.json
if [ -f "${INSTALL_DIR}/frontend/package.json" ]; then
    cd "${INSTALL_DIR}/frontend"
    npm install --silent 2>/dev/null
    npm run build --silent 2>/dev/null || warn "Frontend build falló (puede que ya esté buildeado)"
    cd "${INSTALL_DIR}"
fi

# ---- 5. Configurar Caddy ----
log "Configurando Caddy para ${DOMAIN}..."
mkdir -p /var/log/caddy
cp "${REPO_DIR}/deployment/caddy/Caddyfile.vps" /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile

# ---- 6. Crear servicio systemd para Event Core ----
log "Creando servicio systemd para Event Core..."
cat > /etc/systemd/system/enki.service << 'UNIT'
[Unit]
Description=Enki Event Core
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/enki
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=EVENT_CORE_PORT=3000
Environment=EVENT_CORE_BROKER_PORT=1883
Environment=EVENT_CORE_LOG_LEVEL=info

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/enki/data /opt/enki/modules

[Install]
WantedBy=multi-user.target
UNIT

# Crear directorio de datos
mkdir -p "${INSTALL_DIR}/data"
chown -R www-data:www-data "${INSTALL_DIR}"

# ---- 7. Activar servicios ----
log "Activando servicios..."
systemctl daemon-reload
systemctl enable enki
systemctl enable caddy

# ---- 8. Iniciar ----
log "Iniciando Event Core..."
systemctl restart enki
sleep 2

if systemctl is-active --quiet enki; then
    log "Event Core corriendo OK"
else
    warn "Event Core no arrancó. Revisar: journalctl -u enki -f"
fi

log "Iniciando Caddy..."
systemctl restart caddy
sleep 2

if systemctl is-active --quiet caddy; then
    log "Caddy corriendo OK"
else
    warn "Caddy no arrancó. Revisar: journalctl -u caddy -f"
fi

# ---- Resumen ----
echo ""
echo "============================================"
echo "  Setup completado"
echo "============================================"
echo ""
echo "  Servicios:"
echo "    enki  → node index.js (localhost:3000)"
echo "    caddy → reverse proxy (${DOMAIN})"
echo ""
echo "  URLs:"
echo "    https://${DOMAIN}          → Frontend"
echo "    https://${DOMAIN}/health   → Health check"
echo "    https://${DOMAIN}/modules  → API REST"
echo "    wss://${DOMAIN}/mqtt       → MQTT WebSocket"
echo ""
echo "  Comandos útiles:"
echo "    sudo systemctl status enki"
echo "    sudo systemctl status caddy"
echo "    sudo journalctl -u enki -f"
echo "    sudo journalctl -u caddy -f"
echo "    sudo systemctl restart enki"
echo "    sudo systemctl restart caddy"
echo ""
echo "  MQTT directo (LAN/interno):"
echo "    mqtt://IP_DEL_VPS:1883"
echo ""
echo "  Nota: Caddy obtiene el certificado SSL automáticamente."
echo "        La primera vez puede tardar ~30 segundos."
echo ""
