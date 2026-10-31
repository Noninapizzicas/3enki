#!/usr/bin/env bash
# puerta.sh — pone contraseña en la web de Enki (Caddy basic_auth).
# La contraseña la elige quien lo ejecuta: no se guarda en ningún sitio,
# solo su huella bcrypt dentro del Caddyfile.
#
# Uso:  sudo bash deployment/puerta.sh          (aplica)
#       bash deployment/puerta.sh --dry-run    (solo genera /tmp/caddy-preview.Caddyfile)
set -uo pipefail

CADDYFILE=/etc/caddy/Caddyfile
SITE="enki-ai.online"
PUBLICO="/a/* /tienda/* /glovo/* /whatsapp/* /health /scad/*"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

if [ "$DRY" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "ERROR: ejecútalo con sudo." >&2; exit 1
fi
if [ "$DRY" = "0" ] && [ ! -f "$CADDYFILE" ]; then
  echo "ERROR: no existe $CADDYFILE" >&2; exit 1
fi
command -v caddy >/dev/null || { echo "ERROR: falta caddy" >&2; exit 1; }

# ── 1. Contraseña (la elige él, no se imprime) ───────────────────────────
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

# ── 2. Construir el Caddyfile nuevo ──────────────────────────────────────
if [ "$DRY" = "1" ]; then
  ORIGEN=/tmp/caddy-origen.Caddyfile
  cp "$CADDYFILE" "$ORIGEN" 2>/dev/null || cp /etc/caddy/Caddyfile "$ORIGEN"
  DESTINO=/tmp/caddy-preview.Caddyfile
else
  ORIGEN="$CADDYFILE"
  DESTINO="$CADDYFILE"
  BACKUP="/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$CADDYFILE" "$BACKUP" || { echo "ERROR: no pude hacer copia de seguridad" >&2; exit 1; }
  echo "Copia de seguridad: $BACKUP"
fi

TMP="$(mktemp)"
# Idempotente: si ya había una puerta puesta, se retira antes de escribir la nueva
# (así se puede cambiar la contraseña volviendo a ejecutarlo, sin duplicar el matcher).
awk -v usuario="$USUARIO" -v hash="$HASH" -v publico="$PUBLICO" -v site="$SITE" '
  BEGIN { hecho = 0; dentro = 0; viejo = 0 }
  $0 ~ /PUERTA \(generado por puerta\.sh\)/ { viejo = 1; next }
  viejo == 1 && $0 ~ /fin de la puerta/       { viejo = 0; next }
  viejo == 1                                  { next }
  # entrar en el bloque del sitio
  ($0 ~ "^" site "[ \t]*[{]") { dentro = 1 }
  {
     print
     if (dentro == 1 && hecho == 0) {
        print "\t# ── PUERTA (generado por puerta.sh) ──────────────────────────────"
        print "\t# Todo pide contraseña salvo lo público: carta, pedidos web, Glovo,"
        print "\t# WhatsApp, /health y el MCP de OpenSCAD (que ya lleva su token)."
        print "\t@privada not path " publico
        print "\tbasic_auth @privada {"
        print "\t\t" usuario " " hash
        print "\t}"
        print "\t# ── fin de la puerta ─────────────────────────────────────────────"
        hecho = 1
     }
     if (dentro == 1 && $0 ~ /^[}]/) dentro = 0
  }
' "$ORIGEN" > "$TMP"

if ! grep -q "PUERTA (generado por puerta.sh)" "$TMP"; then
  echo "ERROR: no encontré el bloque '$SITE {' en el Caddyfile." >&2
  rm -f "$TMP"; exit 1
fi

# ── 3. Validar ANTES de tocar nada ───────────────────────────────────────
A_VALIDAR="$TMP"
if [ "$DRY" = "1" ]; then
  # sin root no puedo escribir /var/log/caddy: valido con los logs a /tmp
  A_VALIDAR="$(mktemp)"; sed 's#/var/log/caddy/#/tmp/caddy-dry-#g' "$TMP" > "$A_VALIDAR"
fi
if ! caddy validate --config "$A_VALIDAR" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  echo "ERROR: Caddy rechaza la configuración nueva. NO he tocado nada." >&2
  grep -i "error" /tmp/caddy-validate.log | tail -5 >&2
  rm -f "$TMP" "$A_VALIDAR"; exit 1
fi
echo "Validación de Caddy: correcta."
[ "$A_VALIDAR" != "$TMP" ] && rm -f "$A_VALIDAR"

if [ "$DRY" = "1" ]; then
  cp "$TMP" "$DESTINO"; rm -f "$TMP" "$ORIGEN"
  echo "--- SECO: nada aplicado. Vista previa en $DESTINO (contraseña de prueba cifrada)."
  exit 0
fi

cp "$TMP" "$DESTINO"; rm -f "$TMP"

# ── 4. Recargar y comprobar de verdad ────────────────────────────────────
rollback() {
  echo "… deshaciendo: restauro $BACKUP" >&2
  cp "$BACKUP" "$CADDYFILE" && systemctl reload caddy
  echo "Estado anterior restaurado." >&2
}

systemctl reload caddy || { echo "ERROR: no pude recargar Caddy" >&2; rollback; exit 1; }
sleep 2

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
echo "Entra en $BASE  (usuario: $USUARIO). Una vez por aparato."
echo "Si algún aparato se queda en «sin conexión», dime y lo miramos."
