/**
 * prisma/formulador — el ACTOR FUZZY de la parcela compuestos, en forma PRISMA.
 *
 * Micro-agentes perspectiva-c, event-driven (NO agent-framework viejo, NO página):
 * cada handler = REFLEJO que hidrata (determinista) + persiste, y el paso fuzzy es UNA
 * llamada llm.complete.request con su guión-prompt inline + contexto → JSON TIPADO validado.
 * Si el LLM no cumple el contrato → error declarado. NUNCA inventa (cantidad ausente → null).
 *
 *   RECONCILIAR  nombre crudo + candidatos → {accion: usar|crear|preguntar}
 *   MODELAR      texto de formulación → {nombre, componentes[]} → reconcilia → persiste compuesto
 *   CLASIFICAR   item + eje → {familia, subfamilia, grupo, propuesta_nueva?}
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const nowISO = () => new Date().toISOString();

// ── guiones-prompt (el "papel" de cada micro-agente; self-contained) ──
const GUION_RECONCILIAR =
  'Eres un RECONCILIADOR de insumos. Recibes un nombre crudo y una lista de candidatos existentes ' +
  '(con id, nombre y score léxico). Decide si el crudo ES uno de ellos, aunque cambie por typo, idioma ' +
  'o sinónimo (tomate=tomato, aceituna=oliva). Reglas: si uno es claramente el MISMO → accion "usar" con su insumo_id. ' +
  'Si NINGUNO es el mismo → accion "crear". Si hay duda de si es una VARIANTE distinta o el mismo (tomate vs tomate frito) → ' +
  'accion "preguntar". NUNCA inventes un id que no esté en candidatos. Responde SOLO JSON: ' +
  '{"accion":"usar|crear|preguntar","insumo_id":<id o null>,"motivo":"<breve>"}';

const GUION_MODELAR =
  'Eres un MODELADOR de formulaciones. Recibes texto crudo de una receta/compuesto. Extrae el NOMBRE del ' +
  'compuesto y sus COMPONENTES con cantidad y unidad. Si una cantidad o unidad NO aparece, ponla null ' +
  '(NO la inventes). Responde SOLO JSON: {"nombre":"<nombre>","componentes":[{"nombre_crudo":"<ingrediente>",' +
  '"cantidad":<numero o null>,"unidad":"<g|ml|ud|hoja|... o null>"}]}';

const GUION_CLASIFICAR =
  'Eres un CLASIFICADOR. Recibes un item, un EJE de negocio (compra|fabricacion|venta) y la taxonomía ' +
  'existente de ese eje (lista de familias>subfamilias>grupos). Clasifica el item reutilizando la taxonomía. ' +
  'Si NO encaja en ninguna, PROPÓN una nueva y marca propuesta_nueva true. Responde SOLO JSON: ' +
  '{"familia":"<f>","subfamilia":"<sf o null>","grupo":"<g o null>","propuesta_nueva":<true|false>}';

class PrismaFormuladorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'formulador';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onReconciliarRequest(e) { return this._atender(e, 'reconciliar', 'formulador.reconciliar.response', d => this._reconciliar(d)); }
  onModelarRequest(e)     { return this._atender(e, 'modelar',     'formulador.modelar.response',     d => this._modelar(d)); }
  onClasificarRequest(e)  { return this._atender(e, 'clasificar',  'formulador.clasificar.response',  d => this._clasificar(d)); }

  // ── PURO: extrae el JSON del completado (tolera fences ```json y texto alrededor) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // ── el paso fuzzy: 1 llamada llm.complete headless con el guión + contexto ──
  async _fuzzy(system, contexto) {
    const resp = await this._rpc('llm.complete.request', {
      system, messages: [{ role: 'user', content: JSON.stringify(contexto) }], tools: [], settings: { temperature: 0 }
    }, { timeout_ms: 30000 });
    if (!resp || resp.status >= 400) return null;
    return this._parse(resp);
  }

  // ── PUROS: validadores de contrato por micro-agente ──
  _validarReconciliar(o, candidatos) {
    if (!o || !['usar', 'crear', 'preguntar'].includes(o.accion)) return null;
    if (o.accion === 'usar' && !(candidatos || []).some(c => c.id === o.insumo_id)) return null; // no inventa ids
    return { accion: o.accion, insumo_id: o.accion === 'usar' ? o.insumo_id : null, motivo: String(o.motivo || '').slice(0, 200) };
  }
  _validarModelar(o) {
    if (!o || !o.nombre || !Array.isArray(o.componentes) || o.componentes.length === 0) return null;
    return { nombre: String(o.nombre).trim(),
      componentes: o.componentes.filter(c => c && c.nombre_crudo).map(c => ({
        nombre_crudo: String(c.nombre_crudo).trim(),
        cantidad: (typeof c.cantidad === 'number' && c.cantidad > 0) ? c.cantidad : null,   // ausente → null, no inventa
        unidad: c.unidad || null })) };
  }
  _validarClasificar(o) {
    if (!o || !o.familia) return null;
    return { familia: String(o.familia).trim(), subfamilia: o.subfamilia || null, grupo: o.grupo || null,
      propuesta_nueva: !!o.propuesta_nueva };
  }

  // ── RECONCILIAR (fuzzy sobre lo que el reflejo insumos.buscar no pilla: sinónimo/idioma) ──
  async _reconciliar({ project_id, nombre_crudo, candidatos } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!nombre_crudo) return this._invalid('nombre_crudo');
    // hidrata candidatos si no vienen (determinista)
    let cand = candidatos;
    if (!Array.isArray(cand)) {
      const b = await this._rpc('insumos.buscar.request', { project_id, nombre: nombre_crudo });
      cand = (b && b.status === 200 && b.data?.candidatos) ? b.data.candidatos : [];
    }
    const o = this._validarReconciliar(await this._fuzzy(GUION_RECONCILIAR, { nombre_crudo, candidatos: cand }), cand);
    if (!o) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el reconciliador no devolvió una decisión válida', { nombre_crudo });
    return { status: 200, data: o };
  }

  // ── MODELAR (texto → compuesto), reconcilia cada componente y PERSISTE ──
  async _modelar({ project_id, crudo } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!crudo || typeof crudo !== 'string') return this._invalid('crudo');
    const modelo = this._validarModelar(await this._fuzzy(GUION_MODELAR, { crudo }));
    if (!modelo) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el modelador no estructuró la formulación', { crudo: crudo.slice(0, 80) });

    // reconcilia cada componente → ref canónica (o crea) · cantidad null → pregunta_abierta
    const componentes = [], abiertas = [];
    for (const c of modelo.componentes) {
      const rec = await this._reconciliar({ project_id, nombre_crudo: c.nombre_crudo });
      let ref = null;
      if (rec.status === 200 && rec.data.accion === 'usar') ref = rec.data.insumo_id;
      else if (rec.status === 200 && rec.data.accion === 'crear') {
        const cr = await this._rpc('insumos.crear.request', { project_id, nombre: c.nombre_crudo });
        ref = (cr && cr.data?.insumo?.id) || null;
      } else { abiertas.push({ campo: 'insumo', valor: c.nombre_crudo, motivo: 'reconciliación ambigua → confirmar' }); continue; }
      if (c.cantidad == null) abiertas.push({ campo: 'cantidad', valor: c.nombre_crudo, motivo: 'cantidad ausente' });
      componentes.push({ ref, cantidad: c.cantidad, unidad: c.unidad });
    }
    // persiste el compuesto (solo con lo resuelto); avisa de lo abierto
    const listos = componentes.filter(c => c.ref && c.cantidad != null);
    let compuesto_id = null;
    if (listos.length) {
      const cr = await this._rpc('compuestos.crear.request', { project_id, nombre: modelo.nombre, componentes: listos });
      compuesto_id = cr?.data?.compuesto?.id || null;
    }
    if (abiertas.length) this.eventBus?.publish?.('formulador.faltan_datos', { project_id, nombre: modelo.nombre, abiertas, timestamp: nowISO() });
    return { status: 200, data: { nombre: modelo.nombre, compuesto_id, componentes, preguntas_abiertas: abiertas } };
  }

  // ── CLASIFICAR ──
  async _clasificar({ project_id, item_nombre, eje, taxonomia } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!item_nombre) return this._invalid('item_nombre');
    const o = this._validarClasificar(await this._fuzzy(GUION_CLASIFICAR, { item: item_nombre, eje: eje || 'venta', taxonomia: taxonomia || [] }));
    if (!o) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el clasificador no devolvió una clasificación válida', { item_nombre });
    return { status: 200, data: o };
  }
}

module.exports = PrismaFormuladorReflejo;
