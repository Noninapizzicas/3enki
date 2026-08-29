#!/bin/bash
set -e

# 1. Copiar binario compilado
sudo cp /home/admin/3enki/enki-sense/target/release/motor-hermes /opt/enki/enki-sense/target/release/motor-hermes

# 2. Instalar unit nuevo (sin ProtectSystem/ProtectHome)
sudo cp /home/admin/3enki/deployment/systemd/motor-hermes.service /etc/systemd/system/motor-hermes.service
sudo systemctl daemon-reload

# 3. Token 644 para que admin lo lea
sudo chmod 644 /opt/enki/data/.hermes-bridge-token

# 4. Reiniciar
sudo systemctl restart motor-hermes

# 5. Verificar
echo "--- estado ---"
sudo systemctl is-active motor-hermes
sleep 2
curl -s http://localhost:8130/health
