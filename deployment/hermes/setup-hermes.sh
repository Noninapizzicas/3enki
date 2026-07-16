#!/bin/bash
# =============================================================================
# setup-hermes.sh — Hermes (NousResearch/hermes-agent) TODO EN EL DEPLOY, limpio.
#
# NO usa el instalador de conveniencia (curl|bash) de Nous: ése agarra /dev/tty
# (prompts de ripgrep/build-tools/wizard) y hace `sudo` como el usuario 'hermes'
# —que es contenido, sin sudo— colgando el deploy. En vez de pelear con eso,
# instalamos DETERMINISTA con uv, que es exactamente lo que ese instalador hace
# por dentro: uv → clonar el repo → `uv sync --extra all --locked` → symlink.
# Cero interacción, reproducible, razonable de auditar.
#
#   1. usuario 'hermes' (contenido, fuera de /opt/enki y de root)
#   2. deps de sistema (ROOT): ripgrep · ffmpeg · build-essential · git · curl
#   3. instalación determinista con uv (sin instalador interactivo)
#   4. HERMES_API_KEY: nace UNA vez en /opt/enki/data/.env (Enki la carga al
#      arrancar → el provider 'hermes' la encuentra solo; persiste al rsync)
#   5. api_server en ~/.hermes/config.yaml (127.0.0.1:8642, misma key)
#   6. servicio systemd hermes-gateway ('gateway run' — foreground, sin root)
#   7. sonda de vida + interruptor 'hermes-agente' sembrado ON
#
# El ÚNICO paso que no se puede automatizar es el proveedor LLM de Hermes
# (su API key es tuya): si falta, este script lo canta al final.
#
# Idempotente y guardado: cada paso se salta lo ya hecho; un fallo hace warn.
#
# Uso:
#   sudo ./deployment/hermes/setup-hermes.sh [INSTALL_DIR]           # default /opt/enki
#   sudo ./deployment/hermes/setup-hermes.sh [INSTALL_DIR] --fresh   # desde CERO (purga y reinstala)
# =============================================================================

set -uo pipefail

INSTALL_DIR="/opt/enki"
FRESH=0
for _arg in "$@"; do
    case "$_arg" in
        --fresh) FRESH=1 ;;
        --*)     echo "[!] flag desconocido ignorado: $_arg" ;;
        *)       INSTALL_DIR="$_arg" ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="/home/hermes"
HERMES_SRC="${HERMES_HOME}/.hermes/hermes-agent"     # el clon + venv
HERMES_BIN="${HERMES_HOME}/.local/bin/hermes"        # symlink al venv
HERMES_CFG="${HERMES_HOME}/.hermes/config.yaml"
REPO_URL="https://github.com/NousResearch/hermes-agent"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

[[ $EUID -ne 0 ]] && { echo -e "${RED}[ERROR]${NC} Ejecutar con sudo"; exit 1; }

log "Hermes (agente trabajador, nativo :8642)${FRESH:+ · --fresh (desde cero)}..."

# ---- 0. --fresh: purga limpia (servicio + instalación + config), deja el user ----
if [ "${FRESH}" = "1" ]; then
    log "purgando instalación previa (servicio, clon, venv, config)..."
    systemctl stop hermes-gateway 2>/dev/null || true
    systemctl disable hermes-gateway 2>/dev/null || true
    systemctl reset-failed hermes-gateway 2>/dev/null || true
    rm -f /etc/systemd/system/hermes-gateway.service
    systemctl daemon-reload 2>/dev/null || true
    rm -rf "${HERMES_HOME}/.hermes" "${HERMES_HOME}/.local"   # clon + venv + binario + config + memoria
    log "purga hecha (el usuario 'hermes' se conserva)"
fi

# ---- 1. Usuario dedicado ----
if ! id hermes &>/dev/null; then
    adduser --disabled-password --gecos "" hermes > /dev/null 2>&1 \
        && log "usuario 'hermes' creado" \
        || { warn "no pude crear el usuario 'hermes' — Hermes no se instala esta pasada"; exit 0; }
else
    log "usuario 'hermes' ya existe"
fi

