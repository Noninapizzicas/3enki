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
        --docker)     ENKI_ENABLE_DOCKER=1 ;;
        --sin-hermes) ENKI_ENABLE_HERMES=0 ;;
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
# Acepta cualquier versión >= NODE_VERSION (el chequeo literal "v20" no casaba
# con un v22 ya instalado y re-corría nodesource en cada pasada para nada).
if command -v node &> /dev/null && [ "$(node -p 'parseInt(process.versions.node)')" -ge "${NODE_VERSION}" ]; then
    log "Node.js $(node -v) ya instalado (>= v${NODE_VERSION})"
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
    # CRAWL4RS_JWT_SECRET ya NO se genera: la ley de la frontera (D-os) deja la auth
    # abierta cuando solo se publica a loopback. Si existe uno previo, se respeta (auth activa).
    # Secreto de SearXNG: mismo trato (nace una vez, jamás el default público).
    if ! grep -q '^SEARXNG_SECRET_KEY=' "${INSTALL_DIR}/data/.env" 2>/dev/null; then
        echo "SEARXNG_SECRET_KEY=$(openssl rand -hex 32)" >> "${INSTALL_DIR}/data/.env"
        log "SEARXNG_SECRET_KEY generado en ${INSTALL_DIR}/data/.env"
    fi

    # Red compartida entre órganos web (crawl4rs ↔ searxng).
    docker network inspect enki-web > /dev/null 2>&1 || docker network create enki-web > /dev/null

    if [ -d /opt/d-os ]; then
        log "Construyendo y levantando enki-crawl4rs (la 1ª vez compila Rust: unos minutos)..."
        # LEY DE LA FRONTERA (D-os): el host publica solo a 127.0.0.1 → la frontera vive
        # aquí, no en el contenedor. Auth abierta declarada; el secreto JWT ya no es teatro
        # obligatorio (si algún día expones el puerto, pon CRAWL4RS_JWT_SECRET y la auth activa).
        _C4RS_SECRET="$(grep -m1 '^CRAWL4RS_JWT_SECRET=' "${INSTALL_DIR}/data/.env" 2>/dev/null | cut -d= -f2-)"

        # MARCHA LARGA (Playwright): el wrapper (perfil 'larga') con su propio Chromium —
        # es la 2ª marcha del motor (login con sesión, interacción, interceptar API, stealth,
        # emulación). BEST-EFFORT: la 1ª vez baja la imagen oficial de Playwright (~1.7 GB) y
        # tarda; si falla (disco/red) NO tumba la marcha corta — crawl4rs sigue con su
        # navegador propio. Opt-out del setup ligero: ENKI_MARCHA_LARGA=0 sudo ./vps-setup.sh …
        _PW_URL=""
        if [ "${ENKI_MARCHA_LARGA:-1}" = "1" ]; then
            log "Levantando la marcha larga (wrapper Playwright; 1ª vez descarga ~1.7 GB)..."
            if docker compose -f "${REPO_DIR}/deployment/crawl4rs/docker-compose.yml" \
                 --profile larga up -d --build browser > /dev/null 2>&1; then
                _PW_URL="http://browser:8100"
                log "Marcha larga arriba — crawl4rs escalará a Playwright (un solo Chromium: el del wrapper)"
            else
                warn "Marcha larga no levantó — crawl4rs usará su navegador propio (marcha corta intacta). Revisa: docker compose -f deployment/crawl4rs/docker-compose.yml --profile larga logs browser"
            fi
        else
            log "Marcha larga desactivada (ENKI_MARCHA_LARGA=0) — solo marcha corta"
        fi

        # MARCHA CORTA (siempre): crawl4rs. CRAWL4RS_PLAYWRIGHT_URL se pasa SOLO si el wrapper
        # subió — sin él, un endpoint vacío deja que la escalación caiga al navegador propio
        # (nunca a un endpoint muerto). Se recrea el contenedor si el valor cambió (idempotente).
        if CRAWL4RS_JWT_SECRET="${_C4RS_SECRET}" CRAWL4RS_PLAYWRIGHT_URL="${_PW_URL}" docker compose \
             -f "${REPO_DIR}/deployment/crawl4rs/docker-compose.yml" up -d --build > /dev/null 2>&1; then
            log "enki-crawl4rs arriba en 127.0.0.1:8081"
            # UNA decisión, UNA llave: instalar el órgano ES el consentimiento — el
            # interruptor nace ON en la instalación. Solo se siembra si el humano no
            # decidió ya (el estado persistido manda, incluida su decisión de apagarlo).
            node -e "
              const fs=require('fs'),p='${INSTALL_DIR}/data/interruptores.json';
              let st={estados:{}}; try{st=JSON.parse(fs.readFileSync(p,'utf8'))}catch(_){}
              st.estados=st.estados||{};
              if(!('crawl4rs' in st.estados)){ st.estados.crawl4rs=true; fs.writeFileSync(p,JSON.stringify(st,null,2)); console.log('sembrado'); }
            " > /dev/null 2>&1 && log "Interruptor crawl4rs: ON (instalar es decidir; tu apagado manual se respeta)" || true
        else
            warn "enki-crawl4rs no levantó — el puente degrada honesto (503). Revisa: docker compose -f deployment/crawl4rs/docker-compose.yml logs"
        fi
        # SearXNG — backend de crawl4rs.buscar (misma red). Si falla, buscar da 503 y el resto sigue.
        _SXNG_SECRET="$(grep -m1 '^SEARXNG_SECRET_KEY=' "${INSTALL_DIR}/data/.env" | cut -d= -f2-)"
        if SEARXNG_SECRET_KEY="${_SXNG_SECRET}" docker compose \
             -f "${REPO_DIR}/deployment/python-tools/docker-compose.searxng.yml" up -d > /dev/null 2>&1; then
            log "SearXNG arriba (crawl4rs.buscar operativo)"
        else
            warn "SearXNG no levantó — crawl4rs.buscar responderá 503; leer/mapear/rastrear siguen"
        fi
    fi

    # Headroom — proxy de compresión de contexto (:8787). Mismo patrón que crawl4rs: lo
    # levanta root en el setup y el core le habla por HTTP → cero concesión de seguridad
    # (no toca el grupo docker). El core solo lo usa si el interruptor 'headroom' se
    # enciende (OFF por defecto) → tenerlo arriba es inofensivo. Baja el modelo Kompress
    # al 1er arranque (tarda; el healthcheck lo cubre).
    HR_COMPOSE="${REPO_DIR}/deployment/python-tools/docker-compose.headroom.yml"
    if [ -f "$HR_COMPOSE" ]; then
        log "Levantando Headroom (proxy de compresión, :8787)..."
        if docker compose -f "$HR_COMPOSE" up -d --build > /dev/null 2>&1; then
            log "Headroom arriba (verifica: curl http://127.0.0.1:8787/livez)"
        else
            warn "Headroom no arrancó — el provider va directo al LLM (fallback seguro). Revisa: docker compose -f $HR_COMPOSE logs"
        fi
    fi
