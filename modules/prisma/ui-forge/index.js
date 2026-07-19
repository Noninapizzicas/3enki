/**
 * prisma/ui-forge — EL TALLER DE UI de prisma (REFLEJO JS, esqueleto v0.1).
 *
 * El espacio donde prisma CREA UIs potentes y con lógica, servidas desde el árbol web del
 * proyecto (storage/www/prisma/<proposito>/), dirigidas por el ProductoUniversal, teñidas por
 * la MARCA, y aprobadas por los OJOS (verificador-visual). Gemelo generalizado de carta-design:
 *
 *   LEER    catálogo (proyección) + marca (carta-marketing) + lentes-diseño (el gusto puntero)
 *   PENSAR  se compone la UI  → v0.1: RENDER DETERMINISTA (esqueleto); la capa LLM (lentes) es follow-up
 *   VALIDAR render.verificar (verificador-visual): render real · a11y · sin overflow (best-effort)
 *   GUARDAR fs.write del bundle a storage/www/prisma/<proposito>/index.html + ensure-feature('www')
 *   EMITIR  ui-forge.generado
 *
 * PRIMERA SALIDA: proposito 'pos' → el POS de DOS ZONAS dirigido por el catálogo (ver _renderPOS).
 * Namespace propio bajo www (no colisiona con carta-digital ni con el escaparate en /prisma/).
 * Domain 'ui-forge.*'. Verificación de render en vivo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { renderPOS } = require('./render-pos');

const BUNDLE_ROOT = '/www/prisma';                 // subcarpeta por propósito: /www/prisma/pos/, /www/prisma/escaparate/…
const PROPOSITOS = new Set(['pos']);               // v0.1: pos. (escaparate lo sirve su módulo; se moverá aquí en follow-up)

class PrismaUiForgeReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ui-forge';
    this.version = 'reflejo-0.1.0';
  }

  onGenerarRequest(e) { return this._atender(e, 'generar', 'ui-forge.generar.response', d => this._generar(d)); }

  // ── LEER: catálogo activo (via producto-manager) ──
  async _catalogoActivo(project_id, catalogo_id) {
    const cid = catalogo_id || await this._catalogoEnServicio(project_id);
    if (!cid) return null;
    const g = await this._rpc('catalogo.get.request', { project_id, catalogo_id: cid });
    return (g && g.status === 200 && g.data) ? g.data : null;
  }
  async _catalogoEnServicio(project_id) {
    const l = await this._rpc('catalogo.list.request', { project_id });
    const cs = (l && l.status === 200 && Array.isArray(l.data)) ? l.data : [];
    if (cs.length === 0) return null;
    const enServicio = cs.find(c => c.estado === 'en_servicio');
    return enServicio ? enServicio.id : (cs.find(c => c.estado !== 'archivado') || cs[0]).id;
  }

  // ── el frame del taller ──
  async _generar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const proposito = String(input.proposito || 'pos');
    if (!PROPOSITOS.has(proposito)) return this._errorResponse(400, 'PROPOSITO_DESCONOCIDO', `proposito no soportado: ${proposito}`, { soportados: [...PROPOSITOS] });
    const project_id = input.project_id;

    // LEER — catálogo
    const cat = await this._catalogoActivo(project_id, input.catalogo_id);
    if (!cat) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no hay catálogo activo', { project_id });
    const comercio = { nombre: (cat.meta && cat.meta.nombre) || 'Comercio' };

    // LEER — marca (best-effort, por la puerta del dueño)
    let marca = null;
    try {
      const mr = await this._rpc('carta-marketing.get_perfil.request', { project_id }, { timeout_ms: 6000 });
      if (mr && mr.status === 200) marca = mr.data;
    } catch (_) { /* marca opcional */ }

    // LEER — lentes de diseño (el gusto puntero). Best-effort: si el cuenco no está, seguimos con la base.
    // v0.1 no las INYECTA aún en el render determinista; deja el circuito atado para la capa LLM (follow-up).
    let lentes = null;
    try {
      const lr = await this._rpc('lentes.obtener.request', { dominio: 'diseño', tarea: `UI ${proposito} de comercio` }, { timeout_ms: 6000 });
      if (lr && lr.status === 200) lentes = lr.data;
    } catch (_) { /* lentes opcionales en v0.1 */ }

    // PENSAR/RENDER — v0.1 determinista
    const html = renderPOS(cat, marca);

    // VALIDAR — los ojos (best-effort: no bloquea si el órgano no está)
    let render_ok = null, motivos = [];
    try {
      const rnd = await this._rpc('render.verificar.request', { html, etiqueta: `ui-forge:${proposito}:${project_id}` }, { timeout_ms: 20000 });
      const rd = (rnd && (rnd.data || rnd)) || {};
      render_ok = !!(rnd && (rnd.ok || rd.ok));
      motivos = Array.isArray(rd.motivos) ? rd.motivos : [];
    } catch (_) { /* verificación best-effort */ }

    // GUARDAR — feature www + bundle en su propósito
    let feature_www = false;
    try {
      const ef = await this._rpc('project.ensure-feature.request', { id: project_id, features: ['www'] }, { timeout_ms: 8000 });
      feature_www = !!(ef && (ef.status === 200 || ef.status === 201));
    } catch (_) { /* el fs.write igual crea el árbol; el symlink se auto-cura en activate */ }
    const dir = `${BUNDLE_ROOT}/${proposito}`;
    const w = await this._rpc('fs.write.request', { project_id, path: `${dir}/index.html`, content: html, encoding: 'utf-8', atomic: true });
    if (!w || (w.status && w.status >= 400)) return this._errorResponse(502, 'UPSTREAM_WRITE_FAILED', 'no se pudo escribir el bundle', { project_id, dir });

    // EMITIR
    const slug = (cat.meta && cat.meta.slug) || null;
    this.eventBus.publish('ui-forge.generado', { project_id, proposito, render_ok, motivos, lentes_disponibles: !!lentes, timestamp: new Date().toISOString() });
    this.metrics?.increment?.('ui-forge.generado.total', { proposito });
    return { status: 200, data: {
      project_id, proposito, bundle_dir: `storage/www/prisma/${proposito}`,
      feature_www, render_ok, motivos, lentes_disponibles: !!lentes, marca_disponible: !!marca,
      alojada_url: slug ? `/${slug}/prisma/${proposito}` : null, comercio
    } };
  }
}

module.exports = PrismaUiForgeReflejo;
