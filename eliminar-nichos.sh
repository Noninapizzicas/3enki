#!/bin/bash
# Eliminar todo del proyecto Nichos Autónomos EXCEPTO la identidad F0 (2026-09-24)
# Generado por Hermes. Lo ejecuta Paco con sudo:  sudo ./eliminar-nichos.sh
# Reversible: respaldo total en /tmp/nichos_backup_20260924_002838/

set -e

REPO=/home/admin/3enki
DATA=/opt/enki/data/projects/nichos

echo "=== 1/2 Repo: eliminar módulos Nichos Autónomos ==="
for m in ojo memoria-nicho deliberador-nicho arnes-nicho gestor-credenciales-nicho; do
  if [ -d "$REPO/modules/$m" ]; then
    rm -rf "$REPO/modules/$m" && echo "  ✓ rm modules/$m"
  else
    echo "  - modules/$m (ya no existe)"
  fi
done

echo ""
echo "=== 2/2 Data: eliminar docs fases 2/3/3b/4 + piezas, CONSERVAR F0 ==="
# Subdirectorios completos a eliminar
for sub in _destilador estados; do
  if [ -e "$DATA/storage/$sub" ]; then rm -rf "$DATA/storage/$sub" && echo "  ✓ rm storage/$sub"; fi
done
# prisma (no es identidad)
if [ -d "$DATA/storage/prisma" ]; then rm -rf "$DATA/storage/prisma" && echo "  ✓ rm storage/prisma"; fi

# Documentos de fase2/3 por archivo
cd "$DATA/storage"
# proceso-negocio: borrar fase2-*, conservar fase0-*
rm -f proceso-negocio/fase2-pasada-1.json proceso-negocio/fase2-pasada-2.json proceso-negocio/fase2-cierre-diseccion.json
find proceso-negocio -maxdepth 1 -name 'fase2-*' -delete 2>/dev/null || true
# esquemas: borrar todo salvo nada (el esquema maetro es F2 -> se elimina)
rm -rf esquemas
# piezas 3D
rm -f *.scad *.stl
# _propiocepcion (interno, no identidad)
rm -rf _propiocepcion.json .versions/_propiocepcion.json
# conservar explícitamente F0
mkdir -p negocio proceso-negocio
touch negocio/.keep proceso-negocio/.keep

echo ""
echo "✓ Conservadas SOLO las fichas F0:"
ls -la "$DATA/storage/negocio/" "$DATA/storage/proceso-negocio/" 2>/dev/null | grep -iE "fase0|\.keep" || true

echo ""
echo "=== Verificación final (F0 presente, resto limpio) ==="
test -f "$DATA/storage/negocio/fase0-identidad.md" && echo "  ✓ fase0-identidad.md"
test -f "$DATA/storage/proceso-negocio/fase0-identidad-negocio.json" && echo "  ✓ fase0-identidad-negocio.json"
# asegurar que no queden archivos de esquemas/piezas
LEFT=$(find "$DATA/storage" -type f ! -name '*.keep' ! -path '*fase0*' ! -name '.*' 2>/dev/null | wc -l)
echo "  archivos no-F0 restantes en storage: $LEFT (debería ser 0)"

echo ""
echo "DONE. Backup en /tmp/nichos_backup_20260924_002838/"
