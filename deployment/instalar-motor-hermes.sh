#!/bin/bash
set -e

# Instala motor-hermes desde el repo: compila a /usr/local/bin (como los otros 7
# motores de enki-sense) y recarga el servicio.
#
# Antes copiaba el binario a /opt/enki/enki-sense/target/release, que es un
# directorio de BUILD: al limpiar el árbol el ejecutable desaparecía y el
# servicio entraba en bucle 203/EXEC. /usr/local/bin no lo toca ningún rsync.

REPO=/home/admin/3enki

# 1. Compilar e instalar en /usr/local/bin
cd "${REPO}/enki-sense"
cargo install --force --path crates/motor-hermes --root /usr/local --locked

# 2. Instalar la unit (sin ProtectSystem/ProtectHome)
sudo cp "${REPO}/deployment/systemd/motor-hermes.service" /etc/systemd/system/motor-hermes.service
sudo systemctl daemon-reload
sudo systemctl enable motor-hermes > /dev/null 2>&1

# 3. Token 644 para que admin lo lea
sudo chmod 644 /opt/enki/data/.hermes-bridge-token 2>/dev/null || true

# 4. Reiniciar
sudo systemctl restart motor-hermes

# 5. Verificar
echo "--- estado ---"
sudo systemctl is-active motor-hermes
sleep 2
curl -s http://localhost:8130/health || echo "(sin respuesta en /health)"
echo

# NOTA: el deploy normal ya hace todo esto — deployment/vps-setup.sh compila
# motor-hermes junto a los otros motores. Este script es para reinstalarlo a mano.