# ---- 2. Deps de sistema (ROOT) — el user 'hermes' no tiene sudo (por diseño) ----
# uv compila alguna rueda de Python → build-essential. ripgrep/ffmpeg son de las
# skills de Hermes (búsqueda/voz). apt es idempotente. Guardado: fallo → warn.
log "deps de sistema (ripgrep, ffmpeg, build-essential, git, curl)..."
apt-get install -y -qq ripgrep ffmpeg build-essential git curl > /dev/null 2>&1 \
    && log "deps de sistema listas" \
    || warn "alguna dep de sistema no se instaló — la compilación de Hermes puede fallar. Revisa red/apt."

# ---- 3. Instalación DETERMINISTA con uv (como 'hermes', sin interacción) ----
if [ -x "${HERMES_BIN}" ] && [ "${FRESH}" != "1" ]; then
    log "hermes ya instalado ($(sudo -u hermes ${HERMES_BIN} --version 2>/dev/null | head -1 || echo ok))"
else
    log "instalando hermes-agent (uv → clonar → sync; la 1ª vez tarda unos minutos)..."
    sudo -u hermes -H bash -s <<HSCRIPT
set -e
export PATH="\$HOME/.local/bin:\$PATH"

# uv (su instalador SÍ es no-interactivo: no toca tty)
if ! command -v uv >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1
fi
export PATH="\$HOME/.local/bin:\$PATH"
command -v uv >/dev/null 2>&1 || { echo "uv no disponible"; exit 1; }

# clonar (o actualizar) el repo
if [ -d "${HERMES_SRC}/.git" ]; then
    git -C "${HERMES_SRC}" pull --ff-only >/dev/null 2>&1 || true
else
    mkdir -p "\$HOME/.hermes"
    git clone --depth 1 "${REPO_URL}" "${HERMES_SRC}" >/dev/null 2>&1
fi

# Python 3.11 gestionado por uv (sin depender del python del sistema) + venv del proyecto
uv python install 3.11 >/dev/null 2>&1 || true
cd "${HERMES_SRC}"
UV_PROJECT_ENVIRONMENT="${HERMES_SRC}/venv" uv sync --extra all --locked

# el binario 'hermes' del venv, en el PATH del usuario
mkdir -p "\$HOME/.local/bin"
ln -sf "${HERMES_SRC}/venv/bin/hermes" "${HERMES_BIN}"
HSCRIPT
    if [ -x "${HERMES_BIN}" ]; then
        log "hermes instalado ($(sudo -u hermes ${HERMES_BIN} --version 2>/dev/null | head -1 || echo ok))"
    else
        warn "la instalación de hermes no completó — el provider de Enki degrada honesto. Revisa red/apt y reintenta: sudo ${SCRIPT_DIR}/setup-hermes.sh ${INSTALL_DIR}"
        exit 0
    fi
fi

# ---- 4. La key: nace UNA vez, vive en data/.env (Enki la carga al arrancar) ----
mkdir -p "${INSTALL_DIR}/data"
if ! grep -q '^HERMES_API_KEY=' "${INSTALL_DIR}/data/.env" 2>/dev/null; then
    echo "HERMES_API_KEY=$(openssl rand -hex 32)" >> "${INSTALL_DIR}/data/.env"
    log "HERMES_API_KEY generada en ${INSTALL_DIR}/data/.env"
fi
HERMES_KEY="$(grep -m1 '^HERMES_API_KEY=' "${INSTALL_DIR}/data/.env" | cut -d= -f2-)"

# ---- 5. config.yaml: la puerta local (api_server) con la MISMA key ----
_CFG_CAMBIO=0
sudo -u hermes mkdir -p "${HERMES_HOME}/.hermes"
if [ ! -f "${HERMES_CFG}" ]; then
    cat > "${HERMES_CFG}" <<EOF
# config.yaml — creado por deployment/hermes/setup-hermes.sh (Enki).
# La puerta LOCAL por la que Enki delega (provider 'hermes' del ai-gateway).
# Completa el proveedor LLM con: sudo -u hermes -i hermes setup
platforms:
  api_server:
    enabled: true
    extra:
      key: "${HERMES_KEY}"
