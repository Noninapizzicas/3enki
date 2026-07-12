#!/usr/bin/env node
'use strict';

// validate-cabecera.js — el VIGILANTE de la cúpula de la cabecera (peldaño 2:
// lo que no se computa, se vigila; el olvido hace ruido, nunca silencio).
//
// Comprueba:
//   ERROR   frontmatter incompleto (id/dominio/resumen) · marcador {{...}} irresoluble
//           · rebanada de _orden.json que no existe
//   WARN    STALE: las fuentes de una rebanada cambiaron después que la rebanada
//           · fuente muerta (glob que no casa ningún fichero)
//           · módulo huérfano (module.json sin rebanada que lo cubra)
//
// Modos:
//   node scripts/cabecera/validate-cabecera.js               repo entero (staleness por git log)
//   node scripts/cabecera/validate-cabecera.js --diff BASE   modo PR: solo lo tocado desde BASE
//   ... --json                                               salida estructurada (workflows)
//
// Fase TESTIGO: los WARN no rompen (exit 0). Los ERROR sí (exit 1).
// Graduar a freno = tratar stale como error cuando el equipo lo decida.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ds = require('./doc-sync.js');

const ROOT = process.cwd();

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] || true) : null;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { return ''; }
}

function ultimoCommitTs(pathspecs) {
  if (!pathspecs.length) return null;
  const out = git(['log', '-1', '--format=%ct', '--', ...pathspecs.map((p) => `:(glob)${p}`)]);
  return out ? Number(out) : null;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

// Secciones de una rebanada en coordenadas de FICHERO (para cruzar con los hunks del diff):
// cada ## / ### abre una sección que llega hasta la línea previa al siguiente encabezado.
function seccionesFichero(rel) {
  let lines;
  try { lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n'); } catch { return []; }
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,3})\s+(.+)$/);
    if (m) heads.push({ titulo: m[2].trim(), linea: i + 1 });
  }
  return heads.map((h, idx) => ({
    titulo: h.titulo, norm: norm(h.titulo),
    desde: h.linea, hasta: (idx + 1 < heads.length ? heads[idx + 1].linea - 1 : lines.length)
  }));
}

// Líneas del fichero (coords NUEVAS) que el PR modificó — de los hunks @@ del diff.
function lineasCambiadas(rel, diffBase) {
  const out = git(['diff', '--unified=0', `${diffBase}...HEAD`, '--', rel]);
  const set = new Set();
  const re = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let m;
  while ((m = re.exec(out))) {
    const start = Number(m[1]); const count = (m[2] === undefined) ? 1 : Number(m[2]);
    for (let i = 0; i < count; i++) set.add(start + i);
  }
  return set;
}

// Claves candidatas de un fichero fuente = segmentos de directorio bajo modules/
// (p.ej. modules/pizzepos/carta-digital/index.js → ['pizzepos','carta-digital']).
// La sección que lo cubre es la que casa la clave MÁS específica (la más larga).
function clavesDeFuente(f) {
  const m = f.match(/^modules\/(.+)$/);
  if (!m) return [];
  const segs = m[1].split('/');
  segs.pop();                              // quita el nombre de fichero
  return segs.map(norm).filter(Boolean).sort((a, b) => b.length - a.length);
}

