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
      // modo PR: el PR toca fuentes de la rebanada sin tocar la rebanada
      const regexes = fuentes.map(ds.globARegex);
      const tocaFuentes = cambiadosPR.filter((f) => regexes.some((re) => re.test(f)));
      const tocaRebanada = cambiadosPR.includes(rel);
      if (tocaFuentes.length && !tocaRebanada) {
        stale.push({ archivo: r.archivo, dominio: r.front.dominio, fuentes_tocadas: tocaFuentes.slice(0, 5), total: tocaFuentes.length });
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
    errores.push({
      tipo: 'stale-freno', archivo: s.archivo,
      detalle: s.fuentes_tocadas
        ? `dominio '${s.dominio}' es FRENO: el PR toca ${s.total} fichero(s) de sus fuentes (${s.fuentes_tocadas.join(', ')}${s.total > 5 ? ', …' : ''}) sin actualizar la rebanada. Actualiza la prosa o sella verificado: (tras releer) en este PR.`
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
      console.warn(s.fuentes_tocadas
        ? `⚠ STALE ${s.archivo}: el cambio toca ${s.total} fichero(s) de sus fuentes (${s.fuentes_tocadas.join(', ')}${s.total > 5 ? ', …' : ''}) y la rebanada no se tocó`
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
