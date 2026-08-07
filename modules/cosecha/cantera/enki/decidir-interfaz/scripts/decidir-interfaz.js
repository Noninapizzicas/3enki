#!/usr/bin/env node
/**
 * decidir-interfaz.js — script determinista de la FASE 6.
 *
 * Aplica el patrón de decisión de interfaz a los module.json por SEÑALES
 * (tools, eventos, rol), sin LLM. El LLM de la skill solo añade el contexto
 * de rol que el script no puede ver; la decisión de fondo es esta.
 *
 * Uso:
 *   node decidir-interfaz.js --module <slug>          # audita UN módulo
 *   node decidir-interfaz.js --all                    # audita todos los del repo
 *   node decidir-interfaz.js --module <slug> --json   # salida JSON (para gate)
 *
 * Salida por módulo:
 *   { slug, necesita_interfaz, tipo_sugerido|null, rol, razon,
 *     handlers_actuales, acciones_ui }
 */

'use strict';

const fs = require('fs');
const path = require('path');

// scripts → decidir-interfaz → enki → cantera → cosecha → modules (5 niveles)
const MODULES_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..'); // <repo>/modules
const TYPES = ['workspace_module', 'chat_tool', 'inline_render', 'system_panel'];

// ── Señales léxicas sobre nombres de tools (el patrón de la skill) ──
const RX_LECTURA = /(list|get|read|view|status|estado|dashboard|historial|history|metrics|search|leer|listar|obtener|ver|show|stats|health)/i;
const RX_ESCRITURA = /(create|update|delete|set|save|write|edit|add|remove|start|stop|build|send|emitir|aprobar|rechazar|enviar|guardar|registrar|publicar|preparar|cobrar|confirm|cancel|complete|assign|reorder)/i;

// Dominios de negocio: área de trabajo diaria → workspace_module
const DOMINIO_NEGOCIO = /(producto|pedido|cuenta|cobro|cocina|comandero|ingrediente|categoria|variacion|factura|tarifa|carta|impresion|contenido|menu|inventario|receta|insumo|escandallo)/i;
// Operación puntual disparada desde el chat → chat_tool
const OPERACION_PUNTUAL = /(motor|generador|gateway|pago|trazo|verificador|media|traduc|oido|ojo|sonido)/i;

// Módulos anidados: el slug puede vivir en modules/<slug>/ o en un
// subdirectorio (modules/pizzepos/<slug>/). Resolvemos por búsqueda.
function findManifestDir(slug) {
  const direct = path.join(MODULES_DIR, slug, 'module.json');
  if (fs.existsSync(direct)) return path.join(MODULES_DIR, slug);
  const found = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          if (name === slug && fs.existsSync(path.join(full, 'module.json'))) {
            found.push(full);
          } else {
            walk(full);
          }
        }
      } catch (_) {}
    }
  })(MODULES_DIR);
  return found.length ? found[0] : null;
}

function loadManifest(slug) {
  const dir = findManifestDir(slug);
  if (!dir) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf8')); } catch (_) { return null; }
}

function listAll() {
  const acc = [];
  (function walk(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          if (fs.existsSync(path.join(full, 'module.json'))) {
            acc.push(path.relative(MODULES_DIR, full).split(path.sep).pop());
          } else {
            walk(full, name);
          }
        }
      } catch (_) {}
    }
  })(MODULES_DIR, '');
  return [...new Set(acc)];
}

function decidir(slug, m) {
  const uis = m.ui_handlers || [];
  const tools = m.tools || [];
  const subs = (m.events && m.events.subscribes) || m.subscribes || [];
  const pubs = (m.events && m.events.publishes) || m.publishes || [];

  const toolNames = tools.map(t => (typeof t === 'string' ? t : (t.name || '')));
  const pubNames = pubs.map(e => (typeof e === 'string' ? e : (e.event || '')));

  const tieneLectura = toolNames.some(n => RX_LECTURA.test(n));
  const tieneEscritura = toolNames.some(n => RX_ESCRITURA.test(n));
  const esPuente = subs.length > 0 && toolNames.length === 0 && uis.length === 0;
  const esObservadorSoloEventos = toolNames.length === 0 && pubs.length > 0;
  const pasivo = toolNames.length === 0 && uis.length === 0 && pubs.length === 0;

  // ── Regla: ¿necesita interfaz? ──
  let necesita = false;
  let rol = 'sin-rol';

  if (esPuente) {
    rol = 'puente-interno';
  } else if (pasivo) {
    rol = 'reflejo-pasivo';
  } else if (esObservadorSoloEventos) {
    rol = 'observador-bus';
  } else if (tieneLectura || tieneEscritura) {
    necesita = true;
    rol = tieneEscritura ? 'operador' : 'consultor';
  } else {
    rol = 'sin-acciones-humanas';
  }

  // ── Regla: ¿qué tipo? (por rol del módulo, no por tamaño) ──
  let tipo = null;
  let razon = '';
  if (necesita) {
    if (DOMINIO_NEGOCIO.test(slug)) {
      tipo = 'workspace_module';
      razon = 'dominio del negocio: área de trabajo con CRUD/flujo';
    } else if (OPERACION_PUNTUAL.test(slug)) {
      tipo = 'chat_tool';
      razon = 'operación puntual disparada desde el chat';
    } else {
      tipo = 'system_panel';
      razon = 'gestión/sistema: panel bajo demanda';
    }
  }

  // Estado actual de los handlers (para auditar drift)
  const tiposActuales = {};
  for (const h of uis) {
    if (!h || typeof h !== 'object') continue;
    const t = h.type || 'SIN_TIPO';
    tiposActuales[t] = (tiposActuales[t] || 0) + 1;
  }

  return {
    slug,
    necesita_interfaz: necesita,
    tipo_sugerido: tipo,
    rol,
    razon,
    handlers_actuales: tiposActuales,
    acciones_ui: toolNames.slice(0, 8),
    drift: necesita && (tiposActuales['SIN_TIPO'] || (tipo && !tiposActuales[tipo])) ? true : false,
  };
}

// ── CLI ──
const args = process.argv.slice(2);
const idxModule = args.indexOf('--module');
const slugTarget = idxModule >= 0 ? args[idxModule + 1] : null;
const asJson = args.includes('--json');

const slugs = slugTarget ? [slugTarget] : listAll();
const resultados = [];

for (const slug of slugs) {
  const m = loadManifest(slug);
  if (!m) { console.error(`[skip] ${slug}: sin module.json`); continue; }
  resultados.push(decidir(slug, m));
}

if (asJson) {
  console.log(JSON.stringify(resultados, null, 2));
  process.exit(0);
}

for (const r of resultados) {
  const tipo = r.necesita_interfaz ? r.tipo_sugerido : '— (sin interfaz)';
  const drift = r.drift ? ' ⚠️ DRIFT' : '';
  console.log(`${r.slug.padEnd(28)} ${r.rol.padEnd(20)} → ${tipo}${drift}  ${r.razon}`);
}
