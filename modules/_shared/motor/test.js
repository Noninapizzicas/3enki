'use strict';
// Tests puros de los reflejos del motor (P3 validador · P4 JEFE · P10 conversor).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validar } = require('../../_shared/motor/validador');
const { verificar, extraerEspina } = require('../../_shared/motor/verificador');
const { convertir } = require('../../_shared/motor/conversor');

// ── P3 · VALIDADOR ────────────────────────────────────────────────────────────
test('validador: salida válida pasa', () => {
  const r = validar({ nombre: 'x', version: '1.0.0' }, { campos: ['nombre', 'version'], tamano_min: 2 });
  assert.equal(r.ok, true);
});

test('validador: campo faltante → corregir con detalle', () => {
  const r = validar({ nombre: 'x' }, { campos: ['nombre', 'version'] });
  assert.equal(r.ok, false);
  assert.equal(r.regla, 'campos');
  assert.match(r.detalle, /version/);
});

test('validador: tamaño mínimo no alcanzado', () => {
  const r = validar('hola', { tamano_min: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.regla, 'tamano_min');
});

test('validador: tipo equivocado', () => {
  const r = validar('texto', { tipo: 'object' });
  assert.equal(r.ok, false);
  assert.equal(r.regla, 'tipo');
});

test('validador: sin reglas → pasa (declarado)', () => {
  const r = validar({});
  assert.equal(r.ok, true);
});

// ── P10 · CONVERSOR ───────────────────────────────────────────────────────────
test('conversor: string JSON → canónica parseada', () => {
  const r = convertir('{"nombre":"x"}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.canónica, { nombre: 'x' });
});

test('conversor: objeto pasa tal cual', () => {
  const r = convertir({ nombre: 'x' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.canónica, { nombre: 'x' });
});

test('conversor: texto plano → envuelto como content', () => {
  const r = convertir('hola mundo');
  assert.equal(r.ok, true);
  assert.deepEqual(r.canónica, { content: 'hola mundo' });
});

test('conversor: JSON inválido → error de formato con detalle', () => {
  const r = convertir('{nombre: x}');
  assert.equal(r.ok, false);
  assert.match(r.detalle, /JSON inválido/);
});

test('conversor: vacío → error', () => {
  assert.equal(convertir('').ok, false);
  assert.equal(convertir(null).ok, false);
});

// ── P4 · EL JEFE (verificador) con MUNDO INYECTADO ───────────────────────────
// Un mundo falso para el test: el archivo "existe" con contenido real.
// `existe` acepta boolean (todo existe / nada existe) o función (p → boolean),
// para los casos que necesitan existencia POR RUTA (requires_resueltos).
function mundoFalso({ existe = true, contenido = '', enRepo = true, sinPuerto = {} } = {}) {
  return {
    existe: (p) => (sinPuerto.existe ? undefined : (typeof existe === 'function' ? existe(p) : existe)),
    leer: (p) => (sinPuerto.leer ? undefined : contenido),
    enRepo: (p) => (sinPuerto.enRepo ? undefined : enRepo)
  };
}

test('JEFE: entregable que existe → verificado', () => {
  const v = verificar({ tipo: 'fs', path: 'x/index.js', reglas: ['existe'] }, mundoFalso({ existe: true }));
  assert.equal(v.verificado, true);
  assert.equal(v.motivo, 'entregable_verificado');
});

test('JEFE: el humo se pilla — no existe → NO verificado con regla', () => {
  const v = verificar({ tipo: 'fs', path: 'x/index.js', reglas: ['existe'] }, mundoFalso({ existe: false }));
  assert.equal(v.verificado, false);
  assert.equal(v.motivo, 'entregable_no_verificado');
  assert.equal(v.reglas[0].ok, false);
  assert.match(v.reglas[0].detalle, /NO existe/);
});

test('JEFE: contenido_min — vacío → NO verificado', () => {
  const v = verificar(
    { tipo: 'fs', path: 'x/SKILL.md', reglas: ['existe', 'contenido_min'], min_chars: 100 },
    mundoFalso({ existe: true, contenido: 'corto' })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[1].detalle, /solo \d+ chars/);
});

test('JEFE: api_real — módulo con _shared + _atender 4 args → ok', () => {
  const contenido = "const BaseModule = require('../../_shared/base-module');\nclass X extends BaseModule {\n  async _atender(evento, contexto, respuesta, siguiente) {}\n}";
  const v = verificar(
    { tipo: 'fs', path: 'x/index.js', reglas: ['api_real'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, true);
});

test('JEFE: api_real — sin patrón de módulo → NO verificado', () => {
  const v = verificar(
    { tipo: 'fs', path: 'x/index.js', reglas: ['api_real'] },
    mundoFalso({ existe: true, contenido: 'console.log("hola")' })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /patrón de módulo no completo/);
});

// ── P4 · requires_resueltos (el freno que api_real no puede dar) ─────────────
// Testigo: modules/banco-ideas/ (2026-08-11) — api_real:ok + en_repo:ok sobre
// un módulo con require('../_shared/prioridad') que NO existe. Sellado
// verificado:true, commiteado, y roto al cargar.
const EXISTEN_REALES = new Set(['_shared/modulo-hibrido-reflejo.js', '_shared/pos-persistencia.js', '_shared/base-module.js']);

test('JEFE: requires_resueltos — el caso banco-ideas: api_real pasa pero el require fantasma NO', () => {
  const contenido = [
    "const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');",
    "const PosPersistencia = require('../_shared/pos-persistencia');",
    "const prioridadHelper = require('../_shared/prioridad');",
    'class X { async _atender(evento, contexto, respuesta, siguiente) {} }'
  ].join('\n');
  const mundo = mundoFalso({ existe: (p) => EXISTEN_REALES.has(p), contenido });

  const soloApiReal = verificar({ tipo: 'fs', path: 'banco-ideas/index.js', reglas: ['api_real'] }, mundo);
  assert.equal(soloApiReal.verificado, true, 'api_real por sí sola deja pasar el módulo roto (por eso hace falta la nueva regla)');

  const conFreno = verificar(
    { tipo: 'fs', path: 'banco-ideas/index.js', reglas: ['api_real', 'requires_resueltos'] },
    mundo
  );
  assert.equal(conFreno.verificado, false);
  assert.match(conFreno.reglas[1].detalle, /\.\.\/_shared\/prioridad/);
  assert.match(conFreno.reglas[1].detalle, /revienta al cargar/);
});

test('JEFE: requires_resueltos — todos los require resuelven → ok', () => {
  const contenido = "const BaseModule = require('../_shared/base-module');\nconst fs = require('fs');";
  const v = verificar(
    { tipo: 'fs', path: 'x/index.js', reglas: ['requires_resueltos'] },
    mundoFalso({ existe: (p) => EXISTEN_REALES.has(p), contenido })
  );
  assert.equal(v.verificado, true, 'los bare specifiers (fs) los resuelve node, no el mundo');
  assert.match(v.reglas[0].detalle, /todos resuelven/);
});

test('JEFE: requires_resueltos — módulo ANIDADO (pizzepos/pedidos) resuelve ../../_shared', () => {
  const contenido = "const BaseModule = require('../../_shared/base-module');";
  const v = verificar(
    { tipo: 'fs', path: 'pizzepos/pedidos/index.js', reglas: ['requires_resueltos'] },
    mundoFalso({ existe: (p) => EXISTEN_REALES.has(p), contenido })
  );
  assert.equal(v.verificado, true);
});

test('JEFE: requires_resueltos — no aplica al module.json (su presencia la cubre existe)', () => {
  const v = verificar(
    { tipo: 'fs', path: 'x/module.json', reglas: ['requires_resueltos'] },
    mundoFalso({ existe: false, contenido: '{}' })
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[0].detalle, /no aplica/);
});

// ── P4 · plan_acoplable (FASE 3b — el plano como CONTRATO, no como prosa) ────
const ESPINA_OK = {
  esquema: 'enki-plan-v1',
  hojas: [
    { slug: 'banco-ideas', forma: 'custodio', accion: 'CONSTRUIR', depende_de: ['database-manager'], subscribes: ['banco.registrar.request'], publishes: ['banco.idea.registrada', 'banco.registrar.failed'] }
  ],
  orden: ['banco-ideas']
};
const planCon = (espina) => `# Plano\n\nprosa event-driven con base-module y micro-agente\n\n\`\`\`json enki-plan\n${JSON.stringify(espina, null, 2)}\n\`\`\`\n`;

test('JEFE: plan_acoplable — espina válida → verificado', () => {
  const v = verificar(
    { tipo: 'fs', path: 'storage/esquemas/plan-construccion.md', reglas: ['plan_acoplable'] },
    mundoFalso({ existe: true, contenido: planCon(ESPINA_OK) })
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[0].detalle, /1 hojas tipadas/);
});

test('JEFE: plan_acoplable — plano de PROSA sin espina → NO verificado', () => {
  const v = verificar(
    { tipo: 'fs', path: 'storage/esquemas/plan-construccion.md', reglas: ['plan_acoplable'] },
    mundoFalso({ existe: true, contenido: '# Plano\n\nHoja 1: banco-ideas (custodio). Hoja 2: pipeline-semanal.' })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /sin espina/);
});

test('JEFE: plan_acoplable — slug con prefijo de vertical → NO verificado', () => {
  const espina = { hojas: [{ ...ESPINA_OK.hojas[0], slug: 'pizzepos/banco-ideas' }] };
  const v = verificar(
    { tipo: 'fs', path: 'storage/esquemas/plan-construccion.md', reglas: ['plan_acoplable'] },
    mundoFalso({ existe: true, contenido: planCon(espina) })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /slug inválido/);
});

test('JEFE: plan_acoplable — hoja sin eventos (isla muda) → NO verificado', () => {
  const espina = { hojas: [{ slug: 'banco-ideas', forma: 'custodio', accion: 'CONSTRUIR', subscribes: [], publishes: [] }] };
  const v = verificar(
    { tipo: 'fs', path: 'storage/esquemas/plan-construccion.md', reglas: ['plan_acoplable'] },
    mundoFalso({ existe: true, contenido: planCon(espina) })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /ni escucha ni emite/);
});

test('JEFE: plan_acoplable — forma fuera del patrón Enki → NO verificado', () => {
  const espina = { hojas: [{ ...ESPINA_OK.hojas[0], forma: 'helper' }] };
  const v = verificar(
    { tipo: 'fs', path: 'storage/esquemas/plan-construccion.md', reglas: ['plan_acoplable'] },
    mundoFalso({ existe: true, contenido: planCon(espina) })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /forma 'helper' fuera de/);
});

test('extraerEspina: la prosa con guiones NO produce hojas (el regex viejo sí lo hacía)', () => {
  assert.equal(extraerEspina('event-driven, base-module, micro-agente'), null);
  assert.equal(extraerEspina(planCon(ESPINA_OK)).hojas.length, 1);
});

// ── El PUENTE F3b→F4: las hojas del plan (orquestador) ──────────────────────
const PROSA_DEL_PATRON = 'Sistema event-driven: cada isla es un micro-servicio con base-module y single-writer.\nHojas: banco-ideas (custodio) y pipeline-semanal (micro-agente).';

// Los tests de la FASE 4 (`_hojaDelPlan`, `_leerRebanadas`) vivían aquí y probaban
// EjecutorMotor de `conversacion/ai-agent-framework-v3`, eliminado en 703d662a
// (6-sep-2026). Se retiran con su sujeto: un test que no puede cargar el módulo
// que mide no es cobertura, es una puerta en rojo permanente.

test('orquestador: _hojasDelPlan lee la ESPINA — solo las hojas declaradas', () => {
  const ProcesoNegocio = require('../../proceso-negocio/index.js');
  const m = new ProcesoNegocio();
  const plan = `${PROSA_DEL_PATRON}\n\n\`\`\`json enki-plan\n${JSON.stringify({ hojas: [{ slug: 'banco-ideas' }, { slug: 'pipeline-semanal' }] })}\n\`\`\``;
  assert.deepEqual(m._hojasDelPlan(plan), ['banco-ideas', 'pipeline-semanal']);
});

test('orquestador: _hojasDelPlan sin espina — el fallback descarta el vocabulario del patrón', () => {
  const ProcesoNegocio = require('../../proceso-negocio/index.js');
  const m = new ProcesoNegocio();
  const hojas = m._hojasDelPlan(PROSA_DEL_PATRON);
  assert.deepEqual(hojas, ['banco-ideas', 'pipeline-semanal']);
  for (const fantasma of ['event-driven', 'micro-servicio', 'base-module', 'single-writer', 'micro-agente']) {
    assert.equal(hojas.includes(fantasma), false, `${fantasma} es doctrina, no una hoja a construir`);
  }
});

test('orquestador: _hojasDelPlan ignora slugs con vertical en la espina (modules/<slug>/ es plano)', () => {
  const ProcesoNegocio = require('../../proceso-negocio/index.js');
  const m = new ProcesoNegocio();
  const plan = `x\n\n\`\`\`json enki-plan\n${JSON.stringify({ hojas: [{ slug: 'pizzepos/pedidos' }, { slug: 'banco-ideas' }] })}\n\`\`\``;
  assert.deepEqual(m._hojasDelPlan(plan), ['banco-ideas']);
});

test('JEFE: en_repo sin puerto → NO bloquea (declarado)', () => {
  const v = verificar(
    { tipo: 'fs', path: 'x/index.js', reglas: ['en_repo'] },
    mundoFalso({ sinPuerto: { enRepo: true } })
  );
  assert.equal(v.verificado, true);
});

test('JEFE: interfaz_decidida — ui_handlers tipados → ok', () => {
  const contenido = JSON.stringify({
    name: 'pedidos',
    ui_handlers: [
      { domain: 'pedido', action: 'list', type: 'workspace_module', zone: 'barra_modulos' },
      { domain: 'pedido', action: 'create', type: 'workspace_module', zone: 'barra_modulos' }
    ]
  });
  const v = verificar(
    { tipo: 'fs', path: 'pedidos/module.json', reglas: ['existe', 'interfaz_decidida'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[1].detalle, /type\+zone canónicos/);
});

test('JEFE: interfaz_decidida — ui_decision.necesita=false → ok (sin interfaz documentada)', () => {
  const contenido = JSON.stringify({ name: 'adaptador', ui_decision: { necesita: false, tipo: null, razon: 'puente interno' } });
  const v = verificar(
    { tipo: 'fs', path: 'adaptador/module.json', reglas: ['existe', 'interfaz_decidida'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[1].detalle, /ui_decision.necesita=false/);
});

test('JEFE: interfaz_decidida — SIN_TIPO → NO verificado (drift)', () => {
  const contenido = JSON.stringify({ name: 'filesystem', ui_handlers: [{ domain: 'fs', action: 'list' }] });
  const v = verificar(
    { tipo: 'fs', path: 'filesystem/module.json', reglas: ['existe', 'interfaz_decidida'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[1].detalle, /sin type o zone canónico/);
});

test('JEFE: interfaz_decidida — module.json sin ui_handlers ni ui_decision → NO verificado', () => {
  const v = verificar(
    { tipo: 'fs', path: 'x/module.json', reglas: ['interfaz_decidida'] },
    mundoFalso({ existe: true, contenido: '{"name":"x"}' })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /interfaz NO decidida/);
});

test('JEFE: ui_declarada — blueprint con sección ui.ops + ui.datos → ok (F6½ por generador)', () => {
  const contenido = JSON.stringify({
    id: 'interfaz',
    transporte: { rpc: ['interfaz.listar.request -> .response'] },
    ui: {
      ops: {
        listar: { titulo: 'Listar candidatos' },
        ver: { titulo: 'Ver ficha', args: [{ nombre: 'candidatoId', tipo: 'string', required: true }] }
      },
      datos: { op: 'listar', titulo: 'Candidatos', refresh_on: ['interfaz.veredicto_confirmado'], columnas: ['titulo', 'estado'] }
    }
  });
  const v = verificar(
    { tipo: 'fs', path: 'interfaz/interfaz.blueprint.json', reglas: ['existe', 'ui_declarada'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[1].detalle, /2 operaciones \+ tabla 'listar'/);
});

test('JEFE: ui_declarada — blueprint con ui vacía → ok (defaults del generador cubren)', () => {
  const contenido = JSON.stringify({ id: 'sonda', ui: {} });
  const v = verificar(
    { tipo: 'fs', path: 'sonda/sonda.blueprint.json', reglas: ['ui_declarada'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[0].detalle, /defaults del generador cubren/);
});

test('JEFE: ui_declarada — blueprint sin sección ui → NO verificado (F6½ no declaró)', () => {
  const contenido = JSON.stringify({ id: 'redactor', transporte: { rpc: [] } });
  const v = verificar(
    { tipo: 'fs', path: 'redactor/redactor.blueprint.json', reglas: ['ui_declarada'] },
    mundoFalso({ existe: true, contenido })
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /sin sección ui/);
});

test('JEFE: interfaz_operativa — trío completo → ok', () => {
  const mundo = {
    existe: (p) => {
      if (p === 'frontend/src/lib/modules/pedidos/manifest.json') return true;
      if (p === 'frontend/src/lib/modules/pedidos/index.ts') return true;
      if (p === 'frontend/src/lib/modules/pedidos/PedidosPanel.svelte') return true;
      return false;
    },
    leer: () => '', enRepo: () => true
  };
  const v = verificar(
    { tipo: 'fs', path: 'frontend/src/lib/modules/pedidos/manifest.json', reglas: ['interfaz_operativa'] },
    mundo
  );
  assert.equal(v.verificado, true);
  assert.match(v.reglas[0].detalle, /trío operativo completo/);
});

test('JEFE: interfaz_operativa — falta el Panel.svelte → NO verificado', () => {
  const mundo = {
    existe: (p) => p.includes('manifest.json') || p.includes('index.ts'),
    leer: () => '', enRepo: () => true
  };
  const v = verificar(
    { tipo: 'fs', path: 'frontend/src/lib/modules/pedidos/manifest.json', reglas: ['interfaz_operativa'] },
    mundo
  );
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /faltan archivos/);
  assert.match(v.reglas[0].detalle, /Panel\.svelte/);
});

test('JEFE: interfaz_operativa — sin carpeta de módulo → NO verificado', () => {
  const v = verificar(
    { tipo: 'fs', path: 'frontend/src/lib/modules/nada/manifest.json', reglas: ['interfaz_operativa'] },
    mundoFalso({ existe: false })
  );
  assert.equal(v.verificado, false);
});

test('JEFE: regla desconocida → NO verificado con detalle', () => {
  const v = verificar({ tipo: 'fs', path: 'x', reglas: ['regla_inexistente'] }, mundoFalso({ existe: true }));
  assert.equal(v.verificado, false);
  assert.match(v.reglas[0].detalle, /regla desconocida/);
});

test('JEFE: entregable sin path → veredicto de contrato roto', () => {
  const v = verificar({ tipo: 'fs' }, mundoFalso());
  assert.equal(v.verificado, false);
  assert.equal(v.motivo, 'entregable_sin_path');
});

test('JEFE: sin reglas → default existe', () => {
  const v = verificar({ tipo: 'fs', path: 'x/index.js' }, mundoFalso({ existe: true }));
  assert.equal(v.verificado, true);
});