function main() {
  const diffBase = arg('diff');
  // FRENO graduado por dominio: los dominios en --freno (coma-separados) tratan su
  // staleness como ERROR (rompe, exit 1), no como WARN testigo. El resto sigue testigo.
  // Cierra la fuga del sello barato DONDE el drift ya pasó (p.ej. --freno pizzepos),
  // sin romper los dominios que aún maduran. Sin flag → todo testigo (comportamiento previo).
  const frenoArg = arg('freno');
  const frenoDominios = new Set(
    (typeof frenoArg === 'string' ? frenoArg : '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  const errores = [];
  const stale = [];
  const fuentesMuertas = [];
  const huerfanos = [];

  // ── cargar cúpula ──
  let rebanadas;
  try {
    rebanadas = ds.cargarRebanadas();
  } catch (err) {
    errores.push({ tipo: 'orden', detalle: err.message });
    return reportar({ errores, stale, fuentesMuertas, huerfanos });
  }

  const cambiadosPR = diffBase
    ? git(['diff', '--name-only', `${diffBase}...HEAD`]).split('\n').filter(Boolean)
    : null;

  for (const r of rebanadas) {
    const rel = `arquitectura/cabecera/${r.archivo}`;

    // frontmatter
    if (!r.front || !r.front.id || !r.front.dominio || !r.front.resumen) {
      errores.push({ tipo: 'frontmatter', archivo: r.archivo, detalle: 'faltan id/dominio/resumen' });
      continue;
    }

    // marcadores
    const res = ds.resolverMarcadores(r.body);
    for (const roto of res.rotos) {
      errores.push({ tipo: 'marcador', archivo: r.archivo, detalle: `${roto.marcador}: ${roto.motivo}` });
    }

    const fuentes = Array.isArray(r.front.fuentes) ? r.front.fuentes : [];

    // fuentes muertas
    for (const f of fuentes) {
      if (ds.contarGlob(f.replace(/\/\*\*$/, '/**')) === 0 && ds.contarGlob(f) === 0) {
        fuentesMuertas.push({ archivo: r.archivo, fuente: f });
      }
    }

    if (!fuentes.length) continue;

    // staleness
    if (cambiadosPR) {
      // modo PR: el PR toca fuentes de la rebanada sin tocar la SECCIÓN que las cubre.
      const regexes = fuentes.map(ds.globARegex);
      const tocaFuentes = cambiadosPR.filter((f) => regexes.some((re) => re.test(f)));
      const tocaRebanada = cambiadosPR.includes(rel);
      if (tocaFuentes.length && !tocaRebanada) {
        // la rebanada no se tocó EN ABSOLUTO → stale de fichero (como antes)
        stale.push({ archivo: r.archivo, dominio: r.front.dominio, fuentes_tocadas: tocaFuentes.slice(0, 5), total: tocaFuentes.length });
      } else if (tocaFuentes.length && tocaRebanada) {
        // la rebanada SÍ se tocó — sección-granular: cada fuente tocada mapea (por nombre de
        // módulo) a su sección; si esa sección NO cambió, sigue stale (cierra la fuga 1: tocar
        // una sección ya no calla a las otras). Fuente sin sección que case → cubierta a nivel
        // de fichero (el toque cuenta), degradación honesta sin falsos positivos.
        const secciones = seccionesFichero(rel);
        const cambiadas = lineasCambiadas(rel, diffBase);
        const seccionCambio = (sec) => { for (let l = sec.desde; l <= sec.hasta; l++) if (cambiadas.has(l)) return true; return false; };
        const stalePorSeccion = new Map();   // titulo → fuentes huérfanas
        for (const f of tocaFuentes) {
          let sec = null;
          for (const clave of clavesDeFuente(f)) {
            const cand = secciones.find((s) => s.norm.includes(clave));
            if (cand) { sec = cand; break; }   // clave más específica primero
          }
          if (sec && !seccionCambio(sec)) {
            if (!stalePorSeccion.has(sec.titulo)) stalePorSeccion.set(sec.titulo, []);
            stalePorSeccion.get(sec.titulo).push(f);
          }
        }
        for (const [titulo, fs2] of stalePorSeccion) {
          stale.push({ archivo: r.archivo, dominio: r.front.dominio, seccion: titulo, fuentes_tocadas: fs2.slice(0, 5), total: fs2.length });
        }
      }
    } else {
      // modo repo: última mano a las fuentes vs última mano a la rebanada
      const tsFuentes = ultimoCommitTs(fuentes);
      const tsRebanada = ultimoCommitTs([rel]);
      if (tsFuentes && tsRebanada && tsFuentes > tsRebanada) {
        stale.push({
          archivo: r.archivo,
          dominio: r.front.dominio,
          fuentes_desde: new Date(tsFuentes * 1000).toISOString().slice(0, 10),
          rebanada_desde: new Date(tsRebanada * 1000).toISOString().slice(0, 10)
        });
      }
    }
  }

  // ── módulos huérfanos: todo module.json debe estar cubierto por alguna rebanada ──
  const todasFuentes = rebanadas.flatMap((r) => (Array.isArray(r.front?.fuentes) ? r.front.fuentes : []));
  const regexesFuentes = todasFuentes.map(ds.globARegex);
  const rutasManifiestos = [];
  (function buscar(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('_') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) buscar(p);
      else if (e.name === 'module.json') rutasManifiestos.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
  })(path.join(ROOT, 'modules'));

  for (const m of rutasManifiestos) {
    const dir = m.replace(/\/module\.json$/, '');
    const cubierto = regexesFuentes.some((re) => re.test(m) || re.test(`${dir}/index.js`) || re.test(dir));
    if (!cubierto) huerfanos.push({ modulo: dir });
  }

  // FRENO: el stale de un dominio frenado se promueve a ERROR (rompe). El resto queda testigo.
  const staleFreno = frenoDominios.size ? stale.filter((s) => frenoDominios.has(s.dominio)) : [];
  const staleTestigo = frenoDominios.size ? stale.filter((s) => !frenoDominios.has(s.dominio)) : stale;
  for (const s of staleFreno) {
    const donde = s.seccion ? ` §«${s.seccion}»` : '';
    errores.push({
      tipo: 'stale-freno', archivo: s.archivo,
      detalle: s.fuentes_tocadas
        ? `dominio '${s.dominio}' es FRENO: el PR toca ${s.total} fichero(s) de sus fuentes (${s.fuentes_tocadas.join(', ')}${s.total > 5 ? ', …' : ''}) sin actualizar la sección que los cubre${donde}. Actualiza esa sección o sella verificado: (tras releer) en este PR.`
        : `dominio '${s.dominio}' es FRENO: fuentes al ${s.fuentes_desde}, rebanada al ${s.rebanada_desde}.`
    });
  }

  return reportar({
    errores, stale: staleTestigo, staleFreno, fuentesMuertas, huerfanos,
    frenoDominios: [...frenoDominios], rebanadas: rebanadas.length, modo: diffBase ? 'pr' : 'repo'
  });
}

function reportar(r) {
  if (arg('json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`cabecera: ${r.rebanadas || 0} rebanadas · modo ${r.modo || '-'}`);
    for (const e of r.errores) console.error(`✗ ERROR [${e.tipo}] ${e.archivo || ''}: ${e.detalle}`);
    for (const s of r.stale) {
      const donde = s.seccion ? ` §«${s.seccion}»` : '';
      console.warn(s.fuentes_tocadas
        ? `⚠ STALE ${s.archivo}${donde}: el cambio toca ${s.total} fichero(s) de sus fuentes (${s.fuentes_tocadas.join(', ')}${s.total > 5 ? ', …' : ''}) y ${s.seccion ? 'esa sección' : 'la rebanada'} no se tocó`
        : `⚠ STALE ${s.archivo}: fuentes al ${s.fuentes_desde}, rebanada al ${s.rebanada_desde}`);
    }
    for (const f of r.fuentesMuertas) console.warn(`⚠ FUENTE MUERTA ${f.archivo}: ${f.fuente} no casa ningún fichero`);
    for (const h of r.huerfanos) console.warn(`⚠ HUÉRFANO ${h.modulo}: ningún fuentes de rebanada lo cubre`);
    const ok = r.errores.length === 0;
    console.log(ok
      ? `✓ sin errores (${r.stale.length} stale · ${r.huerfanos.length} huérfanos · ${r.fuentesMuertas.length} fuentes muertas — testigo)`
      : `✗ ${r.errores.length} errores`);
  }
  process.exitCode = r.errores.length ? 1 : 0;
  return r;
}

if (require.main === module) main();
module.exports = { main };
