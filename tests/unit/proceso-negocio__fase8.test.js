'use strict';
const assert = require('assert');
const ProcesoNegocio = require('../../modules/proceso-negocio');

function nuevo() {
  const m = new ProcesoNegocio();
  m.logger = { info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m.eventBus = { publish: () => {} };
  m._emitidos = new Map();
  m.pendientes = new Map();
  m._empujar = () => {};
  return m;
}

// progreso completo (todo construido + skill + interfaz operativa)
const completo = {
  project_id: 'proj-1', total: 3, construidos: 3, con_skill: 3,
  con_interfaz: 3, con_interfaz_esquematizada: 3, con_interfaz_construida: 3,
  faltan_por_construir: 0, faltan_por_skill: 0, faltan_por_interfaz: 0,
  faltan_por_interfaz_esquematizada: 0, faltan_por_interfaz_construida: 0,
  slugs: ['a', 'b', 'c']
};

(async () => {
  const m = nuevo();

  // 1. plan completo + sin verificar → empuja FASE 8 (verificar-en-vivo)
  const s1 = m._decidirSiguiente(completo);
  assert.strictEqual(s1.skill, 'verificar-en-vivo', 'plan completo sin verificar → FASE 8');

  // 2. plan completo + fase 'verificado' completándose → cierra (completado)
  const s2 = m._decidirSiguiente(completo, 'verificado');
  assert.strictEqual(s2.skill, null, 'tras verificar → cierra (completado)');

  // 3. plan completo + flag verificado persistido → cierra
  m._emitidos.set('proj-1::negocio.verificado', Date.now());
  const s3 = m._decidirSiguiente(completo);
  assert.strictEqual(s3.skill, null, 'flag verificado → cierra');

  // 4. plan incompleto → sigue construyendo (no llega a FASE 8)
  const incompleto = { ...completo, faltan_por_construir: 1, construidos: 2 };
  const s4 = m._decidirSiguiente(incompleto);
  assert.strictEqual(s4.skill, 'construir-modulos', 'plan incompleto → FASE 4');

  // 5. _verificado helper
  assert.strictEqual(m._verificado('proj-1'), true, '_verificado true tras flag');
  assert.strictEqual(m._verificado('proj-2'), false, '_verificado false sin flag');

  console.log('[proceso-negocio-fase8] OK — FASE 8 verificación final determinista');
})();
