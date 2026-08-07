'use strict';
// Tests puros de los reflejos del motor (P3 validador · P4 JEFE · P10 conversor).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validar } = require('../../_shared/motor/validador');
const { verificar } = require('../../_shared/motor/verificador');
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

test('validador: sin_transcript — basura de tool_thinking/tool_calls se RECHAZA (lección generador-de-informe)', () => {
  const basura = '<tool_thinking>\nNecesito construir el módulo...\n</tool_thinking>\n\n<tool_calls>\n<invoke name="bus.publishAndWait">\n<parameter name="event">rpc.buscar.request</parameter>\n</invoke>\n</tool_calls>';
  const r = validar({ content: basura }, { tamano_min: 200, sin_transcript: true });
  assert.equal(r.ok, false);
  assert.equal(r.regla, 'sin_transcript');
});

test('validador: sin_transcript — código real de módulo pasa', () => {
  const codigo = "const BaseModule = require('../../_shared/base-module');\nclass Generador extends BaseModule {\n  constructor() { super(); this.name='generador-de-informe'; this.version='0.1.0'; }\n  onXRequest(e) { return this._atender(e, 'x', 'generador-de-informe.x.response', d => this._x(d)); }\n}\nmodule.exports = Generador;";
  const r = validar({ content: codigo }, { tamano_min: 200, sin_transcript: true });
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
function mundoFalso({ existe = true, contenido = '', enRepo = true, sinPuerto = {} } = {}) {
  return {
    existe: (p) => (sinPuerto.existe ? undefined : existe),
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
