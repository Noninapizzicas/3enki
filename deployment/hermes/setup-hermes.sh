#!/bin/bash
# =============================================================================
# setup-hermes.sh — Hermes (NousResearch/hermes-agent) TODO EN EL DEPLOY.
#
# El agente trabajador de Enki, instalado y vivo sin pasos manuales:
#   1. usuario 'hermes' (contenido, fuera de /opt/enki y de root)
#   2. instalador oficial de Nous (uv/python3.11/node/ffmpeg bajo /home/hermes)
#   3. HERMES_API_KEY: nace UNA vez en /opt/enki/data/.env (Enki la carga al
#      arrancar → el provider 'hermes' la encuentra solo; persiste al rsync)
#   4. api_server en ~/.hermes/config.yaml (127.0.0.1:8642, misma key)
#   5. servicio systemd hermes-gateway (enable --now)
#   6. sonda de vida + interruptor 'hermes-agente' sembrado ON
#      (una decisión, una llave: instalar el órgano ES el consentimiento;
#       el estado persistido manda — tu apagado manual se respeta)
#
# El ÚNICO paso que no se puede automatizar es el proveedor LLM de Hermes
# (su API key es tuya): si falta, este script lo canta al final.
#
# Idempotente y guardado: cada paso se salta lo ya hecho; un fallo hace warn
# y el provider de Enki degrada honesto (no-disponible), jamás rompe el deploy.
#
# Uso:
#   sudo ./deployment/hermes/setup-hermes.sh [INSTALL_DIR]   # default /opt/enki
# =============================================================================

set -uo pipefail

INSTALL_DIR="${1:-/opt/enki}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="/home/hermes"
HERMES_BIN="${HERMES_HOME}/.local/bin/hermes"
HERMES_CFG="${HERMES_HOME}/.hermes/config.yaml"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

[[ $EUID -ne 0 ]] && { echo -e "${RED}[ERROR]${NC} Ejecutar con sudo"; exit 1; }

log "Hermes (agente trabajador, nativo :8642)..."

# ---- 1. Usuario dedicado ----
if ! id hermes &>/dev/null; then
    adduser --disabled-password --gecos "" hermes > /dev/null 2>&1 \
        && log "usuario 'hermes' creado" \
        || { warn "no pude crear el usuario 'hermes' — Hermes no se instala esta pasada"; exit 0; }
else
    log "usuario 'hermes' ya existe"
fi

# ---- 1b. Dependencias de sistema (ROOT) — antes del installer, para que NO pida sudo ----
# El usuario 'hermes' es contenido: sin contraseña, sin sudo (ejecuta código; mejor
# que no escale). El installer oficial las metería con `sudo apt-get` → prompt de
# contraseña que 'hermes' no tiene, y el deploy se cuelga. Las mete ROOT aquí: el
# installer las encuentra presentes y salta el sudo. build-essential ya lo trae
# vps-setup.sh (sección 1), pero se repite por si setup-hermes.sh corre standalone
# (apt es idempotente: lo ya instalado no se toca). Guardado: fallo → warn, sigue.
log "dependencias de sistema para hermes (ripgrep, ffmpeg, build-essential)..."
apt-get install -y -qq ripgrep ffmpeg build-essential > /dev/null 2>&1 \
    && log "ripgrep + ffmpeg + build-essential listos (el installer no pedirá sudo)" \
    || warn "no pude instalar ripgrep/ffmpeg/build-essential — el installer de hermes puede pedir sudo (que 'hermes' no tiene). Mételos a mano como root."

# ---- 2. Instalador oficial (idempotente: si el binario está, no se repite) ----
if [ -x "${HERMES_BIN}" ]; then
    log "hermes ya instalado ($(sudo -u hermes ${HERMES_BIN} --version 2>/dev/null || echo ok))"
else
    log "instalando hermes-agent (installer oficial de Nous — la 1ª vez tarda unos minutos)..."
    if sudo -u hermes -H bash -c 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash' > /dev/null 2>&1 \
        && [ -x "${HERMES_BIN}" ]; then
        log "hermes instalado en ${HERMES_BIN}"
    else
        warn "el installer de hermes falló (¿red?) — el provider de Enki degrada honesto. Reintenta: sudo ./deployment/hermes/setup-hermes.sh"
        exit 0
    fi
fi

# ---- 3. La key: nace UNA vez, vive en data/.env (Enki la carga al arrancar) ----
mkdir -p "${INSTALL_DIR}/data"
if ! grep -q '^HERMES_API_KEY=' "${INSTALL_DIR}/data/.env" 2>/dev/null; then
    echo "HERMES_API_KEY=$(openssl rand -hex 32)" >> "${INSTALL_DIR}/data/.env"
    log "HERMES_API_KEY generada en ${INSTALL_DIR}/data/.env"
fi
HERMES_KEY="$(grep -m1 '^HERMES_API_KEY=' "${INSTALL_DIR}/data/.env" | cut -d= -f2-)"

