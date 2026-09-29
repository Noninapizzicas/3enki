#!/usr/bin/env node
/**
 * decidir-interfaz-contabilidad.js — FASE 6 para la vertical CONTABILIDAD.
 *
 * POR QUÉ EXISTE (falso negativo cazado con evidencia):
 *   El script canónico `decidir-interfaz.js` decide por **tools** del module.json.
 *   La vertical contabilidad es event-driven PURA: los 116 módulos tienen
 *   **CERO tools** y **116/116 exponen su superficie como RPCs** (`*.request`).
 *   Resultado del canónico: `necesita_interfaz:false, rol:'puente-interno'`
 *   para los 116 → FALSO NEGATIVO en bloque.
 *   Aquí la señal de "superficie humana" son los RPCs, no los tools.
 *
 * SEÑALES (deterministas, sin LLM):
 *   necesita_interfaz = false  si el módulo es:
 *     - PUENTE/CONVERSOR puro (sin RPC de operación humana) → su cara es el bus
 *   necesita_interfaz = true   si expone RPCs que un humano opera o consulta.
 *
 * TIPO por ROL (la prueba de fuego de decidir-interfaz §2c):
 *   ¿entra a trabajar a diario?      → workspace_module  (barra_modulos)
 *   ¿lo consulta cuando algo falla?  → system_panel      (lateral_derecha)
 *   ¿lo dispara como acción puntual? → chat_tool         (barra_chat_inferior)
 *   ¿lo ve aparecer en la conversación? → inline_render  (area_chat)
 *
 * Uso: node scripts/decidir-interfaz-contabilidad.js [--json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const VERTICALES = ['contabilidad-entrada', 'contabilidad-libro', 'contabilidad-fiscal', 'contabilidad-analitica'];
const ZONA = {
  workspace_module: 'barra_modulos',
  system_panel: 'lateral_derecha',
  chat_tool: 'barra_chat_inferior',
  inline_render: 'area_chat',
};

// ── LA DECISIÓN (explícita, por módulo, auditable) ──
// W = el humano TRABAJA aquí a diario (mesa de trabajo)
// S = se CONSULTA/CONFIGURA (control)
// C = se DISPARA como acción puntual desde el chat
// I = APARECE en la conversación
// N = SIN superficie: su cara es el bus (puente/observador puro)
const W = 'workspace_module', S = 'system_panel', C = 'chat_tool', I = 'inline_render', N = null;
const DECISION = {
  // ── EL LIBRO Y LA MESA DE TRABAJO ──
  'catalogo-cuentas': W, 'escritor-diario': W, 'mayor-balanza': W, 'traza-asiento': W,
  'asiento-ajuste': W, 'periodificacion': W, 'conciliacion-bancaria': W,
  'cuenta-terceros': W, 'maestro-terceros': W, 'maestro-cuentas-bancarias': W,
  'regla-movimiento-bancario': W, 'compra-proveedor': W, 'expediente-documental': W,
  'normalizador-hecho': W, 'cola-revision': W, 'regla-contrapartida': W,
  // ── FISCAL Y FACTURACIÓN (la mesa del asesor) ──
  'perfil-administrativo': W, 'liquidacion-iva': W, 'registro-verifactu': W,
  'calendario-fiscal': W, 'estado-presentacion-fiscal': W, 'rectificacion-declaracion': W,
  'generador-modelo': W, 'acuse-presentacion': W, 'inmovilizado': W, 'recibo-nomina': W,
  'puerto-nomina': W, 'acceso-nomina': W, 'emision-factura-venta': W,
  'factura-electronica': W, 'cierre-ejercicio': W, 'estados-contables': W,
  'valoracion-existencia': W, 'retenciones-is-irpf': W, 'frontera-ficha-producto': W,
  'aislamiento-negocio': W,
  // ── CONTROL Y CONFIGURACIÓN ──
  'panel-proceso-contable': S, 'completitud-cobertura': S, 'contrato-hecho-minimo': S,
  'anclaje-cierre-vertical': S, 'cola-declaraciones-criterio': S, 'single-writer': S,
  'frontera-planos': S, 'clave-natural': S, 'deduplicacion-hecho': S,
  'aviso-cuadre': S, 'motor-avisos': S, 'onboarding-negocio': S,
  'consolidacion-grupo': S, 'etiquetado-analitico': S, 'partida-no-identificada': S,
  'desatasco-entrada': S, 'resolucion-contrapartida': S, 'historial-proceso-contable': S,
  // ── ACCIÓN PUNTUAL DESDE EL CHAT ──
  'consulta-dueno': C, 'puente-lenguaje-dueno': C, 'informe-accionable': C,
  'consulta-cuentas-bajo-demanda': C, 'puerto-exportacion': C, 'puerto-plan-contable': C,
  // ── APARECE EN EL CHAT ──
  'informe-rico': I, 'cuadro-mando-contable': I, 'aviso-al-negocio': I,
  'vista-revisable': I, 'saldo-tesoreria': I, 'margen-analitico': I,
  'presupuesto': I, 'narrador-estados': I, 'marca-borrador-validado': I,
  'desviacion': I, 'comparador-periodos': I, 'tablero-margen-dimension': I,
  'coste-indirecto': I,
  // ── SIN SUPERFICIE: su cara es el bus ──
  'aviso-revision': N, 'declaracion-fuente-faltante': N, 'ratificacion-regla-aprendida': N,
  'flujo-firma': N, 'hecho-rectificativo': N, 'lote-admision': N,
  'puerto-evento-vertical': N, 'puerto-extracto': N,
  // ── COMPLETADO tras leer la FORMA real de los 53 restantes (por rol) ──
  // entrada de documentos y terceros (la mesa del asesor, a diario)
  'captura-documento': W, 'control-cuadre-documento': W, 'puerto-documento': W,
  'padron-terceros': W,
  // cuentas de proveedor y cotejos (trabajo diario)
  'cuenta-proveedor': W, 'estado-cuenta-proveedor': W, 'cruce-factura-recepcion': W,
  'rappel-pronto-pago': W, 'antiguedad-de-saldos': W, 'vencimiento-pago': W,
  'cuadre-cobro-pago': W, 'partida-conciliatoria': W, 'informe-conciliacion': W,
  'prevision-caja': W,
  // personal y nómina (mesa del asesor)
  'asiento-personal': W, 'lineas-nomina': W, 'obligacion-seguridad-social': W,
  'pagos-a-cuenta-empleado': W, 'liquidacion-baja-empleado': W, 'conceptos-extra-nomina': W,
  // fiscal y modelos (mesa del asesor)
  'modelo-303': W, 'modelo-390': W, 'retenciones': W, 'estimacion-is-irpf': W,
  // inmovilizado (trabajo sobre el bien)
  'alta-activo': W, 'plan-amortizacion': W, 'baja-activo': W,
  // estados contables (los documentos del cierre)
  'balance-situacion': W, 'cuenta-resultados': W, 'apertura-ejercicio': W,
  'cambio-desde-ultima-revision': W, 'factura-rectificativa': W, 'consolidacion': W,
  // control y observabilidad (se consultan)
  'tasa-cobertura-entrada': S, 'sello-cobertura': S, 'control-calidad-muestreo': S,
  'contrapartida-asistida': S, 'encolado-excepcion': S, 'valor-neto-contable': S,
  'variacion-stock-valorada': S, 'ajuste-inventario': S, 'eliminacion-intercompany': S,
  'marca-sociedad': S, 'activacion-vertical': S,
};

// los 116 reales (los nombres difieren de la primera propuesta en varios)
const NOMBRES = {
  'maestro-terceros':'maestro-terceros','padron-terceros':'padron-terceros',
  'captura-documento':'captura-documento','puerto-documento':'puerto-documento',
  'control-cuadre-documento':'control-cuadre-documento',
};

function clasificar(man, slug) {
  const reqs = (man.subscribes || []).filter(s => (s.event || '').endsWith('.request'));
  const accionesHumanas = reqs.filter(s => {
    const ev = s.event;
    // los .response no son superficie humana; los wildcards de proyecto tampoco
    if (ev.includes('project.') || ev.includes('vertical.')) return false;
    return true;
  });
  const tipo = DECISION[slug] === undefined ? 'NO-DECIDIDO' : DECISION[slug];
  return { reqs, accionesHumanas, tipo };
}

function main() {
  const asJson = process.argv.includes('--json');
  const out = [];
  for (const v of VERTICALES) {
    const dir = path.join('modules', v);
    if (!fs.existsSync(dir)) continue;
    for (const slug of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, slug, 'module.json');
      if (!fs.existsSync(p)) continue;
      const man = JSON.parse(fs.readFileSync(p, 'utf8'));
      const { reqs, accionesHumanas, tipo } = clasificar(man, slug);
      out.push({
        slug, vertical: v,
        necesita_interfaz: tipo !== null && tipo !== 'NO-DECIDIDO',
        tipo,
        zona: tipo ? ZONA[tipo] : null,
        rpcs_humanos: accionesHumanas.length,
        rpcs_total: reqs.length,
        tools: (man.tools || []).length,
        drift: (man.ui_handlers || []).length > 0 && !(man.ui_handlers || []).every(h => h.type && h.zone),
      });
    }
  }
  if (asJson) { console.log(JSON.stringify(out, null, 2)); return; }
  const porTipo = {};
  for (const o of out) { const k = o.tipo || 'sin_superficie'; porTipo[k] = (porTipo[k] || 0) + 1; }
  console.log('=== F6 · DECISIÓN DE INTERFAZ — contabilidad (' + out.length + ' módulos) ===\n');
  for (const [k, n] of Object.entries(porTipo)) console.log('  ' + k.padEnd(20) + n);
  const sinDecidir = out.filter(o => o.tipo === 'NO-DECIDIDO');
  if (sinDecidir.length) console.log('\n  ⚠️ SIN DECIDIR: ' + sinDecidir.map(o => o.slug).join(', '));
}

main();
module.exports = { DECISION, ZONA };
