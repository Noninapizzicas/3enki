#!/bin/bash
# =============================================================================
# Event Core (Enki) - Setup para VPS
#
# Este script instala y configura:
#   1. Node.js 20 LTS
#   2. Caddy (reverse proxy con HTTPS automático o HTTP para IP)
#   3. Event Core + Frontend como servicios systemd
#
# Uso:
#   sudo ./vps-setup.sh                    # Modo IP (sin dominio, HTTP en puerto 80)
#   sudo ./vps-setup.sh pizzepos.es        # Modo dominio (HTTPS automático)
#
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
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
[[ $EUID -ne 0 ]] && err "Ejecutar con sudo: sudo ./vps-setup.sh [dominio]"

# Determinar modo
if [ -n "$DOMAIN" ]; then
    MODE="domain"
    ORIGIN="https://${DOMAIN}"
else
    MODE="ip"
    # Detectar IP pública
    SERVER_IP=$(hostname -I | awk '{print $1}')
    ORIGIN="http://${SERVER_IP}"
fi

echo ""
echo "============================================"
if [ "$MODE" = "domain" ]; then
    echo "  Event Core (Enki) - Setup VPS"
    echo "  Dominio: ${DOMAIN}"
    echo "  Modo: HTTPS automático (Let's Encrypt)"
else
    echo "  Event Core (Enki) - Setup VPS"
    echo "  IP: ${SERVER_IP}"
    echo "  Modo: HTTP (sin dominio)"
fi
echo "============================================"
echo ""

# ---- 1. Dependencias del sistema ----
log "Actualizando sistema..."
apt-get update -qq
apt-get install -y -qq curl git build-essential rsync > /dev/null

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

# Asegurar que caddy.service existe
if ! systemctl list-unit-files 2>/dev/null | grep -q 'caddy.service'; then
    log "Creando servicio systemd para Caddy..."
    cat > /etc/systemd/system/caddy.service << 'CADDYUNIT'
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
CADDYUNIT
    id -u caddy &>/dev/null || useradd --system --home /var/lib/caddy --shell /usr/sbin/nologin caddy
    mkdir -p /var/lib/caddy/.config/caddy /var/lib/caddy/.local/share/caddy
    chown -R caddy:caddy /var/lib/caddy
    systemctl daemon-reload
fi

# ---- 4. Copiar proyecto ----
log "Instalando Event Core en ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='deployment' \
    "${REPO_DIR}/" "${INSTALL_DIR}/"

# Instalar dependencias backend
cd "${INSTALL_DIR}"
npm install --production --silent 2>/dev/null
log "Dependencias backend instaladas"

# Build del frontend (SvelteKit con adapter-node)
if [ -f "${INSTALL_DIR}/frontend/package.json" ]; then
    log "Construyendo frontend..."
    cd "${INSTALL_DIR}/frontend"
    npm install --silent 2>/dev/null
    npm run build 2>&1 || warn "Frontend build falló"
    log "Frontend construido en frontend/build/"
    cd "${INSTALL_DIR}"
fi

# ---- 5. Configurar Caddy ----
mkdir -p /etc/caddy /var/log/caddy
chown caddy:caddy /var/log/caddy 2>/dev/null || true

if [ "$MODE" = "domain" ]; then
    log "Configurando Caddy para ${DOMAIN} (HTTPS)..."
    cp "${REPO_DIR}/deployment/caddy/Caddyfile.vps" /etc/caddy/Caddyfile
else
    log "Configurando Caddy para ${SERVER_IP} (HTTP)..."
    cat > /etc/caddy/Caddyfile << CADDYCONF
# Event Core - Modo IP (sin dominio, HTTP)
:80 {
	# API REST
	handle /modules/* {
		reverse_proxy localhost:3000
	}

	handle /health {
		reverse_proxy localhost:3000
	}

	handle /stats {
		reverse_proxy localhost:3000
	}

	handle /ui/* {
		reverse_proxy localhost:3000
	}

	# MQTT WebSocket
	handle /mqtt {
		reverse_proxy localhost:9001
	}

	# Frontend SvelteKit
	handle {
		reverse_proxy localhost:3001
	}

	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
	}

	log {
		output file /var/log/caddy/enki.log
		format json
	}
}
CADDYCONF
fi

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

# ---- 6b. Crear servicio systemd para Frontend ----
log "Creando servicio systemd para Frontend..."
cat > /etc/systemd/system/enki-frontend.service << UNIT
[Unit]
Description=Enki Frontend (SvelteKit)
After=network.target enki.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/enki/frontend
ExecStart=/usr/bin/node build/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=ORIGIN=${ORIGIN}

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/enki/frontend

[Install]
WantedBy=multi-user.target
UNIT

# Crear directorio de datos y asignar permisos
mkdir -p "${INSTALL_DIR}/data"
chown -R www-data:www-data "${INSTALL_DIR}"

# ---- 7. Activar servicios ----
log "Activando servicios..."
systemctl daemon-reload
systemctl enable enki
systemctl enable enki-frontend
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

log "Iniciando Frontend..."
systemctl restart enki-frontend
sleep 2

if systemctl is-active --quiet enki-frontend; then
    log "Frontend corriendo OK en puerto 3001"
else
    warn "Frontend no arrancó. Revisar: journalctl -u enki-frontend -f"
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
echo "    enki           → node index.js (localhost:3000)"
echo "    enki-frontend  → SvelteKit (localhost:3001)"
echo "    caddy          → reverse proxy"
echo ""

if [ "$MODE" = "domain" ]; then
    echo "  URLs:"
    echo "    https://${DOMAIN}          → Frontend"
    echo "    https://${DOMAIN}/health   → Health check"
    echo "    https://${DOMAIN}/modules  → API REST"
    echo "    wss://${DOMAIN}/mqtt       → MQTT WebSocket"
else
    echo "  URLs:"
    echo "    http://${SERVER_IP}          → Frontend"
    echo "    http://${SERVER_IP}/health   → Health check"
    echo "    http://${SERVER_IP}/modules  → API REST"
    echo "    ws://${SERVER_IP}/mqtt       → MQTT WebSocket"
fi

echo ""
echo "  Comandos útiles:"
echo "    sudo systemctl status enki"
echo "    sudo systemctl status enki-frontend"
echo "    sudo systemctl status caddy"
echo "    sudo journalctl -u enki -f"
echo "    sudo journalctl -u enki-frontend -f"
echo ""
echo "  MQTT directo (LAN/interno):"
echo "    mqtt://$(hostname -I | awk '{print $1}'):1883"
echo ""

if [ "$MODE" = "domain" ]; then
    echo "  Nota: Caddy obtiene el certificado SSL automáticamente."
    echo "        La primera vez puede tardar ~30 segundos."
else
    echo "  Nota: Modo HTTP sin dominio. Para HTTPS, ejecutar:"
    echo "        sudo ./vps-setup.sh tu-dominio.com"
fi
echo ""
