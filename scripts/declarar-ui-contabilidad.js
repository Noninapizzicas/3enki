#!/usr/bin/env node
/**
 * declarar-ui-contabilidad.js — F6 paso 4: escribe ui_handlers (type+zone) en los
 * module.json de la vertical contabilidad, según la decisión de
 * `decidir-interfaz-contabilidad.js`.
 *
 * ui_handlers deriva de los RPCs REALES del module.json:
 *   { domain, action: '<slug>.<accion>', handler, type, zone }
 *
 * Los módulos decididos como SIN superficie (tipo null) NO llevan ui_handlers
 * (su cara es el bus) — no se les inventa una.
 *
 * Uso: node scripts/declarar-ui-contabilidad.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DECISION, ZONA } = require('./decidir-interfaz-contabilidad.js');

const VERTICALES = ['contabilidad-entrada', 'contabilidad-libro', 'contabilidad-fiscal', 'contabilidad-analitica'];
const DOMINIO = 'contabilidad';

function accionDe(ev) {
  const e = ev.slice(0, -'.request'.length);
  const i = e.indexOf('.');
  return i >= 0 ? e.slice(i + 1) : e;
}

const total = {};
let n = 0;
for (const v of VERTICALES) {
  const dir = path.join('modules', v);
  if (!fs.existsSync(dir)) continue;
  for (const slug of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, slug, 'module.json');
    if (!fs.existsSync(p)) continue;
    const man = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tipo = DECISION[slug];
    if (tipo === undefined) { console.log('  ⚠️ SIN DECISIÓN: ' + slug); continue; }

    if (tipo === null) {
      delete man.ui_handlers;
      man['_ui'] = 'sin superficie: su cara es el bus (puente/observador puro)';
    } else {
      const reqs = (man.subscribes || []).filter(s => (s.event || '').endsWith('.request'));
      man.ui_handlers = reqs.map(s => ({
        domain: DOMINIO,
        action: slug + '.' + accionDe(s.event),
        handler: s.handler,
        type: tipo,
        zone: ZONA[tipo],
      }));
      delete man['_ui'];
    }
    fs.writeFileSync(p, JSON.stringify(man, null, 2) + '\n');
    total[tipo || 'sin_superficie'] = (total[tipo || 'sin_superficie'] || 0) + 1;
    n++;
  }
}
console.log('\n=== F6 · ui_handlers declarados en los ' + n + ' ===');
for (const [k, c] of Object.entries(total)) console.log('  ' + k.padEnd(20) + c);
