#!/usr/bin/env bash
# ============================================================
# instalar-mcp-github.sh — monta UN servidor MCP de GitHub compartido.
#
# Problema que resuelve: cada perfil de Hermes (default, segundo, orus…) arrancaba
# su PROPIO `npx @modelcontextprotocol/server-github` por stdio. Con N perfiles eso
# son N copias del servidor (medido en VPS1: hasta 11 procesos, ~550 MB) compitiendo
# por los mismos recursos. Con este hub hay UN servidor y N clientes ligeros.
#
# Qué hace:
#   1. Comprueba que existe ~/.hermes/.env con GITHUB_TOKEN.
#   2. Instala el servicio systemd --user (mcp-github.service) → :8140/mcp.
#   3. Lo arranca y lo deja habilitado (sobrevive a reinicios).
#   4. Imprime lo que hay que poner en cada perfil (mcp_servers.github.url).
#
# Uso:  bash deployment/systemd/instalar-mcp-github.sh
# Idempotente: se puede correr varias veces sin romper nada.
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_SRC="${REPO_DIR}/deployment/systemd/mcp-github.service"
UNIT_DST="${HOME}/.config/systemd/user/mcp-github.service"
ENV_FILE="${HOME}/.hermes/.env"
PUERTO=8140

log() { echo "[mcp-github] $*"; }

# ── 1. Token ──────────────────────────────────────────────
if ! grep -q '^GITHUB_TOKEN=' "${ENV_FILE}" 2>/dev/null; then
  echo "[mcp-github] ERROR: falta GITHUB_TOKEN en ${ENV_FILE}" >&2
  echo "            Añádelo y vuelve a correr. El token NUNCA va en el .service." >&2
  exit 1
fi
log "token encontrado en ${ENV_FILE}"

# ── 1b. supergateway disponible (npx lo trae bajo demanda; solo avisamos) ──
command -v npx >/dev/null 2>&1 || { echo "[mcp-github] ERROR: falta npx (Node.js)." >&2; exit 1; }

# ── 2. Servicio systemd --user ────────────────────────────
mkdir -p "$(dirname "${UNIT_DST}")"
install -m 0644 "${UNIT_SRC}" "${UNIT_DST}"
log "servicio instalado en ${UNIT_DST}"

systemctl --user daemon-reload

# ── 3. Arrancar y habilitar ───────────────────────────────
if systemctl --user enable --now mcp-github.service >/dev/null 2>&1; then
  log "arrancado y habilitado (autoarranque activo)"
else
  log "AVISO: no se pudo arrancar. Revisa: journalctl --user -u mcp-github -n 20"
fi

# ── 3b. Verificar que escucha ─────────────────────────────
sleep 3
if ss -tlnp 2>/dev/null | grep -q ":${PUERTO}"; then
  log "escuchando en 127.0.0.1:${PUERTO}/mcp ✓"
else
  log "AVISO: aún no escucha en :${PUERTO} (npx tarda en bajar el paquete la 1ª vez)"
fi

# ── 4. Qué poner en cada perfil ───────────────────────────
cat <<EOF

[mcp-github] Listo. En CADA perfil de Hermes, sustituye el bloque stdio por HTTP:

  mcp_servers:
    github:
      url: http://127.0.0.1:${PUERTO}/mcp
      enabled: true
      timeout: 60

  (archivos: ~/.hermes/config.yaml, ~/.hermes/profiles/*/config.yaml)

Comprobar:   hermes mcp list        → github  http://127.0.0.1:${PUERTO}/mcp
Logs:        journalctl --user -u mcp-github -f
EOF
