#!/bin/bash
# Watchdog de un tiro: si el supervisor de WhatsApp no esta vivo, lo levanta.
#
# Pensado para el cron de Hermes (cada 2 minutos, sin agente). Hermes corre como
# hermes-gateway.service, que SI arranca con la maquina; por eso este latido
# devuelve el servicio solo, sin root, tras un reinicio del servidor.
#
# Silencio = todo bien (nada en stdout = nada que contar).
# Habla solo cuando ha tenido que intervenir, y dice que hizo.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
PIDFILE=$DIR/servicio.pid
WDLOG=$DIR/watchdog.log

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [watchdog] $*" >> "$WDLOG"; }

vivo() {
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null) || return 1
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

if vivo; then exit 0; fi

cd "$DIR" || exit 1
setsid ./servicio.sh </dev/null >> "$DIR/servicio.out" 2>&1 &
sleep 4

if vivo; then
  log "supervisor levantado pid=$(cat "$PIDFILE")"
  echo "WhatsApp se habia quedado sin vigilante (reinicio del servidor o caida). Lo he levantado: pid $(cat "$PIDFILE"), $(date -u +%H:%M) UTC."
else
  log "FALLO: el supervisor no arranca"
  echo "AVISO: el servicio de WhatsApp no arranca. Revisa $DIR/servicio.out"
fi
