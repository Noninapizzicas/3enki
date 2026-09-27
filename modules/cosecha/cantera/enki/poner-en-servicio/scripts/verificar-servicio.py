#!/usr/bin/env python3
"""
Sonda determinista de PUESTA EN SERVICIO de una vertical de Enki.

Responde, sin fiarse de reportes ni de la config, a las 5 preguntas del cierre:
  1) ¿están TODOS los módulos del vertical declarados en config.json (deploy Y repo)?
  2) ¿tiene cada hoja module.json + index.js en el deploy y espejo en el repo?
  3) ¿tiene cada hoja SKILL.md en la cantera?
  4) ¿hay job en el scheduler que dispare el ciclo? (jobs.json vacío = pipeline quieto)
  5) ¿hay storage persistido de la vertical? (no existe hasta el primer ciclo: NO es fallo)

Uso:
    python3 verificar-servicio.py <vertical>            # p.ej. nichos
    python3 verificar-servicio.py <vertical> --json

Exit code 0 si los 3 primeros bloques están completos; 1 si falta algo (jobs/storage
se reportan pero NO hacen fallar: pueden estar legítimamente vacíos antes del arranque).
"""
import json
import os
import sys

DEPLOY = '/opt/enki'
REPO = '/home/admin/3enki'
CANTERA = os.path.join(DEPLOY, 'modules', 'cosecha', 'cantera', 'enki')
CONFIGS = (os.path.join(DEPLOY, 'config.json'), os.path.join(REPO, 'config.json'))
JOBS = os.path.join(DEPLOY, 'data', 'scheduler', 'jobs.json')


def _leer_json(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception as exc:                     # noqa: BLE001 — sonda, degrada honesto
        return {'_error': str(exc)}


def sondear(vertical):
    r = {'vertical': vertical}

    base = os.path.join(DEPLOY, 'modules', vertical)
    if not os.path.isdir(base):
        r['error'] = f'no existe el vertical en el deploy: {base}'
        return r
    slugs = sorted(
        s for s in os.listdir(base)
        if os.path.isfile(os.path.join(base, s, 'module.json'))
    )
    r['slugs_total'] = len(slugs)

    # 1) declarados en enabled, en LOS DOS configs (deploy + repo)
    r['declarados'] = {}
    for cfg in CONFIGS:
        c = _leer_json(cfg)
        enabled = set((c.get('modules') or {}).get('enabled') or [])
        faltan = [s for s in slugs if s not in enabled]
        r['declarados'][cfg] = {'declarados': len(slugs) - len(faltan),
                                'total': len(slugs), 'faltan': faltan}

    # 2) y 3) ficheros por hoja (deploy + espejo repo + skill en cantera)
    incompletos = {}
    con_interfaz = {}
    for s in slugs:
        falta = []
        for f in ('module.json', 'index.js'):
            if not os.path.isfile(os.path.join(base, s, f)):
                falta.append(f)
        if not os.path.isdir(os.path.join(REPO, 'modules', vertical, s)):
            falta.append('espejo_repo')
        if not os.path.isfile(os.path.join(CANTERA, s, 'SKILL.md')):
            falta.append('SKILL.md_cantera')
        if falta:
            incompletos[s] = falta
        m = _leer_json(os.path.join(base, s, 'module.json'))
        if m.get('ui_handlers'):
            con_interfaz[s] = [h.get('type') for h in m['ui_handlers']]
    r['incompletos'] = incompletos
    r['con_interfaz'] = con_interfaz

    # 4) jobs del scheduler
    j = _leer_json(JOBS)
    r['jobs'] = {'total': len(j.get('jobs') or []), 'error': j.get('_error'),
                 'nombres': [x.get('name') for x in (j.get('jobs') or [])]}

    # 5) storage persistido de la vertical (puede no existir todavía)
    prisma = os.path.join(DEPLOY, 'storage', 'prisma', vertical)
    r['storage_prisma'] = sorted(os.listdir(prisma)) if os.path.isdir(prisma) else None

    r['listo_para_operar'] = (not incompletos
                              and all(v['faltan'] == [] for v in r['declarados'].values())
                              and r['jobs']['total'] > 0)
    return r


def imprimir(r):
    if r.get('error'):
        print('ERROR:', r['error'])
        return
    v = r['vertical']
    print(f'=== puesta en servicio · vertical {v} ===')
    print(f'hojas con module.json: {r["slugs_total"]}')
    for cfg, d in r['declarados'].items():
        marca = 'OK ' if not d['faltan'] else 'FALTA'
        print(f'  [{marca}] declarados en {cfg}: {d["declarados"]}/{d["total"]}')
        if d['faltan']:
            print(f'         sin declarar: {", ".join(d["faltan"][:8])}'
                  + (' …' if len(d['faltan']) > 8 else ''))
    if r['incompletos']:
        print('  [FALTA] hojas incompletas:')
        for s, falta in r['incompletos'].items():
            print(f'         {s}: {", ".join(falta)}')
    else:
        print('  [OK ] todas las hojas: module.json + index.js + espejo repo + SKILL.md')
    if r['con_interfaz']:
        print(f'  con interfaz ({len(r["con_interfaz"])}): '
              + ', '.join(f'{k}={",".join(x)}' for k, x in r['con_interfaz'].items()))
    j = r['jobs']
    print(f'  [{"OK " if j["total"] else "AVISO"}] jobs del scheduler: {j["total"]}'
          + (f' → {j["nombres"]}' if j['nombres'] else ' (vacío = nadie dispara el ciclo)'))
    print(f'  [info] storage prisma/{v}: '
          + (', '.join(r['storage_prisma']) if r['storage_prisma']
             else 'no existe todavía (se crea al primer ciclo, no es fallo)'))
    print('LISTO PARA OPERAR' if r['listo_para_operar']
          else 'NO listo: faltan declaración, hojas o job')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 2
    r = sondear(args[0])
    if '--json' in sys.argv:
        print(json.dumps(r, indent=2, ensure_ascii=False))
    else:
        imprimir(r)
    if r.get('error'):
        return 2
    return 0 if r['listo_para_operar'] else 1


if __name__ == '__main__':
    sys.exit(main())
