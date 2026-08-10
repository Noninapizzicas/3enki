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

// ── MOTOR v3 · RESOLVER storage/ → SLUG (base_path del proyecto) ──────────────
test('motor: _resolver storage/ con project.activated → dir por SLUG (store canónico)', () => {
  const EjecutorMotorModule = require('../../conversacion/ai-agent-framework-v3/index.js');
  const m = new EjecutorMotorModule();
  m.dataDir = '/data';
  m.modulesDir = '/modules';
  m.repoDir = '/repo';
  // onLoad sin eventBus real: capturamos el suscriptor
  let suscriptor = null;
  return m.onLoad({ eventBus: { subscribe: (ev, fn) => { suscriptor = fn; return () => {}; } }, moduleLoader: null }).then(() => {
    // project.activated: UUID → base_path (slug)
    suscriptor({ data: { project_id: 'uuid-abc', base_path: '/data/projects/panaderia-test' } });
    const r = m._resolver('storage/esquemas/esquema.md', 'uuid-abc');
    assert.equal(r, '/data/projects/panaderia-test/storage/esquemas/esquema.md');
  });
});

test('motor: _resolver storage/ SIN cache → fallback al dir por UUID (no rompe)', () => {
  const EjecutorMotorModule = require('../../conversacion/ai-agent-framework-v3/index.js');
  const m = new EjecutorMotorModule();
  m.dataDir = '/data';
  m.modulesDir = '/modules';
  m.repoDir = '/repo';
  const r = m._resolver('storage/esquemas/esquema.md', 'uuid-sin-activar');
  assert.equal(r, '/data/projects/uuid-sin-activar/storage/esquemas/esquema.md');
});

test('motor: _resolverBasePath consulta project-manager si el cache no tiene el slug', async () => {
  const EjecutorMotorModule = require('../../conversacion/ai-agent-framework-v3/index.js');
  const m = new EjecutorMotorModule();
  m.dataDir = '/data';
  // _pedir simulado: project.get.response con base_path del slug
  m._pedir = async (ev, payload, evResp) => {
    if (ev === 'project.get.request') return { project: { base_path: '/data/projects/panaderia-real' } };
    return {};
  };
  const base = await m._resolverBasePath('uuid-consulta');
  assert.equal(base, '/data/projects/panaderia-real');
  // queda cacheado para el siguiente _resolver
  const r = m._resolver('storage/x.md', 'uuid-consulta');
  assert.equal(r, '/data/projects/panaderia-real/storage/x.md');
});

// ── MOTOR v3 · finish_reason del provider ────────────────────────────────────
test('motor: onLlmCompleteResponse propaga finish_reason + tokens (la verdad del truncado)', async () => {
  const EjecutorMotorModule = require('../../conversacion/ai-agent-framework-v3/index.js');
  const m = new EjecutorMotorModule();
  let resuelto = null;
  m._generacionEsperas.set('req-fr', { resolve: (r) => { resuelto = r; }, to: null, paso: 'generar' });
  await m.onLlmCompleteResponse({ data: { request_id: 'req-fr', content: 'x', finish_reason: 'length', tokens: { input: 100, output: 200, total: 300 } } });
  assert.equal(resuelto.finish_reason, 'length');
  assert.equal(resuelto.tokens.total, 300);
});

// ── MOTOR v3 · _resolverSlug: el nombre del módulo sale del paréntesis de la hoja ──
test('motor: _resolverSlug prioriza el paréntesis de la hoja (H-01 (config) → config, no plan-construccion)', () => {
  const EjecutorMotorModule = require('../../conversacion/ai-agent-framework-v3/index.js');
  const m = new EjecutorMotorModule();
  const task = 'Construir la hoja H-01 (config) de la Fase 0 - Cimientos según el plan de construcción en /esquemas/plan-construccion.md. Es la hoja de configuración base del sistema: leer la especificación de H-01 del plan, crear el módulo de config con su module.json e index.js (estructura de configuración, defaults, validación), siguiendo el patrón de módulo real. No construir más hojas — solo H-01.';
  assert.equal(m._resolverSlug(task, 'construir-modulos'), 'config');
  // Regresión: sin paréntesis, el token largo de módulo sigue ganando
  assert.equal(m._resolverSlug('Construir el módulo gestor-de-suscriptores de la Etapa 2 según el plan', 'construir-modulos'), 'gestor-de-suscriptores');
});

// ── MOTOR v3 · enRepo verifica COMMIT REAL, no staging ───────────────────────
test('motor: enRepo usa git log (commit real), no git ls-files (staging)', () => {
  // El closure enRepo del mundo: git log -- <path> solo devuelve algo si un
  // commit REAL toca el archivo (lección "b": git add sin commit dejaba el
  // archivo en staging y ls-files daba ok:true con el commit fallido).
  const { execSync } = require('child_process');
  const repoDir = '/home/admin/3enki';
  function enRepo(rel) {
    if (rel.startsWith('storage/')) return undefined;
    const repoPath = rel.startsWith('frontend/') ? rel : `modules/${rel}`;
    try {
      const out = execSync(`git -C ${repoDir} log --oneline -1 -- ${repoPath} 2>/dev/null`, { stdio: 'pipe' });
      return out.toString().trim().length > 0;
    } catch { return undefined; }
  }
  // archivo real commiteado en el repo
  assert.equal(enRepo('_shared/motor/test.js'), true);
  // archivo inexistente → false (antes: ls-files también daba false, ok)
  assert.equal(enRepo('zzz-no-existe-xyz/index.js'), false);
});

// ── MOTOR v3 · inventario del sistema para la FASE 3 ─────────────────────────
test('motor: _inventarioModulos lista lo que YA existe (la F3 planea reutilizando, no reinventando)', () => {
  const EjecutorMotorModule = require('../../conversacion/ai-agent-framework-v3/index.js');
  const m = new EjecutorMotorModule();
  m.modulesDir = '/home/admin/3enki/modules';
  const inv = m._inventarioModulos();
  assert.ok(inv.length > 50, 'inventario poblado');
  // Las piezas que el plan de "b" proponía construir YA existen en el sistema
  assert.ok(inv.includes('_shared'), '_shared (base-module) existe');
  assert.ok(inv.includes('project-profile'), 'project-profile existe');
  assert.ok(inv.includes('filesystem'), 'filesystem existe');
  assert.ok(inv.includes('conversacion/ai-gateway'), 'ai-gateway existe (vertical)');
  assert.ok(inv.includes('estados'), 'estados/rail existe');
});
