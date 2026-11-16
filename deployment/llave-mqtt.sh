#!/usr/bin/env bash
# llave-mqtt.sh — deja /etc/caddy/puerta.caddy SOLO con la llave del panel de
# cocina.
#
# Ya NO hay contraseña de persona en el dominio público: el panel vive en
# 1.<dominio>. Este snippet solo resuelve el problema del ESP32 de cocina, que
# no sabe mandar cabeceras HTTP y lleva su llave en la URL del websocket.
#
# Sin llave responde 404, NO 401: un 401 abre el diálogo de contraseña del
# navegador encima de la página que estés viendo.
#
# Uso:  sudo bash deployment/llave-mqtt.sh
set -uo pipefail

SNIPPET=/etc/caddy/puerta.caddy
TOKEN_FILE=/etc/caddy/panel.token
CADDYFILE=/etc/caddy/Caddyfile

[ "$(id -u)" = "0" ] || { echo "ERROR: ejecútalo con sudo." >&2; exit 1; }
command -v caddy >/dev/null || { echo "ERROR: falta caddy." >&2; exit 1; }

TOKEN=""
[ -f "$TOKEN_FILE" ] && TOKEN="$(tr -d '\n' < "$TOKEN_FILE")"
if [ -z "$TOKEN" ]; then
	TOKEN="$(openssl rand -hex 16)"
	printf '%s\n' "$TOKEN" > "$TOKEN_FILE" && chmod 600 "$TOKEN_FILE"
	echo "Llave nueva creada en $TOKEN_FILE"
fi

cat > "$SNIPPET" <<EOF
# ── LLAVE DEL PANEL DE COCINA (generado por deployment/llave-mqtt.sh) ─────────
# El chip no sabe mandar cabeceras: lleva su llave en la dirección del websocket.
# Sin llave: 404. NO 401 — un 401 abre el diálogo de contraseña del navegador.
@mqtt_sin_llave {
	path /mqtt
	not query k=${TOKEN}
}
respond @mqtt_sin_llave 404

handle /mqtt {
	reverse_proxy localhost:9001
}
# ── fin ─────────────────────────────────────────────────────────────────────
EOF

chown caddy:caddy "$SNIPPET" 2>/dev/null || true
chmod 640 "$SNIPPET"

if ! caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
	echo "ERROR: el Caddyfile no valida. No recargo." >&2
	exit 1
fi
systemctl reload caddy || { echo "ERROR: no pude recargar Caddy." >&2; exit 1; }

echo "Listo. El bus queda asi:"
echo "  sin llave : 404"
echo "  con llave : wss://<dominio>/mqtt?k=${TOKEN}"
echo ""
echo "Grabala en el panel de cocina: ${TOKEN}"
