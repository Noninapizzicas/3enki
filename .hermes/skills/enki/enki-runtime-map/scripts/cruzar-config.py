#!/usr/bin/env python3
"""Auditoría del ModuleLoader de Enki: cruza config.json enabled/disabled contra los
directorios reales de modules/. Detecta:
  - FANTASMAS: declarado en enabled/disabled pero sin directorio (miente sobre el sistema)
  - HUÉRFANOS: existe module.json pero sin declarar → SE CARGA IGUAL (por defecto)

Uso:  python3 cruzar-config.py [--repo /path/to/3enki]
Nota: el loader filtra por nombre de DIRECTORIO (entry.name), no por manifest.name.
"""
import os, json, sys

ROOT = sys.argv[sys.argv.index('--repo') + 1] if '--repo' in sys.argv else os.path.expanduser('~/3enki')
MODULES_DIR = os.path.join(ROOT, 'modules')

# Directorios reales con module.json (el loader usa entry.name)
dirs = {}
for root, dnames, files in os.walk(MODULES_DIR):
    if 'node_modules' in root or '_archived' in root or '_legacy' in root or root.endswith('_template'):
        continue
    if 'module.json' in files:
        rel = os.path.relpath(root, MODULES_DIR)
        parts = rel.split(os.sep)
        name = parts[0] if len(parts) == 1 else parts[-1]
        try:
            m = json.load(open(os.path.join(root, 'module.json')))
            v = m.get('version', '?')
        except Exception:
            v = '?'
        dirs[name] = {'path': rel, 'version': v}

cfg = json.load(open(os.path.join(ROOT, 'config.json')))
enabled = cfg.get('modules', {}).get('enabled', [])
disabled = cfg.get('modules', {}).get('disabled', [])

print(f"Directorios reales con module.json: {len(dirs)}")
print(f"enabled: {len(enabled)} | disabled: {len(disabled)}")

fant_en = [e for e in enabled if e not in dirs]
fant_dis = [d for d in disabled if d not in dirs]
declared = set(enabled) | set(disabled)
orphans = {k: v for k, v in dirs.items() if k not in declared}

print("\n--- ENABLED sin directorio (fantasmas) ---")
for e in fant_en: print(f"  ❌ {e}")
if not fant_en: print("  ✓ limpio")

print("\n--- DISABLED sin directorio ---")
for d in fant_dis: print(f"  ⚠️ {d}")
if not fant_dis: print("  ✓ limpio")

print(f"\n--- HUÉRFANOS (existen, se cargan igual, sin declarar): {len(orphans)} ---")
for name, info in sorted(orphans.items()):
    print(f"  🔸 {name:40} v{info['version']:6} {info['path']}")

if fant_en or fant_dis:
    print("\n⚠️ Hay fantasmas en config.json — limpiar")
elif orphans:
    print(f"\n⚠️ {len(orphans)} huérfanos — declararlos en enabled (regla del reloj suizo)")
else:
    print("\n✓ Config sincronizado con directorios")
