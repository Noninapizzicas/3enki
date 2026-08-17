/**
 * prisma/producir — TEST unitario determinista (sin bus, sin red).
 * Verifica la LÓGICA pura: _proyectar · _rendimiento · _validar · _desmembrar,
 * con _rpc/eventBus stubeados (patrón de la casa: el reflejo se testea por métodos internos).
 * Casos del diseño prisma-producir.md: interpolación por ÁREA (disco 33cm=315g → 30cm≈260g),
 * rendimiento inverso con stock, frenos de validar, pendiente_declaracion, mortero escala FIJA.
 */

'use strict';
const assert = require('node:assert/strict');
const Producir = require('./index.js');

// ── datos de prueba: masa-pan (la INSTANCIA de dominio que masa demostró) + mortero (escala fija) ──
const COMPUESTOS = {
  'masa-pan': {
    id: 'masa-pan', nombre: 'masa-pan', unidad_produccion: 'bolas',
    regla_escala_default: 'lineal',
    formatos: [
      { id: 'disco_33_cm', cantidad: 315, unidad: 'g', regla: 'area', diametro_cm: 33 },
      { id: 'disco_30_cm', regla: 'area', diametro_cm: 30 },          // sin cantidad → interpola contra la ref
    ],
    componentes: [
      { ref: 'harina', cantidad: 200, unidad: 'g' },
      { ref: 'agua', cantidad: 0.1, unidad: 'l' },
      { ref: 'sal', cantidad: 4, unidad: 'g' },
    ],
  },
  'mortero-1-4': {
    id: 'mortero-1-4', nombre: 'mortero-1-4', unidad_produccion: 'sacos', regla_escala_default: 'fija',
    componentes: [
      { ref: 'cemento', cantidad: 5, unidad: 'kg' },
      { ref: 'arena', cantidad: 20, unidad: 'kg' },
    ],
  },
  'jarabe-sin-declarar': {   // compuesto SIN unidad_produccion ni formatos → pendiente_declaracion
    id: 'jarabe-sin-declarar', nombre: 'jarabe-sin-declarar',
    componentes: [{ ref: 'concentrado', cantidad: 1, unidad: 'l' }],
  },
};

const INSUMOS = {
  harina:     { insumo: { naturalezas: { unidad_base: 'kg', densidad_g_ml: null } } },
  agua:       { insumo: { naturalezas: { unidad_base: 'l', densidad_g_ml: 1 } } },
  sal:        { insumo: { naturalezas: { unidad_base: 'g', densidad_g_ml: null } } },
  cemento:    { insumo: { naturalezas: { unidad_base: 'kg', densidad_g_ml: null } } },
  arena:      { insumo: { naturalezas: { unidad_base: 'kg', densidad_g_ml: null } } },
  concentrado:{ insumo: { naturalezas: { unidad_base: 'l', densidad_g_ml: null } } },
};

function nuevaInstancia() {
  const m = new Producir();
  m._rpc = async (topic, data) => {
    if (topic === 'compuestos.get.request') {
      const c = COMPUESTOS[data.compuesto_id];
      return c ? { status: 200, data: { compuesto: c } } : { status: 404, data: {} };
    }
    if (topic === 'insumos.get.request') {
      const i = INSUMOS[data.insumo_id];
      return i ? { status: 200, data: i } : { status: 404, data: {} };
    }
    return { status: 500, data: {} };
  };
  m.eventBus = { publish: () => {} };
  m.metrics = { increment: () => {} };
  return m;
}

let pasados = 0;
function ok(nombre) { pasados++; console.log('  ✓ ' + nombre); }

