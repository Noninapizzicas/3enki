#!/bin/bash
# normaliza-permisos.sh
# Normaliza permisos en módulos Enki para que www-data (grupo) pueda siempre escribir.
# Se ejecuta al deploy y como cron.
# Para módulos nuevos, para el repo, para el deploy.

set -e

TARGETS=(
  "/home/admin/3enki/modules"
  "/opt/enki/modules"
)

for target in "${TARGETS[@]}"; do
  if [ ! -d "$target" ]; then
    echo "⚠️  $target no existe, saltando"
    continue
  fi

  echo "=== Normalizando $target ==="

  # Directorios: rwxrwsr-x (2775)
  find "$target" \
    -type d \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    -exec chmod g+w {} +

  # Archivos: rw-rw-r-- (664)
  find "$target" \
    -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -perm -g+w \
    -exec chmod g+w {} +

  # Asegurar que el sticky bit de grupo está en los directorios
  find "$target" \
    -type d \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -perm -2000 \
    -exec chmod g+s {} + 2>/dev/null || true

  echo "  ✅ $target normalizado"
done

echo "🎉 Permisos normalizados — www-data puede escribir en todos los módulos"
