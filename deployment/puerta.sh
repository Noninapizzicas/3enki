#!/usr/bin/env bash
# puerta.sh — pone contraseña en la web de Enki (Caddy basic_auth).
#
# PERSISTE A LOS DEPLOYS. No deja la puerta dentro del Caddyfile, porque
# deploy.sh reescribe /etc/caddy/Caddyfile desde deployment/caddy/Caddyfile.vps
# en cada despliegue (deployment/reconcile.js) y se la llevaría por delante.
#
# En su lugar:
#   · escribe la puerta en un snippet aparte:  /etc/caddy/puerta.caddy
#   · deja en el Caddyfile una sola línea:     import /etc/caddy/puerta.caddy
#   · esa línea vive también en la plantilla del repo (deployment/caddy/
#     Caddyfile.vps), así que el deploy la repone; el snippet no lo toca nadie.
#
# La contraseña la elige quien lo ejecuta: no se guarda en ningún sitio,
# solo su huella bcrypt dentro del snippet.
#
# Uso:  sudo bash deployment/puerta.sh            (aplica)
#       bash deployment/puerta.sh --dry-run      (solo vista previa en /tmp)
set -uo pipefail

CADDYFILE=/etc/caddy/Caddyfile
SNIPPET=/etc/caddy/puerta.caddy
IMPORT_LINE="import /etc/caddy/puerta.caddy"
SITE="enki-ai.online"
# Lo que sigue abierto sin contraseña: carta pública, pedidos web, Glovo,
# WhatsApp y el healthcheck. (/scad/* fuera: OpenSCAD ya no existe.)
PUBLICO="/a/* /tienda/* /glovo/* /whatsapp/* /health"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