(async () => {
  const m = nuevaInstancia();

  // ── 1 · PROYECTAR formato DECLARADO (disco_33_cm × 10): factor = 10, totales en unidad base ──
  console.log('T1 · proyectar formato declarado');
  {
    const r = await m._proyectar({ project_id: 'p1', compuesto_id: 'masa-pan', objetivo: { formato: 'disco_33_cm', cantidad: 10, unidad: 'ud' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'calculada');
    assert.equal(r.data.factor, 10);
    assert.deepEqual(r.data.componentes.map(c => [c.ref, c.cantidad, c.unidad]),
      [['harina', 2000, 'g'], ['agua', 1, 'l'], ['sal', 40, 'g']]);
    // desmembramiento: harina g→kg (unidad base del insumo)
    const t = Object.fromEntries(r.data.totales.map(x => [x.ref, [x.cantidad, x.unidad]]));
    assert.deepEqual(t.harina, [2, 'kg']);      // 2000 g → 2 kg
    assert.deepEqual(t.agua, [1, 'l']);
    assert.deepEqual(t.sal, [40, 'g']);
    ok('factor 10 · componentes escalados · harina g→kg (2 kg)');
  }

  // ── 2 · PROYECTAR formato SIN cantidad → interpola por ÁREA (30cm vs ref 33cm) ──
  console.log('T2 · interpolación por área (disco_30_cm × 10)');
  {
    const r = await m._proyectar({ project_id: 'p1', compuesto_id: 'masa-pan', objetivo: { formato: 'disco_30_cm', cantidad: 10, unidad: 'ud' } });
    assert.equal(r.data.status, 'calculada');
    const esc = (30 ** 2) / (33 ** 2);                 // ≈ 0.82645
    assert.ok(Math.abs(r.data.factor - 10 * esc) < 1e-6, `factor ${r.data.factor} ≈ ${10 * esc}`);
    const harina = r.data.componentes.find(c => c.ref === 'harina');
    assert.ok(Math.abs(harina.cantidad - 200 * 10 * esc) < 1e-3, `harina ${harina.cantidad} ≈ ${200 * 10 * esc}`);
    // el diseño: disco 30 ≈ 260 g (vs 315 declarado en 33) → 315 × esc = 260.3
    assert.ok(Math.abs(315 * esc - 260.3) < 0.1, `315×${esc.toFixed(4)} = ${(315 * esc).toFixed(2)} ≈ 260.3`);
    ok(`esc ${esc.toFixed(4)} → 30cm ≈ ${(315 * esc).toFixed(1)}g (el número del diseño)`);
  }

  // ── 3 · PENDIENTE_DECLARACION: compuesto sin unidad_produccion ni formatos ──
  console.log('T3 · pendiente_declaracion');
  {
    const r = await m._proyectar({ project_id: 'p1', compuesto_id: 'jarabe-sin-declarar', objetivo: { cantidad: 5, unidad: 'l' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'pendiente_declaracion');
    assert.ok(r.data.motivo);
    ok('no inventa el factor: responde pendiente_declaracion con motivo');
  }

  // ── 4 · RENDIMIENTO inverso: stock → unidades (floor) + sobrante ──
  console.log('T4 · rendimiento con stock');
  {
    const r = await m._rendimiento({
      project_id: 'p1', compuesto_id: 'masa-pan',
      stock: [
        { ref: 'harina', cantidad: 2000, unidad: 'g' },   // 10 bolas
        { ref: 'agua', cantidad: 1.1, unidad: 'l' },      // 11 bolas
        { ref: 'sal', cantidad: 40, unidad: 'g' },        // 10 bolas
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'calculada');
    assert.equal(r.data.unidades, 10);                    // min(10, 11, 10) → floor
    assert.equal(r.data.unidad_produccion, 'bolas');
    const sob = Object.fromEntries(r.data.sobrante.map(x => [x.ref, x.cantidad]));
    assert.equal(sob.harina, 0);                          // 2000 − 10×200
    assert.ok(Math.abs(sob.agua - 0.1) < 1e-9);           // 1.1 − 10×0.1
    ok('min sobre componentes → 10 bolas · sobrante {harina 0, agua 0.1l, sal 0}');
  }

  // ── 5 · RENDIMIENTO sin unidad_produccion → pendiente (no decide) ──
  console.log('T5 · rendimiento sin unidad_produccion');
  {
    const r = await m._rendimiento({ project_id: 'p1', compuesto_id: 'jarabe-sin-declarar', stock: [{ ref: 'concentrado', cantidad: 5, unidad: 'l' }] });
    assert.equal(r.data.status, 'pendiente_declaracion');
    ok('pendiente_declaracion (stock sin unidad de producción declarada)');
  }

  // ── 6 · MORTERO escala FIJA: 30 sacos → cemento 150 kg + arena 600 kg ──
  console.log('T6 · mortero escala fija');
  {
    const r = await m._proyectar({ project_id: 'p1', compuesto_id: 'mortero-1-4', objetivo: { cantidad: 30, unidad: 'sacos' } });
    assert.equal(r.data.status, 'calculada');
    assert.equal(r.data.factor, 30);
    const t = Object.fromEntries(r.data.totales.map(x => [x.ref, x.cantidad]));
    assert.equal(t.cemento, 150);     // 5 kg × 30
    assert.equal(t.arena, 600);       // 20 kg × 30
    ok('30 sacos → cemento 150 kg + arena 600 kg (proporción 1:4 intacta)');
  }

  // ── 7 · VALIDAR: frenos puros ──
  console.log('T7 · frenos de validar');
  {
    assert.equal(m._validar(COMPUESTOS['masa-pan'], null).valid, false);
    assert.equal(m._validar(COMPUESTOS['masa-pan'], { cantidad: 0, unidad: 'bolas' }).valid, false);
    assert.equal(m._validar(COMPUESTOS['masa-pan'], { formato: 'disco_50_cm', cantidad: 1 }).valid, false);   // formato desconocido
    assert.equal(m._validar(COMPUESTOS['masa-pan'], { formato: 'disco_33_cm', cantidad: 2 }).valid, true);
    // el freno también atrapa el 404 antes de proyectar
    const r = await m._proyectar({ project_id: 'p1', compuesto_id: 'no-existe', objetivo: { cantidad: 1, unidad: 'bolas' } });
    assert.equal(r.status, 404);
    ok('cantidad≤0 / formato desconocido / objetivo nulo → invalid · compuesto inexistente → 404');
  }

  console.log(`\nRESULTADO: ${pasados}/7 bloques OK`);
  process.exit(pasados === 7 ? 0 : 1);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
