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

# Args: el dominio (posicional) y --docker (flag). Se aceptan en cualquier orden.
# --docker se prefiere a la env var ENKI_ENABLE_DOCKER porque `sudo` limpia el entorno
# (ENKI_ENABLE_DOCKER=1 sudo … NO llega al script; sudo … --docker sí).
DOMAIN=""
for _arg in "$@"; do
    case "$_arg" in
        --docker) ENKI_ENABLE_DOCKER=1 ;;
        --*)      echo "[!] flag desconocido ignorado: $_arg" ;;
        *)        DOMAIN="$_arg" ;;
    esac
done
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

# ---- 1b. Librerías para Chromium headless (transporte WhatsApp open-wa) ----
# open-wa conduce un Chromium sin pantalla; el binario lo trae @open-wa/wa-automate
# (puppeteer) al hacer npm install, pero necesita estas librerías del sistema para
# arrancar. Las instalamos UNA A UNA: 'apt-get install pkg1 pkg2 ...' es todo-o-nada
# (si un nombre no existe, no instala NINGUNO). Incluimos los nombres viejos Y los
# 't64' de Ubuntu 24.04: cada VPS instala los que apliquen, los demás se ignoran.
log "Instalando librerías de Chromium (para open-wa)..."
CHROMIUM_LIBS="ca-certificates fonts-liberation libnss3 libnspr4 \
  libatk1.0-0 libatk1.0-0t64 libatk-bridge2.0-0 libatk-bridge2.0-0t64 \
  libcups2 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2 libasound2t64 libatspi2.0-0 libatspi2.0-0t64 \
  libx11-6 libxcb1 libxext6 libxi6 libglib2.0-0 libglib2.0-0t64 libxrender1"
_chromium_ok=0; _chromium_missing=""
for _pkg in $CHROMIUM_LIBS; do
  if apt-get install -y -qq "$_pkg" > /dev/null 2>&1; then
    _chromium_ok=$((_chromium_ok + 1))
  else
    _chromium_missing="$_chromium_missing $_pkg"
  fi
done
log "Chromium: ${_chromium_ok} libs instaladas.${_chromium_missing:+ (no aplicables a esta versión:${_chromium_missing} )}"

# Navegador para open-wa: Google Chrome stable (.deb real, trae sus deps). openwa-service
# lo auto-detecta en /usr/bin/google-chrome-stable. Evita el lío del Chromium de puppeteer
# descargado en el HOME de root (sudo npm install) mientras el servicio corre como www-data.
if command -v google-chrome-stable > /dev/null 2>&1; then
    log "Google Chrome ya instalado: $(google-chrome-stable --version 2>/dev/null)"
else
    log "Instalando Google Chrome (para open-wa)..."
    if wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
       && apt-get install -y -qq /tmp/google-chrome.deb > /dev/null 2>&1; then
        rm -f /tmp/google-chrome.deb
        log "Google Chrome instalado: $(google-chrome-stable --version 2>/dev/null || echo ok)"
    else
        warn "No se pudo instalar Google Chrome; open-wa intentará su Chromium bundled. Instálalo a mano si el navegador no arranca."
    fi
fi

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

# ---- 3a-bis. Crawl4RS — el órgano web del bus (Docker, 127.0.0.1:8081) ----
# Motor del repo hermano D-os (Rust + Chromium contenido). Es el ÚNICO órgano web desde el
# relevo de fastcrw: leer · buscar · mapear · rastrear. Docker y no nativo A PROPÓSITO
# (el binario es limpio; Chromium es la dependencia sucia). Instalar el engine aquí NO
# concede nada a www-data (el grupo docker sigue siendo opt-in del ejecutor, --docker):
# el contenedor lo levanta root en el setup y el puente le habla por HTTP.
# Idempotente y guardado: cualquier fallo → warn, y el puente degrada honesto (503).
log "Crawl4RS (órgano web, Docker :8081)..."

