'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { validarSchema } = require('../_shared/config-custodio');

// Categorías canónicas de escalada del Portal de llamada (H3).
const CATEGORIA = {
  CLIENTE: 'cliente',   // aviso al cliente (producto / día alternativo)
  DUENO: 'dueno'        // aviso al dueño (movimiento grande)
};

const PRIORIDAD = { ALTA: 'alta', MEDIA: 'media' };

// Regla de escalada por defecto — colgada de config.h3 (ajustable sin tocar código).
const DEFAULT_REGLA = {
  umbral_dia_lejano: 2,           // UMBRAL_LEJANO: días que definen "ajustado lejano"
  umbral_unidades_dueno: 3,       // cancelación/cambio de >=3 unidades → dueño
  no_disponible: { categoria: CATEGORIA.CLIENTE, prioridad: PRIORIDAD.ALTA },
  ajustado_lejano: { categoria: CATEGORIA.CLIENTE, prioridad: PRIORIDAD.MEDIA },
  movimiento_dueno: { categoria: CATEGORIA.DUENO, prioridad: PRIORIDAD.MEDIA }
};

// ---------------------------------------------------------------------------
// S1 · Criterio de escalada — decide si un resultado del motor abre canal humano.
// ---------------------------------------------------------------------------

// Calcula cuántos días hay entre la fecha solicitada y la propuesta.
const _diasEntre = (a, b) => {
  if (!a || !b) return Infinity;
  const da = new Date(a), db = new Date(b);
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.round((db - da) / 86400000);
};

const _evaluar = (resultado, regla) => {
  const r = resultado || {};
  if (r.tipo === 'no_disponible') {
    return { aviso: true, categoria: regla.no_disponible?.categoria ?? CATEGORIA.CLIENTE, prioridad: regla.no_disponible?.prioridad ?? PRIORIDAD.ALTA, motivo: 'no_disponible' };
  }
  if (r.tipo === 'ajustado' || r.tipo === 'ajustado_margen') {
    const dias = _diasEntre(r.fecha_solicitada, r.propuesta);
    if (dias >= regla.umbral_dia_lejano) {
      return { aviso: true, categoria: CATEGORIA.CLIENTE, prioridad: regla.ajustado_lejano?.prioridad ?? PRIORIDAD.MEDIA, motivo: 'ajustado_lejano', dias };
    }
    return { aviso: false, motivo: 'ajustado_cercano', dias };
  }
  // movimiento de unidades (cancelación o cambio)
  const unidades = r.movimiento?.unidades ?? r.unidades ?? 0;
  if (r.movimiento && unidades >= regla.umbral_unidades_dueno) {
    return { aviso: true, categoria: CATEGORIA.DUENO, prioridad: regla.movimiento_dueno?.prioridad ?? PRIORIDAD.MEDIA, motivo: 'movimiento_dueno', unidades };
  }
  return { aviso: false, motivo: 'self' };
};

// ---------------------------------------------------------------------------
// S2 · Porta-aviso — empaqueta el contexto accionable para el canal humano.
// ---------------------------------------------------------------------------
const _empaquetar = (resultado, cliente, aviso) => {
  const r = resultado || {};
  const c = cliente || {};
  return {
    categoria: aviso.categoria,
    prioridad: aviso.prioridad,
    motivo: aviso.motivo,
    cliente: {
      nombre: c.nombre || null,
      telefono: c.telefono || c.numero || null
    },
    pedido: {
      producto: r.producto_id || r.producto || null,
      cantidad: r.cantidad ?? 1,
      dia_solicitado: r.fecha_solicitada || null,
      dia_propuesto: r.propuesta || null
    },
    unidades_movidas: r.movimiento?.unidades ?? null,
    decision_pendiente: false,          // S5 (cierre) la vuelve true al abrir la decisión
    correlation_id: r.correlation_id || null
  };
};

class ConfluenciaH3Reflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'confluencia-h3';
    this.version = 'reflejo-0.1.0';
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onCriterioEscaladaRequest(e) { return this._atender(e, 'criterio_escalada', 'confluencia.h3.criterio.response', d => this._criterioEscalada(d)); }
  onPortaAvisoRequest(e)       { return this._atender(e, 'porta_aviso', 'confluencia.h3.porta_aviso.response', d => this._portaAviso(d)); }

  // ================= helpers =================
  async _regla(project_id) {
    const cfg = await this._leerJson(project_id, 'config/project.json');
    const h3 = cfg?.h3 || cfg?.confluencia?.h3 || {};
    return {
      umbral_dia_lejano: h3.umbral_dia_lejano ?? DEFAULT_REGLA.umbral_dia_lejano,
      umbral_unidades_dueno: h3.umbral_unidades_dueno ?? DEFAULT_REGLA.umbral_unidades_dueno,
      no_disponible: h3.no_disponible || DEFAULT_REGLA.no_disponible,
      ajustado_lejano: h3.ajustado_lejano || DEFAULT_REGLA.ajustado_lejano,
      movimiento_dueno: h3.movimiento_dueno || DEFAULT_REGLA.movimiento_dueno
    };
  }

  // ================= proyecciones =================
  async _criterioEscalada(input) {
    const error = validarSchema({ resultado: { tipo: 'object', requerido: true } }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    const regla = await this._regla(input.project_id);
    const aviso = _evaluar(input.resultado, regla);
    return { status: 200, data: aviso };
  }

  async _portaAviso(input) {
    const error = validarSchema({ resultado: { tipo: 'object', requerido: true }, cliente: { tipo: 'object', requerido: true } }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    const regla = await this._regla(input.project_id);
    const aviso = _evaluar(input.resultado, regla);
    if (!aviso.aviso) return { status: 200, data: { aviso: null, motivo: 'sin_escalada' } };
    const empaquetado = _empaquetar(input.resultado, input.cliente, aviso);
    return { status: 200, data: { aviso: empaquetado } };
  }
}

module.exports = ConfluenciaH3Reflejo;