if [ "$DRY" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "ERROR: ejecútalo con sudo." >&2; exit 1
fi
if [ ! -f "$CADDYFILE" ]; then
  echo "ERROR: no existe $CADDYFILE" >&2; exit 1
fi
command -v caddy >/dev/null || { echo "ERROR: falta caddy" >&2; exit 1; }

# ── 1. Contraseña (la elige él, no se imprime) ───────────────────────────────
USUARIO="paco"
if [ -t 0 ]; then
  read -rsp "Usuario (por defecto paco): " USUARIO; echo
  USUARIO="${USUARIO:-paco}"
  while true; do
    read -rsp "Contraseña: " PW1; echo
    [ -z "$PW1" ] && { echo "  La contraseña no puede estar vacía."; continue; }
    read -rsp "Repite la contraseña: " PW2; echo
    [ "$PW1" != "$PW2" ] && { echo "  No coinciden. Otra vez."; continue; }
    break
  done
else
  if [ "$DRY" = "1" ]; then
    read -r PW1; PW2="$PW1"
    [ -z "$PW1" ] && { echo "ERROR: contraseña vacía en stdin" >&2; exit 1; }
  else
    echo "ERROR: hace falta una terminal interactiva para escribir la contraseña." >&2
    exit 1
  fi
fi

HASH="$(caddy hash-password --algorithm bcrypt --plaintext "$PW1")" || { echo "ERROR: no pude cifrar la contraseña" >&2; exit 1; }
[ -z "$HASH" ] && { echo "ERROR: huella vacía" >&2; exit 1; }

# ── 2. Snippet de la puerta ──────────────────────────────────────────────────
TMP_SNIPPET="$(mktemp)"
cat > "$TMP_SNIPPET" << SNIP
# ── PUERTA (generado por deployment/puerta.sh) ──────────────────────────────
# Todo pide contraseña salvo lo público: carta, pedidos web, Glovo, WhatsApp
# y /health. Este fichero NO lo pisa el deploy: vive fuera de la plantilla.
@privada not path $PUBLICO
basic_auth @privada {
	$USUARIO $HASH
}
# ── fin de la puerta ────────────────────────────────────────────────────────
SNIP

# ── 3. Caddyfile: asegurar el import y quitar puertas antiguas incrustadas ───
TMP_CADDY="$(mktemp)"
YA_IMPORT=0
grep -qF "$IMPORT_LINE" "$CADDYFILE" && YA_IMPORT=1

awk -v import_line="$IMPORT_LINE" -v site="$SITE" -v ya="$YA_IMPORT" '
  $0 ~ /PUERTA \(generado por puerta\.sh\)/ { viejo = 1; next }
  viejo == 1 && $0 ~ /fin de la puerta/       { viejo = 0; next }
  viejo == 1                                  { next }
  { print }
  ($0 ~ "^" site "[ \t]*[{]") && !hecho {
     if (ya == 0) {
        print "\t# Puerta de contraseña — la pone deployment/puerta.sh. El snippet"
        print "\t# vive fuera de la plantilla, así que sobrevive a los deploys."
        print "\t" import_line
     }
     hecho = 1
  }
' "$CADDYFILE" > "$TMP_CADDY"

if ! grep -qF "$IMPORT_LINE" "$TMP_CADDY"; then
  echo "ERROR: no encontré el bloque '$SITE {' en el Caddyfile." >&2
  rm -f "$TMP_SNIPPET" "$TMP_CADDY"; exit 1
fi

# ── 4. Validar ANTES de tocar nada (con el import resuelto) ──────────────────
VAL_DIR="$(mktemp -d)"
cp "$TMP_CADDY" "$VAL_DIR/Caddyfile"
cp "$TMP_SNIPPET" "$VAL_DIR/puerta.caddy"
sed -i "s#^\([[:space:]]*\)import /etc/caddy/puerta.caddy#\1import $VAL_DIR/puerta.caddy#" "$VAL_DIR/Caddyfile"
sed -i 's#/var/log/caddy/#/tmp/caddy-dry-#g' "$VAL_DIR/Caddyfile"
VLOG="$(mktemp)"
if ! caddy validate --config "$VAL_DIR/Caddyfile" --adapter caddyfile >"$VLOG" 2>&1; then
  echo "ERROR: Caddy rechaza la configuración nueva. NO he tocado nada." >&2
  grep -i "error" "$VLOG" | tail -5 >&2
  rm -f "$VLOG"
  rm -rf "$VAL_DIR" "$TMP_SNIPPET" "$TMP_CADDY"; exit 1
fi
echo "Validación de Caddy: correcta."
rm -rf "$VAL_DIR"

if [ "$DRY" = "1" ]; then
  cp "$TMP_CADDY" /tmp/caddy-preview.Caddyfile
  cp "$TMP_SNIPPET" /tmp/caddy-preview-puerta.caddy
  rm -f "$TMP_SNIPPET" "$TMP_CADDY"
  echo "--- SECO: nada aplicado."
  echo "    Caddyfile: /tmp/caddy-preview.Caddyfile"
  echo "    snippet  : /tmp/caddy-preview-puerta.caddy"
  exit 0
fi

# ── 5. Aplicar (con copia de seguridad) ──────────────────────────────────────
BACKUP="/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
cp "$CADDYFILE" "$BACKUP" || { echo "ERROR: no pude hacer copia de seguridad" >&2; exit 1; }
BACKUP_SNIP=""
[ -f "$SNIPPET" ] && { BACKUP_SNIP="$BACKUP.puerta"; cp "$SNIPPET" "$BACKUP_SNIP"; }
echo "Copia de seguridad: $BACKUP"

cp "$TMP_SNIPPET" "$SNIPPET"
cp "$TMP_CADDY" "$CADDYFILE"
rm -f "$TMP_SNIPPET" "$TMP_CADDY"

rollback() {
  echo "… deshaciendo: restauro $BACKUP" >&2
  cp "$BACKUP" "$CADDYFILE"
  if [ -n "$BACKUP_SNIP" ]; then cp "$BACKUP_SNIP" "$SNIPPET"; else rm -f "$SNIPPET"; fi
  systemctl reload caddy
  echo "Estado anterior restaurado." >&2
}

systemctl reload caddy || { echo "ERROR: no pude recargar Caddy" >&2; rollback; exit 1; }
sleep 2

# ── 6. Comprobar de verdad ───────────────────────────────────────────────────
BASE="https://$SITE"
C_SIN=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE/")
C_MAL=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -u "$USUARIO":"no-es-la-clave" "$BASE/")
C_BIEN=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -u "$USUARIO":"$PW1" "$BASE/")
C_PUB=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE/a/nonina/carta.html")
unset PW1 PW2

echo "  sistema sin contraseña : $C_SIN   (debe ser 401)"
echo "  sistema con clave mala : $C_MAL   (debe ser 401)"
echo "  sistema con tu clave   : $C_BIEN   (debe ser 200/302)"
echo "  carta pública          : $C_PUB   (debe ser 200)"

if [ "$C_SIN" != "401" ] || [ "$C_PUB" != "200" ]; then
  echo "ERROR: la puerta no quedó como debía." >&2
  rollback; exit 1
fi
echo "OK. La web ya pide contraseña y la carta sigue abierta."
echo
echo "Persistencia: la puerta vive en $SNIPPET y el Caddyfile solo guarda el import."
echo "El próximo deploy reescribe el Caddyfile desde la plantilla del repo, que ya"
echo "trae el import — y el snippet no lo toca nadie."
echo
echo "Entra en $BASE  (usuario: $USUARIO). Una vez por aparato."