# Migración: retirar el motor viejo crw-server si quedó de una instalación anterior.
if systemctl list-unit-files 2>/dev/null | grep -q 'crw-server.service'; then
    systemctl disable --now crw-server > /dev/null 2>&1 || true
    rm -f /etc/systemd/system/crw-server.service /usr/local/bin/crw-server
    systemctl daemon-reload
    log "Motor viejo crw-server retirado (relevo → Crawl4RS)"
fi

# Docker engine + plugin compose (docker-compose-v2 en Ubuntu; plugin oficial como fallback).
if ! command -v docker &>/dev/null; then
    log "Instalando Docker engine..."
    apt-get install -y -qq docker.io > /dev/null 2>&1 || warn "Instalación de docker.io falló"
fi
if command -v docker &>/dev/null; then
    systemctl enable --now docker > /dev/null 2>&1 || true
    if ! docker compose version &>/dev/null; then
        apt-get install -y -qq docker-compose-v2 > /dev/null 2>&1 \
            || apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1 \
            || warn "Plugin de compose no disponible por apt"
    fi
fi

if docker compose version &>/dev/null; then
    # El motor D-os: clon fresco o actualización (shallow).
    if [ -d /opt/d-os/.git ]; then
        git -C /opt/d-os pull --ff-only > /dev/null 2>&1 || warn "No se pudo actualizar /opt/d-os (sigue con la versión local)"
    else
        git clone --depth 1 https://github.com/noninapizzicas/d-os /opt/d-os > /dev/null 2>&1 \
            || warn "Clone de D-os falló (¿red?). Crawl4RS no se levantará esta pasada."
    fi

    # Secreto JWT: nace UNA vez y vive en data/.env (excluido del rsync → persiste).
    # El default del Dockerfile de D-os es público/forjable — jamás se usa.
    mkdir -p "${INSTALL_DIR}/data"
    if ! grep -q '^CRAWL4RS_JWT_SECRET=' "${INSTALL_DIR}/data/.env" 2>/dev/null; then
        echo "CRAWL4RS_JWT_SECRET=$(openssl rand -hex 32)" >> "${INSTALL_DIR}/data/.env"
        log "CRAWL4RS_JWT_SECRET generado en ${INSTALL_DIR}/data/.env"
    fi

    # Red compartida entre órganos web (crawl4rs ↔ searxng).
    docker network inspect enki-web > /dev/null 2>&1 || docker network create enki-web > /dev/null

    if [ -d /opt/d-os ]; then
        log "Construyendo y levantando enki-crawl4rs (la 1ª vez compila Rust: unos minutos)..."
        _C4RS_SECRET="$(grep -m1 '^CRAWL4RS_JWT_SECRET=' "${INSTALL_DIR}/data/.env" | cut -d= -f2-)"
        if CRAWL4RS_JWT_SECRET="${_C4RS_SECRET}" docker compose \
             -f "${REPO_DIR}/deployment/crawl4rs/docker-compose.yml" up -d --build > /dev/null 2>&1; then
            log "enki-crawl4rs arriba en 127.0.0.1:8081"
        else
            warn "enki-crawl4rs no levantó — el puente degrada honesto (503). Revisa: docker compose -f deployment/crawl4rs/docker-compose.yml logs"
        fi
        # SearXNG — backend de crawl4rs.buscar (misma red). Si falla, buscar da 503 y el resto sigue.
        if docker compose -f "${REPO_DIR}/deployment/python-tools/docker-compose.searxng.yml" up -d > /dev/null 2>&1; then
            log "SearXNG arriba (crawl4rs.buscar operativo)"
        else
            warn "SearXNG no levantó — crawl4rs.buscar responderá 503; leer/mapear/rastrear siguen"
        fi
    fi
else
    warn "Sin docker compose: Crawl4RS no se levantó. El puente degrada honesto (503) hasta reejecutar el setup."
fi

