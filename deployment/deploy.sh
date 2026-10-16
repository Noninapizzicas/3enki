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

# ── GUARDA: el repo tiene que estar EN main ──────────────────────────────────
# deploy.sh copia el WORKING TREE del repo (rsync), NO git. Si el repo está en una rama
# de trabajo o por detrás de origin/main, el deploy REVIERTE en prod todo lo que main
# tenga de más — y en silencio. Medido 2026-10-16: el repo estaba en una rama 14 commits
# atrás, así que ese deploy habría deshecho la doctrina de identidad de carril del
# filesystem (#767) y 4 PRs del día. Nada avisaba.
if [ "${ENKI_DEPLOY_FORZAR:-}" != "1" ] && git -C "${REPO_DIR}" rev-parse --git-dir &>/dev/null; then
    _HEAD=$(git -C "${REPO_DIR}" rev-parse HEAD)
    timeout 20 git -C "${REPO_DIR}" fetch origin --quiet 2>/dev/null \
        || warn "no se pudo consultar origin (¿red?) — compruebo con la referencia local"
    _MAIN=$(git -C "${REPO_DIR}" rev-parse origin/main 2>/dev/null || echo "")
    if [ -n "${_MAIN}" ] && [ "${_HEAD}" != "${_MAIN}" ]; then
        _RAMA=$(git -C "${REPO_DIR}" rev-parse --abbrev-ref HEAD)
        _FALTAN=$(git -C "${REPO_DIR}" rev-list --count "${_HEAD}..${_MAIN}" 2>/dev/null || echo "?")
        warn "ABORTO: el repo NO está en main."
        warn "  rama actual      : ${_RAMA}"
        warn "  commits de menos : ${_FALTAN} respecto a origin/main"
        warn "Desplegar así REVERTIRÍA en prod esos ${_FALTAN} commits (rsync copia el working tree)."
        warn "Arréglalo:   cd ${REPO_DIR} && git fetch origin && git checkout main && git pull origin main"
        warn "O fuerza:    ENKI_DEPLOY_FORZAR=1 sudo ./deployment/deploy.sh"
        exit 1
    fi
    if ! git -C "${REPO_DIR}" diff-index --quiet HEAD -- 2>/dev/null; then
        warn "El repo tiene cambios SIN COMMITEAR: se desplegarán tal cual."
    fi
    log "Repo en origin/main ($(echo "${_HEAD}" | cut -c1-8)) — listo para desplegar."
fi

# ¿cambió package.json? ¿cambió el frontend?
NEED_NPM=false
diff -q "${REPO_DIR}/package.json" "${INSTALL_DIR}/package.json" &>/dev/null || NEED_NPM=true
NEED_BUILD=false
diff -rq "${REPO_DIR}/frontend/src" "${INSTALL_DIR}/frontend/src" &>/dev/null 2>&1 || NEED_BUILD=true

# 1) Copiar código. Quedan intactos: node_modules, data, public, **storage** y los
#    package-lock (que están en .gitignore y los genera npm en la máquina).
#    OJO con `storage`: NO es código. El proyecto SISTEMA tiene base_path=/opt/enki, así que
#    su storage vive en la RAÍZ del install y no lo cubre el exclude de `data` (los otros
#    proyectos sí: su base_path es data/projects/<slug>). Sin este exclude, el --delete se
#    llevó por delante storage/esquemas/modulos/arnes-nicho.construccion.json (medido 2026-10-16).
#    Mismo motivo para package-lock.json: el del frontend ya estaba excluido; el de la raíz no.
log "Copiando archivos..."
rsync -a --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='data' \
    --exclude='public' \
    --exclude='storage' \
    --exclude='package-lock.json' \
    --exclude='.hermes' \
    --exclude='.work*' \
    --exclude='*.bak-*' \
    --exclude='frontend/build' \
    --exclude='frontend/.svelte-kit' \
    --exclude='frontend/package-lock.json' \
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
    # El heap del build se AJUSTA a la memoria real de la máquina: total − 1 GB de
    # reserva (mínimo, la mitad en máquinas pequeñas). Un valor fijo mayor que la RAM
    # hace que el OOM killer tumbe la VPS a mitad de build (medido: 6 reinicios en una
    # tarde con --max-old-space-size=4096 en una VPS de 3868 MB). El build AJUSTA su
    # heap a la máquina; nunca lo impone por encima de ella.
    _TOTAL_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
    _HEAP_MB=$(( _TOTAL_MB > 2048 ? _TOTAL_MB - 1024 : _TOTAL_MB / 2 ))
    (cd "${INSTALL_DIR}/frontend" && npm install --silent 2>/dev/null && NODE_OPTIONS="--max-old-space-size=${_HEAP_MB}" npm run build --silent 2>/dev/null)
else
    log "Frontend sin cambios"
fi

chown -R www-data:www-data "${INSTALL_DIR}" 2>/dev/null || true

# 3.5) Normalizar permisos de módulos (grupo www-data escribe — el chat necesita g+w)
normalizar_permisos() {
  local d="$1"
  find "$d" -type d ! -path "*/node_modules/*" ! -perm -g+w -exec chmod g+w {} + 2>/dev/null || true
  find "$d" -type d ! -path "*/node_modules/*" ! -perm -2000 -exec chmod g+s {} + 2>/dev/null || true
  find "$d" -type f ! -path "*/node_modules/*" ! -perm -g+w -exec chmod g+w {} + 2>/dev/null || true
}
normalizar_permisos "${INSTALL_DIR}/modules"
normalizar_permisos "${REPO_DIR}/modules"

# 4) RECONCILIAR la infra — UN solo cerebro, idempotente. Deja el VPS funcional
#    (dirs shop, ReadWritePaths, bloque Caddy /shop/*, servicios) e igual en todos.
#    Corre DESDE EL REPO (deployment/ se excluye del rsync a /opt/enki): el
#    reconciliador resuelve sus plantillas por __dirname y escribe rutas absolutas.
log "Reconciliando infra (dirs · systemd · Caddy)..."
node "${REPO_DIR}/deployment/reconcile.js"

echo ""
log "Deploy completado"
echo ""
