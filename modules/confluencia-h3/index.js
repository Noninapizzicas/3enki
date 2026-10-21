'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { validarSchema } = require('../_shared/config-custodio');

// Store del rastro de decisiones del Portal de llamada (S4+S5) — por proyecto.
const STORE_PATH = '/confluencia-h3/decisiones.json';

// Decisiones que el dueño puede cerrar sobre un aviso (S5).
const DECISIONES_VALIDAS = new Set(['aceptar', 'rechazar', 'proponer_alternativa']);

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
  onAplicarDecisionRequest(e)  { return this._atender(e, 'aplicar_decision', 'confluencia.h3.aplicar_decision.response', d => this._aplicarDecision(d)); }

  // S3 · Entrega — fire-and-forget: escucha el aviso emitido y lo entrega a UI + chat.
  onAvisoEmitido(e) {
    const d = (e && e.data) || e || {};
    this._entregarAviso(d).catch(err => this.logger?.error(`${this.name}.reflejo.entrega.failed`, { error: err.message }));
  }

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
    // S3 · Entrega — el aviso empaquetado se emite al bus; S3 (onAvisoEmitido) lo entrega a UI + chat.
    this.eventBus?.publish('confluencia.h3.aviso_emitido', {
      aviso: empaquetado,
      project_id: input.project_id,
      correlation_id: empaquetado.correlation_id || crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });
    this.metrics?.increment('confluencia-h3.reflejo.aviso_emitido', { categoria: empaquetado.categoria });
    return { status: 200, data: { aviso: empaquetado } };
  }

  // ================= S3 · Entrega a UI + chat =================
  // Entrega el aviso a los dos canales de pantalla: UI (evento al frontend) y chat (Hermes).
  // Fire-and-forget: nunca bloquea el flujo; cada canal emite su estado en aviso_entregado.
  async _entregarAviso(d) {
    const aviso = d.aviso || {};
    const project_id = d.project_id;
    const correlation_id = d.correlation_id || aviso.correlation_id || crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const texto = this._formatearAviso(aviso);

    // Canal 1 · UI — evento backend→frontend por core/*/events/{domain}/{action}.
    // El frontend se suscribe a confluencia.h3.aviso_entregado (o al topic de avisos) y lo pinta.
    this.eventBus?.publish('confluencia.h3.aviso_entregado', {
      aviso_id: correlation_id,
      canal: 'ui',
      estado: 'entregado',
      aviso,
      texto,
      project_id,
      correlation_id,
      timestamp
    });

    // Canal 2 · Chat — publica el aviso como mensaje del sistema al chat Hermes.
    // chat.message.saved es el trigger del razonamiento; el compañero lo recoge y responde.
    if (this.eventBus?.publish) {
      this.eventBus.publish('chat.message.saved', {
        correlation_id,
        conversation_id: d.conversation_id || null,
        project_id,
        user_id: 'sistema-h3',
        channel: 'sistema',
        channel_context: { origen: 'confluencia-h3', tipo: 'aviso_escalada' },
        message_id: `h3-${correlation_id}`,
        user_message: texto,
        timestamp
      });
    }

    this.metrics?.increment('confluencia-h3.reflejo.aviso_entregado', { canal: 'ui+chat' });
    return { status: 200, data: { entregado: true, canales: ['ui', 'chat'] } };
  }

  // Formatea el aviso a texto legible para el chat / pantalla.
  _formatearAviso(aviso) {
    const c = aviso.cliente || {};
    const p = aviso.pedido || {};
    const quien = aviso.categoria === 'dueno' ? 'Dueño' : 'Cliente';
    const motivo = aviso.motivo || 'escalada';
    const lineas = [
      `[AVISO ${quien.toUpperCase()} · ${aviso.prioridad || 'media'}]`,
      `Motivo: ${motivo}`,
      c.nombre ? `Cliente: ${c.nombre}` : null,
      p.producto ? `Producto: ${p.producto}` : null,
      p.cantidad ? `Cantidad: ${p.cantidad}` : null,
      p.dia_solicitado ? `Día solicitado: ${p.dia_solicitado}` : null,
      p.dia_propuesto ? `Día propuesto: ${p.dia_propuesto}` : null,
      aviso.unidades_movidas != null ? `Unidades movidas: ${aviso.unidades_movidas}` : null
    ].filter(Boolean);
    return lineas.join('\n');
  }

  // S5 · Cierre — la decisión del dueño modifica el flujo y deja rastro auditable.
  async _aplicarDecision(input) {
    const error = validarSchema(
      { correlation_id: { tipo: 'string', requerido: true }, decision: { tipo: 'string', requerido: true } },
      input
    );
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    if (!DECISIONES_VALIDAS.has(input.decision)) {
      return { status: 400, error: 'INVALID_INPUT', message: `decision debe ser una de: ${[...DECISIONES_VALIDAS].join(', ')}`, field: 'decision' };
    }

    const registro = {
      aviso_correlation_id: input.aviso?.correlation_id || input.correlation_id || input.aviso_correlation_id || null,
      decision: input.decision,
      motivo: input.motivo || null,
      alternativas: input.alternativa ? { dia: input.alternativa.dia || null, producto: input.alternativa.producto || null } : null,
      decidido_por: input.user_id || 'dueno',
      decidido_en: new Date().toISOString()
    };

    // Persistir el rastro (S4) — best-effort sobre el store por proyecto.
    const existia = await this._leerJson(input.project_id, STORE_PATH);
    if (existia) {
      await this._editarJson(input.project_id, STORE_PATH, [
        { op: 'add', path: '/decisiones/-', value: registro }
      ]);
    } else {
      await this._rpc('fs.write.request', { project_id: input.project_id, path: STORE_PATH, content: JSON.stringify({ decisiones: [registro] }, null, 2) });
    }

    // EMITIR — el evento que "modifica el flujo": el bus lo recoge (propiocepción / portal / quien ejecuta el cambio).
    this.eventBus?.publish('confluencia.h3.decision_aplicada', {
      correlation_id: registro.aviso_correlation_id || crypto.randomUUID(),
      timestamp: registro.decidido_en,
      ...registro
    });

    this.metrics?.increment('confluencia-h3.reflejo.decision_aplicada', { decision: input.decision });
    return { status: 200, data: { aplicada: true, registro } };
  }
}

module.exports = ConfluenciaH3Reflejo;