# ---- 3b. Docker (OPT-IN — aislamiento en contenedor del ejecutor + herramientas Python) ----
# El módulo `ejecutor` (puerta guardada) puede correr comandos aislados en un contenedor
# efímero pidiendo aislamiento:'contenedor'. Sin docker, degrada HONESTO (503, no cae a
# local). Para habilitar la contención REAL de input no-confiable, instala docker y mete al
# usuario del servicio (www-data) en el grupo docker.
#
# OPT-IN a propósito:  sudo ./vps-setup.sh [dominio] --docker
#   (usa el flag --docker; NO 'ENKI_ENABLE_DOCKER=1 sudo …' porque sudo limpia el entorno)
#
# AVISO DE SEGURIDAD (honesto): meter a www-data en el grupo 'docker' equivale a darle ROOT
# en el host (docker.sock ≈ root). La mitigación es el guard del ejecutor (hardline +
# aprobación humana) y que nace OFF por interruptor. Si no quieres esa concesión, NO habilites
# docker: el ejecutor sigue funcionando con aislamiento local + la reja (protección cooperativa).
if [ "${ENKI_ENABLE_DOCKER:-0}" = "1" ]; then
    if command -v docker &>/dev/null; then
        log "Docker ya instalado: $(docker --version)"
    else
        log "Instalando Docker (aislamiento del ejecutor)..."
        apt-get install -y -qq docker.io > /dev/null 2>&1 || warn "Instalación de docker.io falló"
    fi
    if command -v docker &>/dev/null; then
        systemctl enable --now docker > /dev/null 2>&1 || warn "No se pudo arrancar docker.service"
        getent group docker >/dev/null || groupadd docker
        if id -nG www-data 2>/dev/null | grep -qw docker; then
            log "www-data ya pertenece al grupo docker"
        else
            usermod -aG docker www-data && log "www-data añadido al grupo docker (el reinicio del servicio enki, más abajo, lo aplica)"
        fi
        DOCKER_IMG="${ENKI_DOCKER_IMAGE:-node:20-slim}"
        log "Pre-bajando imagen base ${DOCKER_IMG}..."
        docker pull "${DOCKER_IMG}" > /dev/null 2>&1 || warn "No se pudo pre-bajar ${DOCKER_IMG} (se bajará al primer uso)"

        # Hogar de herramientas Python: imagen enki-python-tools (para el ejecutor con
        # aislamiento:'contenedor' + contenedor_imagen) — cero código, la reja sigue.
        log "Construyendo imagen enki-python-tools..."
        docker build -t enki-python-tools "${REPO_DIR}/deployment/python-tools/" > /dev/null 2>&1 \
            && log "enki-python-tools lista" \
            || warn "No se pudo construir enki-python-tools (revisa: docker build deployment/python-tools/)"

        # Headroom — proxy de compresión de contexto (:8787). Baja el modelo Kompress al 1er
        # arranque (tarda). El core lo usa solo si el interruptor 'headroom' se enciende (OFF por defecto).
        HR_COMPOSE="${REPO_DIR}/deployment/python-tools/docker-compose.headroom.yml"
        if [ -f "$HR_COMPOSE" ]; then
            log "Levantando Headroom (proxy de compresión, :8787)..."
            docker compose -f "$HR_COMPOSE" up -d --build > /dev/null 2>&1 \
                && log "Headroom arriba (verifica: curl http://127.0.0.1:8787/livez)" \
                || warn "Headroom no arrancó (revisa: docker compose -f $HR_COMPOSE logs)"
        fi
    fi
else
    warn "Docker NO habilitado. Para el aislamiento en contenedor del ejecutor: ENKI_ENABLE_DOCKER=1 sudo ./vps-setup.sh"
    warn "Sin docker, el ejecutor usa aislamiento local + reja (degrada honesto si se pide contenedor)."
fi

# ---- 4. Copiar proyecto ----
log "Instalando Event Core en ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"

rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='deployment' \
    --exclude='data' \
    --exclude='public' \
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