# ---- 4. config.yaml: la puerta local (api_server) con la MISMA key ----
_CFG_CAMBIO=0
sudo -u hermes mkdir -p "${HERMES_HOME}/.hermes"
if [ ! -f "${HERMES_CFG}" ]; then
    # No hay config → la creamos mínima con la puerta. `hermes setup` (el
    # wizard del proveedor LLM) la completa después sin pisarla.
    cat > "${HERMES_CFG}" <<EOF
# config.yaml — creado por deployment/hermes/setup-hermes.sh (Enki).
# La puerta LOCAL por la que Enki delega (provider 'hermes' del ai-gateway).
# Completa el proveedor LLM con: hermes setup
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
    log "api_server ya configurado en config.yaml (lo del humano manda)"
    # Fuente de verdad de la key para ENKI = la que Hermes tiene de verdad.
    _KEY_VIVA="$(grep -A6 'api_server' "${HERMES_CFG}" | grep -m1 'key:' | sed 's/.*key:[[:space:]]*//; s/^"//; s/"$//')"
    if [ -n "${_KEY_VIVA}" ] && [ "${_KEY_VIVA}" != "${HERMES_KEY}" ]; then
        sed -i "s|^HERMES_API_KEY=.*|HERMES_API_KEY=${_KEY_VIVA}|" "${INSTALL_DIR}/data/.env"
        warn "key distinta en config.yaml → data/.env sincronizado con la de Hermes (reinicia enki para recargarla)"
    fi
elif grep -q '^platforms:' "${HERMES_CFG}"; then
    # Ya hay 'platforms:' sin api_server: un append duplicaría la clave (YAML
    # inválido). Degradación honesta: se canta el bloque, no se rompe el fichero.
    warn "config.yaml ya tiene 'platforms:' sin api_server — añade A MANO bajo esa clave (ver deployment/hermes/config.api-server.yaml.example) con key=\$HERMES_API_KEY de ${INSTALL_DIR}/data/.env"
else
    cat >> "${HERMES_CFG}" <<EOF

# --- añadido por deployment/hermes/setup-hermes.sh (Enki): la puerta local ---
platforms:
  api_server:
    enabled: true
    extra:
      key: "${HERMES_KEY}"
EOF
    _CFG_CAMBIO=1
    log "bloque api_server añadido a config.yaml"
fi

# ---- 5. systemd: Hermes VIVO (sobrevive reinicios) ----
if ! cmp -s "${SCRIPT_DIR}/hermes-gateway.service" /etc/systemd/system/hermes-gateway.service 2>/dev/null; then
    cp "${SCRIPT_DIR}/hermes-gateway.service" /etc/systemd/system/hermes-gateway.service
    systemctl daemon-reload
fi
if systemctl enable --now hermes-gateway > /dev/null 2>&1; then
    [ "${_CFG_CAMBIO}" = "1" ] && systemctl restart hermes-gateway > /dev/null 2>&1
else
    warn "hermes-gateway no arrancó (revisa: journalctl -u hermes-gateway -f)"
fi

# ---- 6. Sonda de vida (hasta ~30s: el primer arranque carga el venv) ----
_VIVO=0
for _i in $(seq 1 15); do
    if curl -fsS -m 3 -H "Authorization: Bearer ${HERMES_KEY}" http://127.0.0.1:8642/v1/models > /dev/null 2>&1; then
        _VIVO=1; break
    fi
    sleep 2
done

if [ "${_VIVO}" = "1" ]; then
    log "hermes-gateway VIVO en 127.0.0.1:8642 (memoria en /home/hermes/.hermes)"
    # Una decisión, una llave: instalar el órgano ES el consentimiento — el
    # interruptor nace ON en la instalación. Solo se siembra si el humano no
    # decidió ya (el estado persistido manda, incluida su decisión de apagarlo).
    node -e "
      const fs=require('fs'),p='${INSTALL_DIR}/data/interruptores.json';
      let st={estados:{}}; try{st=JSON.parse(fs.readFileSync(p,'utf8'))}catch(_){}
      st.estados=st.estados||{};
      if(!('hermes-agente' in st.estados)){ st.estados['hermes-agente']=true; fs.writeFileSync(p,JSON.stringify(st,null,2)); console.log('sembrado'); }
    " > /dev/null 2>&1 && log "Interruptor hermes-agente: ON (instalar es decidir; tu apagado manual se respeta)" || true
else
    warn "hermes-gateway no responde aún en :8642 — el provider degrada honesto. Causa más común: falta el proveedor LLM."
fi

# ---- 7. El único paso manual que queda (la key del LLM es tuya) ----
if ! sudo -u hermes grep -qE '^model:|^providers:|api_key|nous_portal' "${HERMES_CFG}" 2>/dev/null; then
    warn "Hermes aún SIN proveedor LLM — una vez: sudo -u hermes -i hermes setup   (luego: sudo systemctl restart hermes-gateway)"
fi
