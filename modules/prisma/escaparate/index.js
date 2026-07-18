/**
 * prisma/escaparate — REFLEJO JS SIN ESTADO: la cara CLIENTE PÚBLICA de Prisma.
 *
 * Gemelo generalizado de pizzepos/carta-digital. Proyecta el ProductoUniversal del
 * catálogo activo a la vista PÚBLICA. Se diferencia de prisma/proyector (vista interna,
 * POS) en que PODA lo que el comerciante NO ofrece:
 *   - oculta los valores de opción disponible:false (el cliente no ve lo que no puede pedir)
 *   - presenta el precio de cara al público (fijo € · o 'consultar' si rango_valoracion/desconocido)
 *   - surfacea los avisos_obligatorios (restricciones verdad_obligatoria: alérgenos/etiqueta/seguridad)
 *   - marca requiere_cita si el eje tiempo lo pide (el PWA enciende el widget de fecha)
 *
 * La generación del bundle HTML/PWA (como carta-digital static-template) es follow-up
 * (verificación en vivo). Domain 'escaparate.*'. Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// El bundle se escribe en storage/www/ del proyecto (project-manager lo symlinka a
// /opt/enki/public/<ns>/<slug> al activar la feature `www`). Mismo modelo que carta-digital.
const BUNDLE_DIR = '/www';

// escape HTML — el contenido (nombres, descripciones, avisos) es dato del comerciante: se escapa.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// € con formato español (8.5 → "8,50 €")
function eur(n) { return `${Number(n).toFixed(2).replace('.', ',')} €`; }

class PrismaEscaparateReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escaparate';
    this.version = 'reflejo-0.1.0';
  }

  onPublicoRequest(e)  { return this._atender(e, 'publico', 'escaparate.publico.response', d => this._publico(d)); }
  onPublicarRequest(e) { return this._atender(e, 'publicar', 'escaparate.publicar.response', d => this._publicar(d)); }

  // ── núcleo PURO: catálogo → vista pública ──
  _proyectarPublico(catalogo) {
    const cats = Array.isArray(catalogo && catalogo.categorias) ? catalogo.categorias : [];
    const categorias = cats.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = (Array.isArray(catalogo && catalogo.productos) ? catalogo.productos : [])
      .map(p => this._productoPublico(p))
      .filter(Boolean);
    return { categorias, productos };
  }

  _precioPublico(p) {
    if (Number.isInteger(p.precio_base_centimos)) return { tipo: 'fijo', centimos: p.precio_base_centimos, eur: p.precio_base_centimos / 100 };
    const attrs = (p.contrato && Array.isArray(p.contrato.atributos_saber)) ? p.contrato.atributos_saber : (Array.isArray(p.atributos) ? p.atributos : []);
    const precio = attrs.find(a => a && String(a.nombre).toLowerCase() === 'precio');
    if (precio && typeof precio.valor === 'number') return { tipo: 'fijo', centimos: Math.round(precio.valor * 100), eur: precio.valor };
    const nat = p.naturalezas || {};
    return { tipo: 'consultar', motivo: nat.precio === 'rango_valoracion' ? 'valoración' : 'sin_precio' };
  }

  // opciones de cara al público: SOLO valores disponibles (oculta lo que el comerciante no ofrece).
  // Una opción sin ningún valor ofrecible se cae (nada que elegir); las LIBRE se conservan (texto).
  _opcionesPublicas(p) {
    const ops = (p.contrato && Array.isArray(p.contrato.opciones)) ? p.contrato.opciones : (Array.isArray(p.opciones) ? p.opciones : []);
    const out = [];
    for (const o of ops) {
      const esLibre = o.modo === 'LIBRE' || o.sub_forma === 'personalizacion_libre';
      const valores = (Array.isArray(o.valores) ? o.valores : []).filter(v => v && v.disponible !== false)
        .map(v => ({ id: v.id, etiqueta: v.etiqueta, delta_precio: (typeof v.delta_precio === 'number' ? v.delta_precio : 0) }));
      if (!esLibre && valores.length === 0) continue;   // nada que ofrecer → no se pinta
      out.push({ id: o.id, etiqueta: o.etiqueta, sub_forma: o.sub_forma, modo: o.modo, valores });
    }
    return out;
  }

  _productoPublico(p) {
    if (!p || (!p.nombre && !(p.identidad && p.identidad.que_es))) return null;
    const idn = p.identidad || {};
    const restr = Array.isArray(p.restricciones) ? p.restricciones : [];
    const ejes = p.ejes || {};
    return {
      id: p.id,
      nombre: p.nombre || idn.que_es,
      descripcion: idn.que_es || '',
      arquetipo: p.arquetipo || null,
      categoria_id: p.categoria_id || null,
      precio: this._precioPublico(p),
      opciones: this._opcionesPublicas(p),
      avisos_obligatorios: restr.filter(r => r && r.tipo === 'verdad_obligatoria').map(r => r.regla),
      requiere_cita: !!(ejes.tiempo && ejes.tiempo !== 'ninguno'),
      origen: (p.naturalezas && p.naturalezas.origen) === 'elaborado' ? 'elaborado' : 'de_reventa'
    };
  }

  // ── resolución del catálogo activo (via producto-manager) ──
  async _catalogoActivo(project_id, catalogo_id) {
    const cid = catalogo_id || await this._catalogoEnServicio(project_id);
    if (!cid) return null;
    const g = await this._rpc('catalogo.get.request', { project_id, catalogo_id: cid });
    return (g && g.status === 200 && g.data) ? g.data : null;
  }
  async _catalogoEnServicio(project_id) {
    const l = await this._rpc('catalogo.list.request', { project_id });
    if (!l || l.status !== 200 || !Array.isArray(l.data) || l.data.length === 0) return null;
    const enServicio = l.data.find(c => c.estado === 'en_servicio');
    return enServicio ? enServicio.id : (l.data.find(c => c.estado !== 'archivado') || l.data[0]).id;
  }

  async _publico(input) {
    if (!input.project_id) return this._invalid('project_id');
    const cat = await this._catalogoActivo(input.project_id, input.catalogo_id);
    if (!cat) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay catálogo activo', { project_id: input.project_id });
    const { categorias, productos } = this._proyectarPublico(cat);
    return { status: 200, data: {
      project_id: input.project_id, catalogo_id: cat?.meta?.id || input.catalogo_id || null,
      comercio: { nombre: (cat.meta && cat.meta.nombre) || 'Catálogo' },
      categorias, productos, total_productos: productos.length
    } };
  }

  // ── RENDER PURO: la vista pública + marca → HTML del bundle ──
  // Determinista y testeable. La MARCA solo aporta tokens (--accent, nombre, lema, logo);
  // el resto de tonos se derivan con color-mix, así bindear otra marca = cambiar --accent.
  _renderBundle(publico, marca) {
    const m = marca || {};
    const visual = m.visual || {};
    const colores = visual.colores || {};
    const accent = colores.primario || colores.principal || colores.acento || '#b8452f';
    const nombre = (publico.comercio && publico.comercio.nombre) || 'Comercio';
    const lema = (m.esencia && m.esencia.lema) || (m.negocio && m.negocio.tipo_cocina) || '';
    const logo = (typeof visual.logo === 'string' && /\p{Emoji}/u.test(visual.logo)) ? visual.logo : nombre.trim().charAt(0).toUpperCase();

    const cats = Array.isArray(publico.categorias) ? publico.categorias : [];
    const prods = Array.isArray(publico.productos) ? publico.productos : [];
    // agrupa productos por categoría (orden de categorías); los sin categoría conocida caen en un grupo final.
    const byCat = new Map(cats.map(c => [c.id, []]));
    const sueltos = [];
    for (const p of prods) { (byCat.has(p.categoria_id) ? byCat.get(p.categoria_id) : sueltos).push(p); }

    const badge = (txt, cls) => `<span class="badge${cls ? ' ' + cls : ''}">${esc(txt)}</span>`;
    const precioHtml = (pr) => pr && pr.tipo === 'fijo'
      ? eur(pr.eur)
      : `<span class="consultar">Consultar</span>`;
    const optsHtml = (ops) => {
      if (!Array.isArray(ops) || ops.length === 0) return '';
      const parts = ops.slice(0, 2).map(o => {
        const vals = (o.valores || []).slice(0, 3).map(v => esc(v.etiqueta)
          + (v.delta_precio ? ` +${eur(v.delta_precio)}` : '')).join(' · ');
        return `<b>${esc(o.etiqueta)}:</b> ${vals || 'a elegir'}`;
      });
      return `<p class="opts">${parts.join(' &nbsp;·&nbsp; ')}</p>`;
    };
    const cardHtml = (p) => {
      const badges = [];
      if (p.origen === 'elaborado') badges.push(badge('elaborado'));
      else badges.push(badge('de reventa', 'info'));
      if (Array.isArray(p.avisos_obligatorios) && p.avisos_obligatorios.length) badges.push(badge('contiene: ' + p.avisos_obligatorios.join(' · '), 'info'));
      if (p.requiere_cita) badges.push(badge('requiere cita', 'cita'));
      return `<article class="card"><div class="body">
        <h3>${esc(p.nombre)}</h3>
        ${p.descripcion ? `<p class="desc">${esc(p.descripcion)}</p>` : ''}
        <div class="badges">${badges.join('')}</div>
        ${optsHtml(p.opciones)}
      </div><div class="price">${precioHtml(p.precio)}<button class="add">${p.requiere_cita ? 'Reservar' : 'Añadir'}</button></div></article>`;
    };
    const grupos = cats.map(c => ({ c, items: byCat.get(c.id) || [] })).filter(g => g.items.length);
    if (sueltos.length) grupos.push({ c: { id: '_otros', nombre: 'Otros' }, items: sueltos });

    const nav = grupos.map((g, i) => `<a class="${i === 0 ? 'on' : ''}" href="#c-${esc(g.c.id)}">${esc(g.c.nombre || g.c.id)}</a>`).join('');
    const secciones = grupos.map(g => `<section class="cat" id="c-${esc(g.c.id)}">
      <h2>${esc(g.c.nombre || g.c.id)}</h2>
      ${g.c.descripcion ? `<p class="sub">${esc(g.c.descripcion)}</p>` : ''}
      ${g.items.map(cardHtml).join('\n')}
    </section>`).join('\n');

    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(nombre)} — escaparate</title>
<style>
:root{--bg:#faf8f5;--surface:#fff;--ink:#1b1a18;--ink-soft:#5c574f;--line:#ece7df;
--accent:${esc(accent)};--on-accent:#fff;--radius:16px;--maxw:720px;
--shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.05);
--font-head:Georgia,ui-serif,serif;--font-body:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.5;-webkit-font-smoothing:antialiased;padding:0 0 4rem}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 1.1rem}
header.brand{text-align:center;padding:2.4rem 1.1rem 1.6rem}
.logo{width:64px;height:64px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;margin:0 auto .8rem;font-family:var(--font-head);font-size:1.7rem;font-weight:700;box-shadow:var(--shadow)}
header.brand h1{font-family:var(--font-head);font-size:1.9rem;margin:.1rem 0 .25rem;letter-spacing:-.01em}
header.brand p{color:var(--ink-soft);margin:0;font-size:.98rem}
nav.cats{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);display:flex;gap:.4rem;overflow-x:auto;padding:.7rem 1.1rem;scrollbar-width:none}
nav.cats::-webkit-scrollbar{display:none}
nav.cats a{flex:0 0 auto;text-decoration:none;color:var(--ink-soft);font-size:.9rem;font-weight:600;padding:.4rem .8rem;border-radius:999px;border:1px solid var(--line);background:var(--surface);white-space:nowrap}
nav.cats a.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
section.cat{padding-top:1.8rem}
section.cat>h2{font-family:var(--font-head);font-size:1.25rem;margin:0 0 .2rem}
section.cat>.sub{color:var(--ink-soft);font-size:.9rem;margin:0 0 1rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.05rem;margin-bottom:.85rem;box-shadow:var(--shadow);display:flex;gap:1rem;align-items:flex-start}
.card .body{flex:1;min-width:0}
.card h3{margin:0 0 .2rem;font-size:1.06rem;letter-spacing:-.01em}
.card .desc{color:var(--ink-soft);font-size:.92rem;margin:0 0 .55rem}
.badges{display:flex;flex-wrap:wrap;gap:.35rem}
.badge{font-size:.72rem;font-weight:600;padding:.2rem .5rem;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,#fff);color:var(--accent)}
.badge.info{background:#eef1f4;color:#4a5568}
.badge.cita{background:#e9f2ec;color:#2f6b46}
.opts{font-size:.82rem;color:var(--ink-soft);margin:.5rem 0 0}.opts b{color:var(--ink)}
.price{flex:0 0 auto;text-align:right;font-family:var(--font-head);font-size:1.12rem;font-weight:700;white-space:nowrap;padding-top:.1rem}
.price .consultar{font-family:var(--font-body);font-size:.8rem;font-weight:600;color:var(--ink-soft)}
.add{margin-top:.55rem;display:block;width:100%;background:var(--accent);color:var(--on-accent);border:0;font-weight:700;font-size:.86rem;padding:.5rem .7rem;border-radius:10px;cursor:pointer}
footer{text-align:center;color:var(--ink-soft);font-size:.8rem;padding:2.5rem 1rem 0}
.avisos{font-size:.78rem;color:var(--ink-soft);margin-top:.6rem}
@media(prefers-color-scheme:dark){:root{--bg:#151311;--surface:#1f1c19;--ink:#f3efe9;--ink-soft:#b3aca1;--line:#332e28;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35)}
.badge.info{background:#2a2f36;color:#c3ccd6}.badge.cita{background:#22352a;color:#8fd0a5}}
</style></head><body>
<header class="brand"><div class="logo" aria-hidden="true">${esc(logo)}</div>
<h1>${esc(nombre)}</h1>${lema ? `<p>${esc(lema)}</p>` : ''}</header>
${nav ? `<nav class="cats" aria-label="Categorías">${nav}</nav>` : ''}
<div class="wrap">
${secciones || '<section class="cat"><p class="sub">Aún no hay productos publicados.</p></section>'}
<p class="avisos">Información de alérgenos según Reg. UE 1169/2011. Precios con IVA incluido.</p>
<footer>escaparate prisma</footer>
</div></body></html>`;
  }

  // ── PUBLICAR: proyecta el catálogo + marca → bundle HTML → verifica render → escribe a www/ ──
  //   Espinazo blueprint-agentico (determinista): LEER → (RENDER) → VALIDAR(verificador-visual) →
  //   GUARDAR(fs.write a www/ + ensure-feature www) → EMITIR. Verificación de render en vivo.
  async _publicar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const project_id = input.project_id;
    // LEER
    const cat = await this._catalogoActivo(project_id, input.catalogo_id);
    if (!cat) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay catálogo activo', { project_id });
    const publico = this._proyectarPublico(cat);
    publico.comercio = { nombre: (cat.meta && cat.meta.nombre) || 'Comercio' };
    // marca best-effort: por la puerta del dueño (carta-marketing), null si no responde
    let marca = null;
    try {
      const mr = await this._rpc('carta-marketing.get_perfil.request', { project_id }, { timeout_ms: 6000 });
      if (mr && mr.status === 200) marca = mr.data;
    } catch (_) { /* marca opcional */ }
    // RENDER (puro)
    const html = this._renderBundle(publico, marca);
    // VALIDAR — verificador-visual (best-effort: no bloquea la publicación si el órgano no está)
    let render_ok = null;
    try {
      const rnd = await this._rpc('render.verificar.request', { html, etiqueta: `escaparate:${project_id}` }, { timeout_ms: 20000 });
      render_ok = !!(rnd && (rnd.ok || (rnd.data && rnd.data.ok)));
    } catch (_) { /* verificación best-effort */ }
    // GUARDAR — auto-activar feature www (crea el symlink) + escribir el bundle
    let feature_www = false;
    try {
      const ef = await this._rpc('project.ensure-feature.request', { id: project_id, features: ['www'] }, { timeout_ms: 8000 });
      feature_www = !!(ef && (ef.status === 200 || ef.status === 201));
    } catch (_) { /* si falla, fs.write igual crea el árbol; el symlink se auto-cura en activate */ }
    const w = await this._rpc('fs.write.request', { project_id, path: `${BUNDLE_DIR}/index.html`, content: html, encoding: 'utf-8', atomic: true });
    if (!w || (w.status && w.status >= 400)) return this._errorResponse(502, 'UPSTREAM_WRITE_FAILED', 'no se pudo escribir el bundle', { project_id });
    // EMITIR
    const slug = (cat.meta && cat.meta.slug) || null;
    this.eventBus.publish('escaparate.publicado', { project_id, catalogo_id: cat?.meta?.id || null, total_productos: publico.productos.length, render_ok, timestamp: new Date().toISOString() });
    this.metrics?.increment?.('escaparate.publicado.total');
    return { status: 200, data: { project_id, bundle_dir: 'storage/www', feature_www, render_ok, total_productos: publico.productos.length, alojada_url: slug ? `/${slug}` : null } };
  }

  // señal de refresco
  async onCatalogoCambiado(event) {
    const d = event && (event.data || event.payload || event) || {};
    const project_id = d.project_id || (d.catalogo && d.catalogo.project_id);
    if (!project_id) return;
    this.eventBus.publish('escaparate.actualizado', { project_id, catalogo_id: (d.catalogo && d.catalogo.meta && d.catalogo.meta.id) || null, source: 'catalogo_change', timestamp: new Date().toISOString() });
    this.metrics?.increment?.('escaparate.actualizado.total');
  }
}

module.exports = PrismaEscaparateReflejo;
