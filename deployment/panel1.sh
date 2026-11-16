#!/usr/bin/env bash
# panel1.sh — pone usuario y contraseña del PANEL PRIVADO (1.<dominio>).
#
# La credencial NO vive en el repo: se escribe en /etc/caddy/panel1.caddy, que
# el deploy no pisa (igual que puerta.caddy). Así cambiar la contraseña del
# panel no obliga a tocar el Caddyfile ni a desplegar.
#
# Uso:  sudo bash deployment/panel1.sh
set -uo pipefail

SNIPPET=/etc/caddy/panel1.caddy
CADDYFILE=/etc/caddy/Caddyfile

[ "$(id -u)" = "0" ] || { echo "ERROR: ejecútalo con sudo." >&2; exit 1; }
command -v caddy >/dev/null || { echo "ERROR: falta caddy." >&2; exit 1; }

USUARIO="paco"
read -rsp "Usuario (por defecto paco): " U; echo
USUARIO="${U:-paco}"
while true; do
  read -rsp "Contraseña: " P1; echo
  [ -z "$P1" ] && { echo "  No puede estar vacía."; continue; }
  read -rsp "Repite la contraseña: " P2; echo
  [ "$P1" != "$P2" ] && { echo "  No coinciden. Otra vez."; continue; }
  break
done

HASH="$(caddy hash-password --algorithm bcrypt --plaintext "$P1")" || {
  echo "ERROR: no pude cifrar la contraseña." >&2; exit 1; }
unset P1 P2

printf 'basic_auth {\n\t%s %s\n}\n' "$USUARIO" "$HASH" > "$SNIPPET"
chown caddy:caddy "$SNIPPET" 2>/dev/null || true
chmod 640 "$SNIPPET"

echo "Credencial escrita en $SNIPPET (usuario: $USUARIO)"

if ! caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
  echo "ERROR: el Caddyfile no valida. Restaura la copia y revisa." >&2
  exit 1
fi
systemctl reload caddy || { echo "ERROR: no pude recargar Caddy." >&2; exit 1; }
echo "Caddy recargado."

echo "Comprueba:"
echo "  sin clave : curl -sI https://1.<dominio> | head -1     (debe ser 401)"
echo "  con clave : curl -sI -u $USUARIO:TU_CLAVE https://1.<dominio> | head -1  (200)"
