#!/usr/bin/env bash
# cortafuegos.sh — cierra al mundo los puertos que solo usa Caddy por dentro.
# No toca 22 (SSH), ni 80, ni 443.
#
# Uso:  sudo bash deployment/cortafuegos.sh          (3000, 3001, 9001)
#       sudo bash deployment/cortafuegos.sh todo     (además 1883, 8130, 8140)
#       sudo bash deployment/cortafuegos.sh quitar   (deshace todo)
set -uo pipefail

if [ "$(id -u)" != "0" ]; then echo "ERROR: ejecútalo con sudo." >&2; exit 1; fi

BASICOS="3000 3001 9001"        # solo los consume Caddy desde localhost
EXTRA="1883 8130 8140"          # MQTT crudo y puentes: si un aparato entra directo, se cae
MODO="${1:-basico}"
case "$MODO" in
  basico|"") PUERTOS="$BASICOS" ;;
  todo)      PUERTOS="$BASICOS $EXTRA" ;;
  quitar)    PUERTOS="$BASICOS $EXTRA" ;;
  *) echo "Uso: sudo bash $0 [todo|quitar]" >&2; exit 1 ;;
esac

UFW_ACTIVO=0
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "^Status: active"; then
  UFW_ACTIVO=1
fi
echo "Cortafuegos detectado: $([ $UFW_ACTIVO = 1 ] && echo ufw || echo iptables)"
echo "Puertos a cerrar desde fuera: $PUERTOS (localhost sigue funcionando)"
echo

if [ "$MODO" = "quitar" ]; then
  for P in $PUERTOS; do
    if [ $UFW_ACTIVO = 1 ]; then ufw delete deny "$P"/tcp 2>/dev/null | tail -1
    else iptables -D INPUT -p tcp --dport "$P" ! -i lo -j DROP 2>/dev/null; fi
  done
  [ $UFW_ACTIVO = 0 ] && { command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1; }
  echo "Abierto otra vez: $PUERTOS"
  exit 0
fi

for P in $PUERTOS; do
  if [ $UFW_ACTIVO = 1 ]; then
    ufw delete deny "$P"/tcp >/dev/null 2>&1   # idempotente
    ufw deny "$P"/tcp | tail -1
  else
    # idempotente: si ya existe, no la duplico
    iptables -C INPUT -p tcp --dport "$P" ! -i lo -j DROP 2>/dev/null \
      || iptables -I INPUT 1 -p tcp --dport "$P" ! -i lo -j DROP
    echo "  $P cerrado (iptables)"
  fi
done

if [ $UFW_ACTIVO = 1 ]; then
  ufw reload >/dev/null 2>&1
else
  if command -v netfilter-persistent >/dev/null; then
    netfilter-persistent save >/dev/null 2>&1 && echo "Reglas guardadas (sobreviven al reinicio)."
  else
    echo "AVISO: no hay netfilter-persistent: estas reglas se pierden al reiniciar."
    echo "       Para hacerlas permanentes: sudo apt install iptables-persistent"
  fi
fi

echo
echo "Comprobación (desde fuera deben dar timeout; desde aquí siguen bien):"
for P in $PUERTOS; do
  C=$(curl -s -o /dev/null -w '%{http_code}' -m 3 "http://127.0.0.1:$P/" 2>/dev/null || echo "-")
  echo "  localhost:$P → $C (local sigue respondiendo; fuera queda cerrado)"
done
echo
echo "Para reabrir:  sudo bash deployment/cortafuegos.sh quitar"
