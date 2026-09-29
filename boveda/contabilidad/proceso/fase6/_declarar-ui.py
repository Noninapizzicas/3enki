#!/usr/bin/env python3
"""
F6/F7 — Declara ui_handlers (type + zone) en los module.json de la vertical CONTABILIDAD.

DECISIÓN APLICADA: A · cuatro zonas por rol (documentada en fase6/decision-interfaz.md)
  workspace_module (barra_modulos)      -> el humano TRABAJA aquí a diario (libro, fiscal, entrada)
  system_panel     (lateral_derecha)    -> se CONSULTA/CONFIGURA cuando algo falla o al montar
  chat_tool        (barra_chat_inferior)-> se DISPARA como acción puntual
  inline_render    (area_chat)          -> APARECE en la conversación
  sin ui_handlers                       -> su cara ES el bus (puente/observador puro)

POR QUÉ A: el frontend.contract.json descarta explícitamente las pestañas que cambian
de contexto ("no hay tabs que abren ventanas separadas", "el chat es el eje"). La
opción C (cara única con pestañas) rompería el frame canónico. Y la B pierde la
separación entre "mi trabajo" y "la configuración del sistema" que el asesor necesita.
"""
import json, os, re

BASE = '/home/admin/3enki-contabilidad'
MODS = f'{BASE}/modules/contabilidad'

# ── DECISIÓN EXPLÍCITA por módulo (auditable, no regex ciega) ──
W = 'workspace_module'   # mesa de trabajo
S = 'system_panel'       # control/configuración
C = 'chat_tool'          # acción puntual
I = 'inline_render'      # aparece en el chat
N = None                 # sin superficie: su cara es el bus

ZONA = {W: 'barra_modulos', S: 'lateral_derecha', C: 'barra_chat_inferior', I: 'area_chat'}

DECISION = {
  # ── EL LIBRO Y LA MESA DE TRABAJO ──
  'catalogo-cuentas': W, 'escritor-diario': W, 'mayor-balanza': W, 'traza-asiento': W,
  'asiento-ajuste': W, 'periodificacion': W, 'conciliacion-bancaria': W,
  'regla-contrapartida': W,
  'cuenta-terceros': W, 'maestro-terceros': W, 'maestro-cuentas-bancarias': W,
  'regla-movimiento-bancario': W, 'compra-proveedor': W, 'expediente-documental': W,
  'normalizador-hecho': W, 'cola-revision': W,
  # ── FISCAL Y FACTURACIÓN (la mesa del asesor) ──
  'perfil-administrativo': W, 'liquidacion-iva': W, 'registro-verifactu': W,
  'calendario-fiscal': W, 'estado-presentacion-fiscal': W, 'rectificacion-declaracion': W,
  'generador-modelo': W, 'acuse-presentacion': W, 'inmovilizado': W, 'recibo-nomina': W,
  'puerto-nomina': W, 'acceso-nomina': W, 'emision-factura-venta': W,
  'factura-electronica': W, 'cierre-ejercicio': W, 'estados-contables': W,
  'valoracion-existencia': W, 'retenciones-is-irpf': W, 'frontera-ficha-producto': W,
  'aislamiento-negocio': W,
  # ── CONTROL Y CONFIGURACIÓN ──
  'panel-proceso-contable': S, 'completitud-cobertura': S, 'contrato-hecho-minimo': S,
  'anclaje-cierre-vertical': S, 'cola-declaraciones-criterio': S, 'single-writer': S,
  'frontera-planos': S, 'clave-natural': S, 'deduplicacion-hecho': S,
  'aviso-cuadre': S, 'motor-avisos': S, 'onboarding-negocio': S,
  'consolidacion-grupo': S, 'etiquetado-analitico': S, 'partida-no-identificada': S,
  'desatasco-entrada': S, 'resolucion-contrapartida': S, 'historial-proceso-contable': S,
  # ── ACCIÓN PUNTUAL DESDE EL CHAT ──
  'consulta-dueno': C, 'puente-lenguaje-dueno': C, 'informe-accionable': C,
  # ── APARECE EN EL CHAT ──
  'informe-rico': I, 'cuadro-mando-contable': I, 'aviso-al-negocio': I,
  'vista-revisable': I, 'saldo-tesoreria': I, 'margen-analitico': I,
  'presupuesto': I,
  # ── SIN SUPERFICIE: su cara es el bus ──
  'aviso-revision': N, 'declaracion-fuente-faltante': N, 'ratificacion-regla-aprendida': N,
  'flujo-firma': N, 'hecho-rectificativo': N, 'lote-admision': N,
  'puerto-evento-vertical': N, 'puerto-extracto': N,
}

def accion_de(event):
    """<dominio>.<accion>.request -> 'accion' (sin el dominio contabilidad)."""
    e = event[:-len('.request')]
    return e.split('.', 1)[1] if '.' in e else e

def handler_de(event):
    """Deriva el nombre del handler desde el evento (el module.json ya lo trae)."""
    return None

total = {'workspace_module':0,'system_panel':0,'chat_tool':0,'inline_render':0,'sin_superficie':0}
faltan = []
for slug in sorted(os.listdir(MODS)):
    p = f'{MODS}/{slug}/module.json'
    m = json.load(open(p))
    tipo = DECISION.get(slug, 'NO-DECIDIDO')
    if tipo == 'NO-DECIDIDO':
        faltan.append(slug); continue

    reqs = [x for x in m.get('subscribes', []) if x.get('event','').endswith('.request')]

    if tipo is None:
        # sin superficie: se ELIMINA ui_handlers si lo hubiera
        m.pop('ui_handlers', None)
        total['sin_superficie'] += 1
    else:
        ui = []
        for r in reqs:
            ui.append({
                "domain": "contabilidad",
                "action": f"{slug}.{accion_de(r['event'])}",
                "handler": r.get('handler'),
                "type": tipo,
                "zone": ZONA[tipo],
            })
        if ui:
            m['ui_handlers'] = ui
        else:
            m.pop('ui_handlers', None)
        total[tipo] = total.get(tipo, 0) + 1

    m = {k: m[k] for k in m}  # no-op para mantener orden
    json.dump(m, open(p, 'w'), ensure_ascii=False, indent=2)

print("=== DECISIÓN A aplicada a los 72 ===")
for k, v in total.items():
    print(f"  {k:<20} {v}")
print(f"  {'TOTAL':<20} {sum(total.values())}")
if faltan: print(f"\n  ⚠️ SIN DECIDIR: {faltan}")
