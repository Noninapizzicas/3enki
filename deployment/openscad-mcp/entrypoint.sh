#!/bin/sh
# Entrypoint de openscad-mcp: arranca Xvfb en background (OpenSCAD necesita
# display para renderizar) y luego el servidor MCP en primer plano.
# NO usa xvfb-run (que como PID1 no mantiene el proceso python vivo).
set -e

# Arrancar Xvfb en background si no hay display
if [ -z "${DISPLAY:-}" ]; then
  echo "[entrypoint] arrancando Xvfb :99 en background"
  Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
  export DISPLAY=:99
  sleep 1
fi

echo "[entrypoint] lanzando OpenSCAD MCP server (transport=${MCP_TRANSPORT:-http})"
exec python -m openscad_mcp