else
    warn "Sin docker compose: Crawl4RS/SearXNG/Headroom no se levantaron. Todo degrada honesto hasta reejecutar el setup."
fi

# ---- 3a-ter. OCR4RS — órgano físico NATIVO (Rust puro, sin Docker) ----
# La regla de la casa por NATURALEZA: Rust estático PURO → nativo en el VPS, como fue
# fastcrw. OCR4RS no arrastra Chromium ni Python (a diferencia de crawl4rs) → no hay
# dependencia sucia que contener → NO va en Docker. Todo en el deploy, cero pasos manuales.
# ORDEN (ligero → pesado): 1) binario PREBUILT (release.yml de ocr4rs, musl estático — un
# fichero, sin toolchain); 2) fallback: compila con cargo (asegura rustup). SIN AUTH (ley
# de la frontera: bindea 127.0.0.1). Idempotente y guardado (fallo → warn, el puente degrada).
log "OCR4RS (órgano físico, Rust NATIVO :8090)..."
if command -v ocr4rs &>/dev/null || [ -x /usr/local/bin/ocr4rs ]; then
    log "ocr4rs ya instalado ($(/usr/local/bin/ocr4rs --version 2>/dev/null || echo ok))"
else
    # 1) PREBUILT: baja el binario musl estático del último release (sin toolchain, un fichero).
    OCR_URL="https://github.com/noninapizzicas/ocr4rs/releases/latest/download/ocr4rs-x86_64-linux-musl.tar.gz"
    _tmp="$(mktemp -d)"
    if curl -sSfL "$OCR_URL" -o "${_tmp}/ocr4rs.tar.gz" 2>/dev/null \
         && tar xzf "${_tmp}/ocr4rs.tar.gz" -C "${_tmp}" 2>/dev/null \
         && [ -x "${_tmp}/ocr4rs" ]; then
        install -m 0755 "${_tmp}/ocr4rs" /usr/local/bin/ocr4rs
        log "ocr4rs instalado desde el binario prebuilt (musl estático, sin compilar)"
    else
        # 2) FALLBACK: compilar desde el fuente (aún no hay release, o no hay red al release).
        warn "sin binario prebuilt — compilando desde el fuente (cae al fallback)"
        if [ -d /opt/ocr4rs/.git ]; then
            git -C /opt/ocr4rs pull --ff-only > /dev/null 2>&1 || true
        else
            git clone --depth 1 https://github.com/noninapizzicas/ocr4rs /opt/ocr4rs > /dev/null 2>&1 \
                || warn "Clone de ocr4rs falló (¿red?). OCR4RS no se instalará esta pasada."
        fi
        if [ -d /opt/ocr4rs ]; then
            if ! command -v cargo &>/dev/null; then
                log "Instalando toolchain Rust (rustup) para compilar ocr4rs..."
                curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y > /dev/null 2>&1 || warn "rustup falló"
                [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
                export PATH="$HOME/.cargo/bin:$PATH"
            fi
            if command -v cargo &>/dev/null; then
                log "Compilando ocr4rs (la 1ª vez tarda unos minutos)..."
                cargo install --path /opt/ocr4rs/crates/ocr4rs-cli --root /usr/local --locked > /dev/null 2>&1 \
                    && log "ocr4rs compilado en /usr/local/bin" \
                    || warn "cargo install de ocr4rs falló — el puente degradará a sin_servicio hasta instalarlo"
            else
                warn "sin cargo: ocr4rs no se compiló. El puente degrada honesto (503)."
            fi
        fi
    fi
    rm -rf "${_tmp}"
fi
# El clon /opt/ocr4rs se necesita igual para get-models.sh (los modelos no van en el release).
[ -d /opt/ocr4rs/.git ] || git clone --depth 1 https://github.com/noninapizzicas/ocr4rs /opt/ocr4rs > /dev/null 2>&1 || true
# Modelos .rten (una vez, en data/ → persiste; excluido del rsync).
OCR_MODELS="${INSTALL_DIR}/data/ocr4rs-models"
mkdir -p "${OCR_MODELS}"
if [ ! -f "${OCR_MODELS}/text-detection.rten" ] && [ -x /opt/ocr4rs/scripts/get-models.sh ]; then
    log "Descargando modelos OCR .rten (una vez)..."
    /opt/ocr4rs/scripts/get-models.sh "${OCR_MODELS}" > /dev/null 2>&1 \
        || warn "get-models.sh falló — sin modelos, /ocr degradará con 503 hasta bajarlos"
fi
chown -R www-data:www-data "${OCR_MODELS}" 2>/dev/null || true
# systemd — el servicio bindea 127.0.0.1:8090 (la frontera vive en el host).
if [ -x /usr/local/bin/ocr4rs ]; then
    sed "s#__MODELS__#${OCR_MODELS}#g" "${REPO_DIR}/deployment/ocr4rs/ocr4rs.service" > /etc/systemd/system/ocr4rs.service 2>/dev/null
    systemctl daemon-reload
    if systemctl enable --now ocr4rs > /dev/null 2>&1; then
        log "ocr4rs activo en 127.0.0.1:8090"
        # Una decisión, una llave: instalar el órgano lo enciende (solo si el humano no decidió ya).
        node -e "
          const fs=require('fs'),p='${INSTALL_DIR}/data/interruptores.json';
          let st={estados:{}}; try{st=JSON.parse(fs.readFileSync(p,'utf8'))}catch(_){}
          st.estados=st.estados||{};
          if(!('ocr4rs' in st.estados)){ st.estados.ocr4rs=true; fs.writeFileSync(p,JSON.stringify(st,null,2)); console.log('sembrado'); }
        " > /dev/null 2>&1 && log "Interruptor ocr4rs: ON (instalar es decidir; tu apagado manual se respeta)" || true
    else
        warn "ocr4rs instalado pero el servicio no arrancó (revisa: journalctl -u ocr4rs -f)"
    fi
fi

# ---- 3a-ter-bis. motor-ojo — órgano de RENDER de enki-sense (Rust nativo, :8120) ----
# El PRIMER sentido de enki-sense. Vive DENTRO de 2enki (enki-sense/), NO repo aparte:
# se compila desde REPO_DIR. Nativo (resvg/usvg/svg2pdf, sin Chromium → sin Docker,
# como ocr4rs). Best-effort: si falla, el puente modules/motor-ojo degrada honesto (503).
if [ -x /usr/local/bin/motor-ojo ]; then
    log "motor-ojo ya instalado"
elif command -v cargo &>/dev/null; then
    log "Compilando motor-ojo (enki-sense/render, la 1ª vez tarda unos minutos)..."
    cargo install --path "${REPO_DIR}/enki-sense/crates/motor-ojo" --root /usr/local --locked > /dev/null 2>&1 \
        && log "motor-ojo compilado en /usr/local/bin" \
        || warn "cargo install de motor-ojo falló — el puente degrada honesto (503 sin_motor)"
else
    warn "sin cargo: motor-ojo no se compiló. El puente degrada honesto (503 sin_motor)."
fi
if [ -x /usr/local/bin/motor-ojo ]; then
    install -m 0644 "${REPO_DIR}/enki-sense/deployment/systemd/motor-ojo.service" /etc/systemd/system/motor-ojo.service 2>/dev/null
    systemctl daemon-reload
    if systemctl enable --now motor-ojo > /dev/null 2>&1; then
        log "motor-ojo activo en 127.0.0.1:8120 (render SVG/PDF/imagen, local) — SIN botón, operativo ya"
    else
        warn "motor-ojo instalado pero el servicio no arrancó (revisa: journalctl -u motor-ojo -f)"
    fi
fi

# ---- 3a-ter-ter. motor-traduce — órgano de TRADUCCIÓN de enki-sense (Rust nativo, :8121) ----
# 2º sentido. Nativo (candle + MarianMT/Opus-MT, sin nube). Los modelos NO van en
# el binario: get-models.sh los descarga (patrón ocr4rs). Best-effort: sin binario
# o sin modelos, el puente modules/motor-traduce degrada honesto (503 sin_motor).
MT_MODELS="${INSTALL_DIR}/data/traduce-models"
if [ -x /usr/local/bin/motor-traduce ]; then
    log "motor-traduce ya instalado"
elif command -v cargo &>/dev/null; then
    log "Compilando motor-traduce (enki-sense/traducir, candle — la 1ª vez tarda unos minutos)..."
    cargo install --path "${REPO_DIR}/enki-sense/crates/motor-traduce" --root /usr/local --locked > /dev/null 2>&1 \
        && log "motor-traduce compilado en /usr/local/bin" \
        || warn "cargo install de motor-traduce falló — el puente degrada honesto (503 sin_motor)"
else
    warn "sin cargo: motor-traduce no se compiló. El puente degrada honesto (503 sin_motor)."
fi
if [ -x /usr/local/bin/motor-traduce ]; then
    # Modelos (par fr-en verificado). Si falla la descarga, el motor da par_no_soportado.
    mkdir -p "${MT_MODELS}"
    bash "${REPO_DIR}/enki-sense/crates/motor-traduce/get-models.sh" "${MT_MODELS}" > /dev/null 2>&1 \
        && log "motor-traduce: modelos provisionados en ${MT_MODELS}" \
        || warn "motor-traduce: get-models falló (¿red?) — traducir dará par_no_soportado hasta reintentar"
    sed "s#__MODELS__#${MT_MODELS}#g" "${REPO_DIR}/enki-sense/deployment/systemd/motor-traduce.service" > /etc/systemd/system/motor-traduce.service 2>/dev/null
    systemctl daemon-reload
    if systemctl enable --now motor-traduce > /dev/null 2>&1; then
        log "motor-traduce activo en 127.0.0.1:8121 (traducir local) — SIN botón, operativo ya"
    else
        warn "motor-traduce instalado pero el servicio no arrancó (revisa: journalctl -u motor-traduce -f)"
    fi
fi

# ---- 3a-ter-quater. motor-oido — órgano de OÍR/transcribir de enki-sense (Rust nativo, :8122) ----
# 3er sentido. Nativo (candle-whisper, sin nube). El modelo (~145MB) lo descarga
# get-models.sh (patrón ocr4rs). Best-effort: sin binario o sin modelo, el puente
# modules/motor-oido degrada honesto (503 sin_motor).
MO_MODELS="${INSTALL_DIR}/data/oido-models"
if [ -x /usr/local/bin/motor-oido ]; then
    log "motor-oido ya instalado"
elif command -v cargo &>/dev/null; then
    log "Compilando motor-oido (enki-sense/oír, candle-whisper — la 1ª vez tarda unos minutos)..."
    cargo install --path "${REPO_DIR}/enki-sense/crates/motor-oido" --root /usr/local --locked > /dev/null 2>&1 \
        && log "motor-oido compilado en /usr/local/bin" \
        || warn "cargo install de motor-oido falló — el puente degrada honesto (503 sin_motor)"
else
    warn "sin cargo: motor-oido no se compiló. El puente degrada honesto (503 sin_motor)."
fi
if [ -x /usr/local/bin/motor-oido ]; then
    mkdir -p "${MO_MODELS}"
    bash "${REPO_DIR}/enki-sense/crates/motor-oido/get-models.sh" "${MO_MODELS}" > /dev/null 2>&1 \
        && log "motor-oido: modelo whisper provisionado en ${MO_MODELS}" \
        || warn "motor-oido: get-models falló (¿red?) — transcribir dará sin_motor hasta reintentar"
    sed "s#__MODELS__#${MO_MODELS}#g" "${REPO_DIR}/enki-sense/deployment/systemd/motor-oido.service" > /etc/systemd/system/motor-oido.service 2>/dev/null
    systemctl daemon-reload
    if systemctl enable --now motor-oido > /dev/null 2>&1; then
        log "motor-oido activo en 127.0.0.1:8122 (transcribir voz local) — SIN botón, operativo ya"
    else
        warn "motor-oido instalado pero el servicio no arrancó (revisa: journalctl -u motor-oido -f)"
    fi
fi

# ---- 3a-ter-quinquies. motor-sonido — PERCEPTOR de prosodia de enki-sense (Rust nativo, :8123) ----
# El 1er perceptor. DSP puro (SIN modelo → nada que descargar). Da features de
# prosodia; la emoción la infiere el LLM. Best-effort: sin binario, el puente
# modules/motor-sonido degrada honesto (503 sin_motor).
if [ -x /usr/local/bin/motor-sonido ]; then
    log "motor-sonido ya instalado"
elif command -v cargo &>/dev/null; then
    log "Compilando motor-sonido (enki-sense/prosodia, DSP)..."
    cargo install --path "${REPO_DIR}/enki-sense/crates/motor-sonido" --root /usr/local --locked > /dev/null 2>&1 \
        && log "motor-sonido compilado en /usr/local/bin" \
        || warn "cargo install de motor-sonido falló — el puente degrada honesto (503 sin_motor)"
else
    warn "sin cargo: motor-sonido no se compiló. El puente degrada honesto (503 sin_motor)."
fi
if [ -x /usr/local/bin/motor-sonido ]; then
    install -m 0644 "${REPO_DIR}/enki-sense/deployment/systemd/motor-sonido.service" /etc/systemd/system/motor-sonido.service 2>/dev/null
    systemctl daemon-reload
    if systemctl enable --now motor-sonido > /dev/null 2>&1; then
        log "motor-sonido activo en 127.0.0.1:8123 (prosodia local) — SIN botón, operativo ya"
    else
        warn "motor-sonido instalado pero el servicio no arrancó (revisa: journalctl -u motor-sonido -f)"
    fi
fi

# ---- 3a-ter-sexies. motor-voz — órgano de DECIR/hablar de enki-sense (Rust nativo, :8124) ----
# 4º sentido. Rust (piper-rs = voces Piper ONNX vía ort). Voces en ESPAÑOL. La voz
# (~61MB) la descarga get-models.sh (patrón ocr4rs). ort baja ONNX Runtime al
# COMPILAR — el VPS tiene egress abierto. Best-effort: sin binario/voz, el puente
# modules/motor-voz degrada honesto (503 sin_motor / 422 VOZ_NO_DISPONIBLE).
MV_MODELS="${INSTALL_DIR}/data/voz-models"
if [ -x /usr/local/bin/motor-voz ]; then
    log "motor-voz ya instalado"
elif command -v cargo &>/dev/null; then
    log "Compilando motor-voz (enki-sense/voz, piper-rs+ort — baja ONNX Runtime, la 1ª vez tarda)..."
    cargo install --path "${REPO_DIR}/enki-sense/crates/motor-voz" --root /usr/local --locked > /dev/null 2>&1 \
        && log "motor-voz compilado en /usr/local/bin" \
        || warn "cargo install de motor-voz falló (¿ort no bajó ONNX Runtime?) — el puente degrada honesto (503)"
else
    warn "sin cargo: motor-voz no se compiló. El puente degrada honesto (503 sin_motor)."
fi
if [ -x /usr/local/bin/motor-voz ]; then
    mkdir -p "${MV_MODELS}"
    bash "${REPO_DIR}/enki-sense/crates/motor-voz/get-models.sh" "${MV_MODELS}" > /dev/null 2>&1 \
        && log "motor-voz: voz española provisionada en ${MV_MODELS}" \
        || warn "motor-voz: get-models falló (¿red?) — decir dará VOZ_NO_DISPONIBLE hasta reintentar"
    sed "s#__MODELS__#${MV_MODELS}#g" "${REPO_DIR}/enki-sense/deployment/systemd/motor-voz.service" > /etc/systemd/system/motor-voz.service 2>/dev/null
    systemctl daemon-reload
    if systemctl enable --now motor-voz > /dev/null 2>&1; then
        log "motor-voz activo en 127.0.0.1:8124 (hablar local, español) — SIN botón, operativo ya"
    else
        warn "motor-voz instalado pero el servicio no arrancó (revisa: journalctl -u motor-voz -f)"
    fi
fi

# ---- 3a-quater. HERMES — el agente trabajador (nativo, :8642) ----
# La suma, no el orgullo: Enki gobierna (interruptor 'hermes-agente' + audit
# hermes.invocado), Hermes pone el músculo (browser, código, subagentes, memoria
# por proyecto). Todo en el deploy, un paso manual honesto (el proveedor LLM de
# Hermes — su key es tuya; el script lo canta si falta). Opt-out: --sin-hermes.
# Best-effort: si falla, el provider degrada honesto y el setup sigue.
if [ "${ENKI_ENABLE_HERMES:-1}" = "1" ]; then
    bash "${REPO_DIR}/deployment/hermes/setup-hermes.sh" "${INSTALL_DIR}" \
        || warn "Hermes no quedó arriba — el provider degrada honesto (no-disponible). Reintenta: sudo ./deployment/hermes/setup-hermes.sh"
else
    log "Hermes saltado (--sin-hermes)"
fi

# ---- 3b. Ejecutor en contenedor (OPT-IN --docker — la ÚNICA concesión de seguridad) ----
# El engine Docker ya lo asegura la sección 3a-bis (crawl4rs/headroom lo usan sin conceder
# nada: los levanta root y el core les habla por HTTP). Lo que ESTE flag habilita es otra
# cosa: que el módulo `ejecutor` (puerta guardada) pueda lanzar contenedores EN RUNTIME
# pidiendo aislamiento:'contenedor'. Eso exige meter a www-data en el grupo docker.
#
# OPT-IN a propósito:  sudo ./vps-setup.sh [dominio] --docker
#   (usa el flag --docker; NO 'ENKI_ENABLE_DOCKER=1 sudo …' porque sudo limpia el entorno)
#
# AVISO DE SEGURIDAD (honesto): meter a www-data en el grupo 'docker' equivale a darle ROOT
# en el host (docker.sock ≈ root). La mitigación es el guard del ejecutor (hardline +
# aprobación humana) y que nace OFF por interruptor. Si no quieres esa concesión, NO pases
# el flag: el ejecutor sigue funcionando con aislamiento local + la reja (protección
# cooperativa), y degrada HONESTO (503) si se le pide contenedor.
if [ "${ENKI_ENABLE_DOCKER:-0}" = "1" ]; then
    if command -v docker &>/dev/null; then
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
    else
        warn "--docker pedido pero el engine no está (¿falló la sección 3a-bis?). El ejecutor seguirá con aislamiento local."
    fi
else
    warn "Ejecutor en contenedor NO habilitado (opt-in: sudo ./vps-setup.sh [dominio] --docker)."
    warn "Sin el flag, el ejecutor usa aislamiento local + reja (degrada honesto si se pide contenedor)."
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
    echo "    enki-crawl4rs  → Crawl4RS órgano web · marcha corta (docker, localhost:8081)"
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^enki-crawl4rs-browser$'; then
    echo "    enki-crawl4rs-browser → wrapper Playwright · marcha larga (docker, red interna)"
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^enki-searxng$'; then
    echo "    enki-searxng   → búsqueda web para crawl4rs.buscar (docker)"
fi
if systemctl is-active --quiet ocr4rs 2>/dev/null; then
    echo "    ocr4rs         → OCR órgano físico imagen/PDF→texto (Rust nativo/systemd, localhost:8090)"
fi
if systemctl is-active --quiet motor-ojo 2>/dev/null; then
    echo "    motor-ojo      → enki-sense render SVG/PDF/imagen (Rust nativo/systemd, localhost:8120)"
fi
if systemctl is-active --quiet motor-traduce 2>/dev/null; then
    echo "    motor-traduce  → enki-sense traducir texto local (Rust/candle, localhost:8121)"
fi
if systemctl is-active --quiet motor-oido 2>/dev/null; then
    echo "    motor-oido     → enki-sense transcribir voz local (Rust/candle-whisper, localhost:8122)"
fi
if systemctl is-active --quiet motor-sonido 2>/dev/null; then
    echo "    motor-sonido   → enki-sense prosodia local, DSP (Rust nativo, localhost:8123)"
fi
if systemctl is-active --quiet motor-voz 2>/dev/null; then
    echo "    motor-voz      → enki-sense hablar local, español (Rust/piper-rs, localhost:8124)"
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^enki-headroom$'; then
    echo "    enki-headroom  → proxy compresión (docker, localhost:8787)"
fi
if [ "${ENKI_ENABLE_DOCKER:-0}" = "1" ] && command -v docker &>/dev/null; then
    echo "    ejecutor       → contención en contenedor habilitada (www-data ∈ docker)"
fi
echo ""
echo "  Para activar (panel Interruptores 🎛️, grupo sistema — nacen OFF a propósito):"
echo "    crawl4rs       → leer/buscar/mapear/rastrear la web desde el bus y el chat (leer_web)"
echo "    ocr4rs         → leer texto de fotos/PDF escaneado desde el bus y el chat (leer_imagen)"
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
