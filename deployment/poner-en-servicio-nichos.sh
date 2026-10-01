#!/bin/bash
# Poner en servicio la vertical nichos — bloque sudo (paso 2: declarar + scheduler)
# Lo ejecuta Paco. Idempotente: se puede correr varias veces sin romper nada.
set -euo pipefail

VERT=nichos
REPO=/home/admin/3enki
DEPLOY=/opt/enki

echo "=== [1/3] declarar 44 módulos en config.json (deploy + repo) en orden de espina ==="
python3 - <<PY
import json, os
V='$VERT'
DEPLOY='$DEPLOY'
REPO='$REPO'
orden = json.load(open(f'{DEPLOY}/boveda/{V}/proceso/estado.json'))['fase4']['tracking']['orden']
# depurar: solo los slugs que existen en disco
orden = [s for s in orden if os.path.isdir(f'{DEPLOY}/modules/{V}/{s}')]
for cfg in (f'{DEPLOY}/config.json', f'{REPO}/config.json'):
    c = json.load(open(cfg))
    en = c['modules']['enabled']
    en = [s for s in en if s not in set(orden)]        # idempotente: sin duplicados
    en += orden                                        # al final, en orden de espina
    c['modules']['enabled'] = en
    with open(cfg,'w') as f:
        json.dump(c, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'  {cfg}: {len([s for s in orden if s in en])} nichos declarados')
PY

echo ""
echo "=== [2/3] job del scheduler (trigger event sobre el ciclo) ==="
python3 - <<PY
import json
p = f'{DEPLOY}/data/scheduler/jobs.json'
d = json.load(open(p))
nombres = {j.get('name') for j in d.get('jobs', [])}
if 'nichos-ciclo' not in nombres:
    d['jobs'].append({
        'name': 'nichos-ciclo',
        'trigger': {'type': 'event', 'topic': 'nichos.pipeline.ciclo_iniciado'},
        'action': {'type': 'publish', 'topic': 'nichos.pipeline.avanzado'},
        'enabled': True
    })
    d['savedAt'] = __import__('datetime').datetime.utcnow().isoformat() + 'Z'
    json.dump(d, open(p,'w'), indent=2, ensure_ascii=False)
    print(f'  job "nichos-ciclo" creado → {p}')
else:
    print('  job "nichos-ciclo" ya existe (no se duplica)')
PY

echo ""
echo "=== [3/3] reiniciar enki (reindexa cosecha + recarga config) ==="
systemctl restart enki
echo "  reiniciado. Esperando 5s…"
sleep 5
echo "  estado: $(systemctl is-active enki)"
