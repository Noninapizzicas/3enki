#!/usr/bin/env python3
import json, re, sys

BASE = '/home/admin/3enki'
bp   = json.load(open(f'{BASE}/modules/ciclo-impresion/ciclo-impresion.blueprint.json'))
mod  = json.load(open(f'{BASE}/modules/ciclo-impresion/module.json'))
idx  = open(f'{BASE}/modules/ciclo-impresion/index.js').read()

def check(name, cond, detail=''):
    if not cond:
        print(f'FAIL: {name} {detail}'); sys.exit(1)
    print(f'PASS: {name} {detail}')

# 1. Solo onIniciarRequest como RPC (.request con handler)
req = sorted(set(re.findall(r'on(\w+)Request\s*\(', idx)))
check('único handler RPC = onIniciarRequest', req == ['Iniciar'], f'({req})')
rpc_subs = [s['event'] for s in mod['subscribes'] if '.request' in s['event']]
check('único subscribe .request = ciclo.iniciar.request', rpc_subs == ['ciclo.iniciar.request'], f'({rpc_subs})')

# 2. ui.ops solo 'iniciar', verificado contra handler real
check('ui.ops == [iniciar]', list(bp['ui']['ops']) == ['iniciar'])
check('iniciar tiene args project_id requerido',
      bp['ui']['ops']['iniciar']['args'][0]['nombre'] == 'project_id' and
      bp['ui']['ops']['iniciar']['args'][0]['required'] is True)

# 3. Confirmaciones honestas: handler null + transición real + canal
conf = bp['ui']['confirmaciones_contextuales']
check('confirmaciones: exactly 3 + _doc', list(conf.keys()) == ['_doc','pieza_retirada','filamento_cambiado','reanudar_ciclo'])
sub_events = {s['event'] for s in mod['subscribes']}
check('canal adaptador-confirmacion + onConfirmacionRecibida presentes',
      'adaptador-confirmacion.confirmacion_recibida' in sub_events and 'onConfirmacionRecibida' in idx)
for c in ['pieza_retirada', 'filamento_cambiado', 'reanudar_ciclo']:
    check(f'confirmacion {c}: handler null + transición real',
          conf[c].get('handler') is None and f'confirmacion:{c}' in idx, f'(estado_gatillo={conf[c]["estado_gatillo"]} -> {conf[c]["transicion_aplica"]})')

# 4. Sin ui.formas
check('sin ui.formas (F7 decide) en F6.5', 'formas' not in bp['ui'])

# 5. transporte.rpc solo iniciar
check('transporte.rpc == solo iniciar', bp['transporte']['rpc'] == ['ciclo.iniciar.request -> .response'])

# 6. Los 8 estados coinciden con ESTADOS de index.js (JS single-quoted, no JSON)
est = re.findall(r"'([A-Z_]+)'", re.search(r'ESTADOS\s*=\s*Object\.freeze\((.*?)\);', idx, re.S).group(1))
bp_est = [e['nombre'] for e in bp['ui']['estados']]
check('8 estados coinciden con ESTADOS de index.js', set(est) == set(bp_est), f'({len(est)} estados)')
for e in bp['ui']['estados']:
    check(f'estado {e["nombre"]}: color e icono', isinstance(e.get('color'), str) and isinstance(e.get('icono'), str))

# 7. transporte.salida = publishers reales de module.json
pub = {p['event'] for p in mod['publishes']}
check('salida = publishers reales', set(bp['transporte']['salida']) == pub,
      f'({len(bp["transporte"]["salida"])} eventos)')

# 8. Sincronizado con frontend (idéntico)
m = open(f'{BASE}/modules/ciclo-impresion/ciclo-impresion.blueprint.json').read()
f = open(f'{BASE}/frontend/src/lib/modules/ciclo-impresion/ciclo-impresion.blueprint.json').read()
check('frontend sincronizado (idéntico)', m == f)

# 9. JSON bien formado + longitud
check('JSON válido', isinstance(bp, dict) and len(json.dumps(bp)) > 800, f'({len(json.dumps(bp))} bytes)')

print('\nALL 9 CONSISTENCY CHECKS PASS ✓')