# Dir público de las PWAs por proyecto (/<public_ns>/<superficie>/<slug>). DEBE existir
# antes de arrancar enki.service: con ProtectSystem=strict, systemd solo monta rw los
# ReadWritePaths que existen. project-manager crea aquí los symlinks al activar cada
# feature. El reconciliador (paso 9) asegura el subdir concreto del namespace; aquí basta
# crear /opt/enki/public. www-data (usuario del servicio) debe poder escribir.
mkdir -p /opt/enki/public
chown -R www-data:www-data /opt/enki/public 2>/dev/null || true

# HOME escribible para Chrome (open-wa). Debe existir y ser de www-data antes de arrancar.
mkdir -p /opt/enki/data/chrome-home
chown -R www-data:www-data /opt/enki/data/chrome-home 2>/dev/null || true

if [ "$MODE" = "domain" ]; then
    log "Configurando Caddy para ${DOMAIN} (HTTPS)..."
    # Sustituir dominio hardcoded del template por el real
    sed -e "s/pizzepos\.es/${DOMAIN}/g" -e "s/pizzepos\.log/${DOMAIN}.log/g" \
        "${REPO_DIR}/deployment/caddy/Caddyfile.vps" > /etc/caddy/Caddyfile
    log "Caddyfile configurado para ${DOMAIN}"
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

	# Headers de seguridad
	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
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
Environment=CONVERSATION_EXPORT_TOKEN=nonina
# Proxy de compresión Headroom (:8787, si está levantado con --docker). El core solo lo
# usa cuando el interruptor 'headroom' está ON (OFF por defecto) → aquí es inofensivo.
Environment=HEADROOM_PROXY_URL=http://localhost:8787
# HOME escribible para Chrome (open-wa): su HOME real (/var/www, de www-data) queda
# de solo-lectura con ProtectSystem=strict, y Chrome necesita escribir config/caché/
# crashpad. Apuntamos HOME a un dir bajo data/ (sí escribible vía ReadWritePaths).
Environment=HOME=/opt/enki/data/chrome-home

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/enki/data /opt/enki/modules /opt/enki/public
# PrivateTmp da un /tmp privado y escribible: Chromium (open-wa) lo necesita
# (con ProtectSystem=strict el /tmp del sistema queda de solo-lectura).
PrivateTmp=true

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

# ---- 9. Reconciliar + verificar (el cerebro único) ----
# La generación de systemd/Caddy de arriba y el reconciliador comparten forma:
# las plantillas de deployment/systemd/*.tmpl y deployment/caddy/Caddyfile.vps
# son la MISMA fuente. El reconciliador es la AUTORIDAD de aquí en adelante —
# esta pasada final converge cualquier diferencia y VERIFICA que el VPS quedó
# funcional (dir /shop, bloque Caddy /shop/*, servicios). Solo en modo dominio
# (el perfil de tiendas necesita HTTPS + dominio).
if [ "$MODE" = "domain" ]; then
    log "Reconciliando + verificando (deployment/reconcile.js)..."
    if node "${REPO_DIR}/deployment/reconcile.js" --fresh --domain "$DOMAIN"; then
        log "VPS reconciliado y verificado"
    else
        warn "El reconciliador reportó drift — revisa la salida de arriba"
    fi
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
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^enki-crawl4rs$'; then
    echo "    enki-crawl4rs  → Crawl4RS órgano web (docker, localhost:8081)"
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^enki-searxng$'; then
    echo "    enki-searxng   → búsqueda web para crawl4rs.buscar (docker)"
fi
if [ "${ENKI_ENABLE_DOCKER:-0}" = "1" ] && command -v docker &>/dev/null; then
    echo "    headroom       → proxy compresión (docker, localhost:8787)"
fi
echo ""
echo "  Para activar (panel Interruptores 🎛️, grupo sistema — nacen OFF a propósito):"
echo "    crawl4rs       → leer/buscar/mapear/rastrear la web desde el bus y el chat (leer_web)"
echo "    headroom       → comprimir contexto al LLM (ahorro de tokens)"
echo "    ejecutor       → shell guardado; con enki-python-tools = herramientas Python aisladas"
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
