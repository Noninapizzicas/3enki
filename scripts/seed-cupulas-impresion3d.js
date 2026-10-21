/**
 * seed-cupulas-impresion3d.js — siembra skills y clases de los módulos de
 * impresión 3D en la bóveda de cúpulas, usando las PROYECCIONES REALES del
 * reflejo `cupulas` contra disco.
 *
 *   node scripts/seed-cupulas-impresion3d.js [project_id]    (default: taller-3d)
 *
 * Crea 2 cúpulas (skills + clases) con 5 notas que documentan:
 *   - disenador_parametrico (reflejo backend)
 *   - cabinetlock.scad (OpenSCAD paramétrico)
 *   - seed-cabinetlock.js (semilla catálogo + cola)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const CupulasReflejo = require('../modules/cupulas/index.js');

const PID = process.argv[2] || 'taller-3d';
const STORAGE = path.join(process.cwd(), 'data', 'projects', PID, 'storage');

function fsStub(ev, p) {
  if (ev !== 'fs.write.request' && ev !== 'fs.read.request') return null;
  const abs = path.join(STORAGE, p.path.replace(/^\//, ''));
  if (ev === 'fs.write.request') {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof p.content === 'string' ? p.content : JSON.stringify(p.content, null, 2), 'utf-8');
    return { status: 201 };
  }
  return fs.existsSync(abs) ? { status: 200, content: fs.readFileSync(abs, 'utf-8') } : { status: 404 };
}

const m = new CupulasReflejo();
m._rpc = async (ev, p) => fsStub(ev, p);
m._publicarEvento = async () => {};
m.eventBus = { publish: () => {}, subscribe: () => () => {} };

async function cupula(tema, tipo, descripcion) {
  const r = await m._crearCupula({ project_id: PID, tema, tipo, descripcion });
  if (r.status >= 400 && r.error?.code !== 'CONFLICT_STATE') {
    throw new Error(`crear '${tema}': ${JSON.stringify(r)}`);
  }
  return r.data?.cupula_id || m._slug(tema);
}

async function add(payload) {
  const r = await m._addNota({ project_id: PID, ...payload });
  if (r.status >= 400) throw new Error(`add_nota '${payload.titulo}': ${JSON.stringify(r)}`);
  console.log(`  ✓ ${payload.titulo}`);
  return r;
}

(async () => {
  console.log(`Sembrando cúpulas impresión 3D en proyecto '${PID}'...\n`);

  // ── Cúpula 1: SKILLS (recetas operativas de los módulos) ──
  const sk = await cupula('Skills impresión 3D', 'skill', 'Recetas operativas de los módulos del taller 3D');
  console.log('=== SKILLS ===');

  await add({
    cupula: sk, titulo: 'Diseñador Paramétrico', id: 'usar-disenador-parametrico',
    lenguaje: 'pseudo',
    resumen: 'construirScad → _generarStl (MCP) → STL; estimar tiempo por volumen',
    enlaces: ['disenador-parametrico-reflejo', 'construir-scad'],
    contenido:
`SKILL usar-disenador-parametrico
  ENTRADA: forma ('caja'|'cilindro') + dimensiones + formato ('stl')
  FLUJO:
    1. construirScad({forma, dimensiones}) → código .scad paramétrico
    2. _generarStl({project_id, parametros}) → bridge MCP → export_model → {archivo, bytes}
    3. _estimarTiempo({project_id, parametros}) → heurística volumen→minutos
  FRENOS:
    formato != 'stl' → 422 con hint (el gcode lo genera el slicer)
    MCP caído         → 503 UPSTREAM_UNREACHABLE (degradación honesta)
    sin project_id    → 400
  EVENTOS:
    disenador.generar_stl.request   → disenador.generar_stl.response
    disenador.estimar_tiempo.request → disenador.estimar_tiempo.response`
  });

  await add({
    cupula: sk, titulo: 'CabinetLOCK OpenSCAD', id: 'renderizar-cabinetlock',
    lenguaje: 'pseudo',
    resumen: 'sistema paramétrico de 7 piezas + torre calibración para armario 16mm',
    enlaces: ['usar-disenador-parametrico', 'sembrar-cabinetlock'],
    contenido:
`SKILL renderizar-cabinetlock
  ARCHIVO: disenos/cabinetlock/cabinetlock.scad
  SELECTOR: variable PIEZA = "esquina_l" | "esquina_3d" | "t_interior" |
            "soporte_balda" | "recto" | "tapon" | "union_vertical" | "calibracion"
  PARAMETROS RECTORES:
    ESPESOR_TABLERO = 16    // mm — cambiar adapta TODO el set
    TOLERANCIA_LADO = 0.15  // mm — calibrar con torre primero
  SNAP-FIT:
    brazo 6mm · espesor 2.4mm · deflexión 1.2mm
    entrada 25° (~15N) · retención 80° (~40N) · >500 ciclos PETG
  FLUJO:
    1. Imprimir torre calibración (PIEZA="calibracion")
    2. Medir tolerancia real → ajustar TOLERANCIA_LADO
    3. Cambiar PIEZA → F6 → exportar STL
    4. Laminar en CrealityPrint (perfil PETG, 0.2mm, 30% gyroid)
  MATERIAL: PETG (240°C/80°C, 45mm/s, sin soportes, brim 5mm)`
  });

  await add({
    cupula: sk, titulo: 'Sembrar CabinetLOCK', id: 'sembrar-cabinetlock',
    lenguaje: 'pseudo',
    resumen: 'seed script: registra 8 modelos en catálogo y encola calibración + prueba',
    enlaces: ['renderizar-cabinetlock'],
    contenido:
`SKILL sembrar-cabinetlock
  COMANDO: node scripts/seed-cabinetlock.js [project_id]   // default: taller-3d
  REGISTRA: 8 modelos en catalogo-modelos
    cabinetlock-calibracion · cabinetlock-esquina-l · cabinetlock-esquina-3d
    cabinetlock-t-interior · cabinetlock-soporte-balda · cabinetlock-recto
    cabinetlock-tapon · cabinetlock-union-vertical
  ENCOLA:
    1) Torre calibración  (urgencia 5 — imprime primero)
    2) Esquina-L prueba   (urgencia 4)
  STUBS: fsStub + _rpc inyectados (proyecciones directas, sin bus real)
  IDEMPOTENCIA: duplicado en cola → 409 ALREADY_EXISTS (no rompe)
  PERSISTENCIA: catalogo._persist.flush() + cola._persist.flush()`
  });

  // ── Cúpula 2: CLASES (OOP de los módulos) ──
  const cl = await cupula('Clases impresión 3D', 'clase', 'Modelos OOP de los módulos del taller 3D');
  console.log('\n=== CLASES ===');

  await add({
    cupula: cl, titulo: 'DisenadorParametricoReflejo', id: 'disenador-parametrico-reflejo',
    lenguaje: 'oop',
    resumen: 'reflejo del diseñador: scad paramétrico + bridge MCP + estimación',
    enlaces: ['construir-scad', 'usar-disenador-parametrico'],
    contenido:
`CLASE DisenadorParametricoReflejo HEREDA ModuloHibridoReflejo {
  name    = 'disenador_parametrico'
  version = 'reflejo-0.1.0'

  // ── estáticas puras (exportadas, sin estado) ──
  STATIC construirScad({forma, dimensiones}) → String   // código OpenSCAD
  STATIC estimarMinutos({dimensiones}) → Integer >= 1   // heurística volumen/2000

  // ── bridge inyectable (DI) ──
  _mcpCall(tool, args) → resultado MCP   // inyectar en tests / producción

  // ── proyecciones (request/response por _atender) ──
  _generarStl(input):
    VALIDAR project_id, formato ∈ ['stl']
    scad ← construirScad(input.parametros)
    resultado ← _mcpCall('export_model', {output_format, scad_content})
    RETORNA {status: 200, data: {archivo, bytes, formato}}
    CATCH → {status: 503, error: {code: 'UPSTREAM_UNREACHABLE'}}

  _estimarTiempo(input):
    VALIDAR project_id
    minutos ← estimarMinutos(input.parametros)
    RETORNA {status: 200, data: {project_id, minutos}}

  // ── handlers RPC (una línea cada uno) ──
  onGenerarStlRequest(e)    → _atender(e, 'generar_stl', ...)
  onEstimarTiempoRequest(e) → _atender(e, 'estimar_tiempo', ...)
}`
  });

  await add({
    cupula: cl, titulo: 'construirScad', id: 'construir-scad',
    lenguaje: 'pseudo',
    resumen: 'función pura: forma + dimensiones → código OpenSCAD paramétrico',
    enlaces: ['disenador-parametrico-reflejo'],
    contenido:
`FUNCION construirScad({forma, dimensiones}) → String:
  SI forma == 'caja':
    {ancho, alto, profundo, pared} ← dimensiones (defaults: 40, 20, 30, 2)
    RETORNA scad:
      ancho = <valor>; alto = <valor>; profundo = <valor>; pared = <valor>;
      difference() {
        cube([ancho, alto, profundo]);
        translate([pared, pared, pared])
          cube([ancho - pared*2, alto - pared*2, profundo - pared + 0.1]);
      }

  SI forma == 'cilindro':
    {radio, alto} ← dimensiones (defaults: 10, 15)
    RETORNA scad:
      radio = <valor>; alto = <valor>;
      cylinder(h=alto, r=radio, $fn=64);

  SINO:
    RETORNA "// forma '<forma>' no soportada"

INVARIANTE: función PURA — sin estado, sin I/O, determinista.
EXTENSIBLE: añadir rama por forma nueva (esfera, tubo, engranaje...)`
  });

  // ── Resumen ──
  const cs = await m._listarCupulas({ project_id: PID });
  const g = await m._grafo({ project_id: PID });
  console.log(`\n=== RESUMEN ===`);
  console.log(`  Bóveda: data/projects/${PID}/storage/cupulas/`);
  console.log('  Cúpulas:', cs.data.cupulas.map(c => `${c.id}(${c.tipo}):${c.notas_count}`).join('  '));
  console.log(`  Grafo: ${g.data.total_nodes} notas, ${g.data.total_edges} enlaces\n`);
})().catch(e => { console.error('SEED FAIL:', e.message); process.exit(1); });