EOF
    chown hermes:hermes "${HERMES_CFG}"; chmod 600 "${HERMES_CFG}"
    _CFG_CAMBIO=1
    log "config.yaml creado con api_server (127.0.0.1:8642)"
elif grep -q 'api_server' "${HERMES_CFG}"; then
    log "api_server ya en config.yaml (lo del humano manda)"
    _KEY_VIVA="$(grep -A6 'api_server' "${HERMES_CFG}" | grep -m1 'key:' | sed 's/.*key:[[:space:]]*//; s/^"//; s/"$//')"
    if [ -n "${_KEY_VIVA}" ] && [ "${_KEY_VIVA}" != "${HERMES_KEY}" ]; then
        sed -i "s|^HERMES_API_KEY=.*|HERMES_API_KEY=${_KEY_VIVA}|" "${INSTALL_DIR}/data/.env"
        warn "key distinta en config.yaml → data/.env sincronizado con la de Hermes (reinicia enki)"
    fi
elif grep -q '^platforms:' "${HERMES_CFG}"; then
    warn "config.yaml ya tiene 'platforms:' sin api_server — añade a mano el bloque (deployment/hermes/config.api-server.yaml.example) con la key de ${INSTALL_DIR}/data/.env"
else
    cat >> "${HERMES_CFG}" <<EOF

# --- añadido por setup-hermes.sh (Enki): la puerta local ---
platforms:
  api_server:
    enabled: true
    extra:
      key: "${HERMES_KEY}"
EOF
    _CFG_CAMBIO=1
    log "bloque api_server añadido a config.yaml"
fi

# ---- 6. systemd: Hermes VIVO ('gateway run' — foreground, corre como 'hermes') ----
if ! cmp -s "${SCRIPT_DIR}/hermes-gateway.service" /etc/systemd/system/hermes-gateway.service 2>/dev/null; then
    cp "${SCRIPT_DIR}/hermes-gateway.service" /etc/systemd/system/hermes-gateway.service
    systemctl daemon-reload
fi
systemctl reset-failed hermes-gateway 2>/dev/null || true
if systemctl enable --now hermes-gateway > /dev/null 2>&1; then
    [ "${_CFG_CAMBIO}" = "1" ] && systemctl restart hermes-gateway > /dev/null 2>&1
else
    warn "hermes-gateway no arrancó (revisa: journalctl -u hermes-gateway -n 40 --no-pager)"
fi

# ---- 7. Sonda de vida (hasta ~40s: el 1er arranque carga el venv) ----
_VIVO=0
for _i in $(seq 1 20); do
    if curl -fsS -m 3 -H "Authorization: Bearer ${HERMES_KEY}" http://127.0.0.1:8642/v1/models > /dev/null 2>&1; then
        _VIVO=1; break
    fi
    sleep 2
done

if [ "${_VIVO}" = "1" ]; then
    log "hermes-gateway VIVO en 127.0.0.1:8642 (memoria en /home/hermes/.hermes)"
    node -e "
      const fs=require('fs'),p='${INSTALL_DIR}/data/interruptores.json';
      let st={estados:{}}; try{st=JSON.parse(fs.readFileSync(p,'utf8'))}catch(_){}
      st.estados=st.estados||{};
      if(!('hermes-agente' in st.estados)){ st.estados['hermes-agente']=true; fs.writeFileSync(p,JSON.stringify(st,null,2)); console.log('sembrado'); }
    " > /dev/null 2>&1 && log "Interruptor hermes-agente: ON (instalar es decidir; tu apagado manual se respeta)" || true
else
    warn "hermes-gateway no responde aún en :8642. Causa más común: falta el proveedor LLM (paso siguiente)."
fi

# ---- 8. El único paso manual (la key del LLM es tuya) ----
if ! sudo -u hermes grep -qE '^model:|^providers:|api_key|nous_portal' "${HERMES_CFG}" 2>/dev/null; then
    echo ""
    warn "PASO FINAL (una vez): Hermes aún SIN proveedor LLM."
    warn "  sudo -u hermes -i hermes setup     # elige proveedor + su key"
    warn "  sudo systemctl restart hermes-gateway"
fi
