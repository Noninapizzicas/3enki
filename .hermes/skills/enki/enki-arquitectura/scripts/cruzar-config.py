#!/usr/bin/env python3
"""Cruce config.json vs directorios reales de modules/ en Enki.

El ModuleLoader carga TODO lo que tenga module.json; config.json modules.enabled
solo ORDENA y modules.disabled FILTRA. El loader identifica por nombre de
DIRECTORIO (no manifest.name). Este script audita el desajuste:

  - fantasmas en enabled  (nombres sin directorio: no rompen, mienten)
  - fantasmas en disabled (idem)
  - huérfanos sin declarar (se cargan igual, pero sin orden ni intención)
  - POCs con manifest.name duplicado del real (doble suscripción de eventos)

Uso:
  python3 cruzar-config.py [ruta-repo]
  (default: ~/3enki)
"""
import os, json, sys
from collections import defaultdict

ROOT = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/3enki')
cfg = json.load(open(os.path.join(ROOT, 'config.json')))
enabled = set(cfg['modules'].get('enabled', []))
disabled = set(cfg['modules'].get('disabled', []))

# 1. Directorios con module.json (el loader usa el nombre del DIRECTORIO)
dirs_with_manifest = set()
manifest_names = {}      # dir_name -> manifest.name
manifest_subscribes = defaultdict(list)  # dir_name -> eventos que escucha
for base, dirs, files in os.walk(os.path.join(ROOT, 'modules')):
    if 'module.json' in files:
        d = os.path.basename(base)
        dirs_with_manifest.add(d)
        try:
            mj = json.load(open(os.path.join(base, 'module.json')))
            manifest_names[d] = mj.get('name')
            for s in mj.get('subscribes', []):
                manifest_subscribes[d].append(s.get('event'))
        except Exception:
            pass
    # no bajar a node_modules ni a carpetas ocultas
    dirs[:] = [x for x in dirs if not x.startswith('.') and x != 'node_modules']

print(f"Directorios reales con module.json: {len(dirs_with_manifest)}")
print(f"enabled: {len(enabled)} | disabled: {len(disabled)}")

print("\n--- ENABLED sin directorio (fantasmas) ---")
ghosts_en = sorted(enabled - dirs_with_manifest)
print('  ✓ limpio' if not ghosts_en else '\n'.join(f'  {g}' for g in ghosts_en))

print("\n--- DISABLED sin directorio (fantasmas) ---")
ghosts_dis = sorted(disabled - dirs_with_manifest)
print('  ✓ limpio' if not ghosts_dis else '\n'.join(f'  {g}' for g in ghosts_dis))

print("\n--- Módulos reales SIN declarar (huérfanos: se cargan igual) ---")
orphans = sorted(dirs_with_manifest - enabled - disabled)
print('  ✓ todos declarados' if not orphans else '\n'.join(f'  {o}' for o in orphans))

print("\n--- POCs / name duplicado (manifest.name == otro dir) ---")
names_by_dir = {}
for d in dirs_with_manifest:
    n = manifest_names.get(d)
    if n:
        names_by_dir.setdefault(n, []).append(d)
for n, dirs_ in sorted(names_by_dir.items()):
    if len(dirs_) > 1 and any('poc' in d for d in dirs_):
        print(f"  '{n}' en: {', '.join(dirs_)}  <-- verificar doble suscripción")
        for d in dirs_:
            evs = [e for e in manifest_subscribes[d] if e and 'response' not in e]
            if evs:
                print(f"      {d} escucha: {', '.join(evs[:6])}")
