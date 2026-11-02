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
# La llave del panel de cocina. NO es una contraseña de persona: es un secreto
# de aparato que viaja en la dirección del websocket (/mqtt?k=…). Nace aquí, en
# el servidor, y se reutiliza en cada pasada (si se borra, se emite otra y el
# panel deja de entrar hasta que se le regrabe).
TOKEN_FILE=/etc/caddy/panel.token
IMPORT_LINE="import /etc/caddy/puerta.caddy"
SITE="enki-ai.online"
# Lo que sigue abierto sin contraseña: carta pública, pedidos web, Glovo,
# WhatsApp y el healthcheck. (/scad/* fuera: OpenSCAD ya no existe.)
PUBLICO="/a/* /tienda/* /glovo/* /whatsapp/* /health"
DRY=0
PWS=0
for arg in "$@"; do
  [ "$arg" = "--dry-run" ] && DRY=1
  [ "$arg" = "--password-stdin" ] && PWS=1
done

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
  if [ "$PWS" = "1" ] || [ "$DRY" = "1" ]; then
    # Sin terminal: la contraseña entra por stdin (primera línea), para poder
    # lanzarlo desde un script o un agente. No se imprime ni se guarda.
    read -r PW1; PW2="$PW1"
    [ -z "$PW1" ] && { echo "ERROR: contraseña vacía en stdin" >&2; exit 1; }
  else
    echo "ERROR: hace falta una terminal interactiva, o pasa --password-stdin." >&2
    exit 1
  fi
fi

HASH="$(caddy hash-password --algorithm bcrypt --plaintext "$PW1")" || { echo "ERROR: no pude cifrar la contraseña" >&2; exit 1; }
[ -z "$HASH" ] && { echo "ERROR: huella vacía" >&2; exit 1; }

# ── 1b. La llave del panel de cocina ─────────────────────────────────────────
# El panel es un ESP32: su cliente MQTT no sabe mandar cabecera de autenticación,
# pero SÍ puede llevar la llave en la dirección del websocket. La llave nace en
# este servidor (no la teclea nadie) y se conserva entre pasadas: si ya existe,
# se reutiliza, para que cambiar la contraseña de la web no deje la cocina a
# oscuras.
nueva_llave() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}
PANEL_TOKEN=""
[ -f "$TOKEN_FILE" ] && PANEL_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE" 2>/dev/null)"
TOKEN_NUEVA=0
if [ "${#PANEL_TOKEN}" -lt 32 ]; then
  PANEL_TOKEN="$(nueva_llave | tr -d '[:space:]')"
  [ "${#PANEL_TOKEN}" -lt 32 ] && { echo "ERROR: no pude generar la llave del panel." >&2; exit 1; }
  TOKEN_NUEVA=1
fi

# ── 2. Snippet de la puerta ──────────────────────────────────────────────────
TMP_SNIPPET="$(mktemp)"
cat > "$TMP_SNIPPET" << SNIP
# ── PUERTA (generado por deployment/puerta.sh) ──────────────────────────────
# Todo pide contraseña salvo lo público: carta, pedidos web, Glovo, WhatsApp
# y /health. Este fichero NO lo pisa el deploy: vive fuera de la plantilla.
@privada {
	not path $PUBLICO
	not path /mqtt
}
basic_auth @privada {
	$USUARIO $HASH
}
# El PANEL DE COCINA no teclea contraseñas: el cliente MQTT del chip no sabe
# mandar cabecera de autenticación, pero SÍ puede llevar su llave en la propia
# dirección del websocket →  wss://$SITE/mqtt?k=<llave>
# Sin la llave, /mqtt sigue cerrado como todo lo demás.
@mqtt_sin_llave {
	path /mqtt
	not query k=$PANEL_TOKEN
}
basic_auth @mqtt_sin_llave {
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
# Los logs van a la carpeta temporal de validación: /tmp/caddy-dry-* puede
# existir de una prueba anterior (de root) y Caddy no podría escribirlo.
sed -i "s#/var/log/caddy/#$VAL_DIR/#g" "$VAL_DIR/Caddyfile"
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
  echo "    llave del panel: $PANEL_TOKEN  (de vista previa: no se ha guardado)"
  exit 0
fi

# ── 5. Aplicar (con copia de seguridad) ──────────────────────────────────────
BACKUP="/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
cp "$CADDYFILE" "$BACKUP" || { echo "ERROR: no pude hacer copia de seguridad" >&2; exit 1; }
BACKUP_SNIP=""
[ -f "$SNIPPET" ] && { BACKUP_SNIP="$BACKUP.puerta"; cp "$SNIPPET" "$BACKUP_SNIP"; }
echo "Copia de seguridad: $BACKUP"

# La llave va al disco ANTES de tocar Caddy: si no se puede guardar, no se
# aplica una puerta que dejaría al panel fuera para siempre.
if [ "$TOKEN_NUEVA" = "1" ]; then
  printf '%s\n' "$PANEL_TOKEN" > "$TOKEN_FILE" && chmod 600 "$TOKEN_FILE" || {
    echo "ERROR: no pude guardar la llave del panel en $TOKEN_FILE" >&2
    rm -f "$TMP_SNIPPET" "$TMP_CADDY"; exit 1
  }
fi

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
# El bus: sin llave debe seguir cerrado; con la llave del panel debe PASAR de la
# puerta (lo que responda el broker después da igual: 400/426 es "llegó dentro").
C_MQTT_SIN=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE/mqtt")
C_MQTT_PANEL=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE/mqtt?k=$PANEL_TOKEN")
unset PW1 PW2

echo "  sistema sin contraseña : $C_SIN   (debe ser 401)"
echo "  sistema con clave mala : $C_MAL   (debe ser 401)"
echo "  sistema con tu clave   : $C_BIEN   (debe ser 200/302)"
echo "  carta pública          : $C_PUB   (debe ser 200)"
echo "  bus sin llave          : $C_MQTT_SIN   (debe ser 401)"
echo "  bus con llave del panel: $C_MQTT_PANEL   (NO debe ser 401)"

if [ "$C_SIN" != "401" ] || [ "$C_PUB" != "200" ] || [ "$C_MQTT_SIN" != "401" ] || [ "$C_MQTT_PANEL" = "401" ]; then
  echo "ERROR: la puerta no quedó como debía." >&2
  rollback; exit 1
fi
echo "OK. La web ya pide contraseña, la carta sigue abierta y el panel tiene su llave."
echo
echo "Persistencia: la puerta vive en $SNIPPET y el Caddyfile solo guarda el import."
echo "El próximo deploy reescribe el Caddyfile desde la plantilla del repo, que ya"
echo "trae el import — y el snippet no lo toca nadie."
echo
echo "Entra en $BASE  (usuario: $USUARIO). Una vez por aparato."
echo
echo "LLAVE DEL PANEL DE COCINA (esta pantalla la lleva dentro; no se teclea):"
echo "  $PANEL_TOKEN"
echo "  dirección que usa el panel: wss://$SITE/mqtt?k=$PANEL_TOKEN"
echo "  guardada en $TOKEN_FILE (solo root). Cambiarla = borrar ese fichero,"
echo "  volver a lanzar esto y regrabar el firmware del panel."
