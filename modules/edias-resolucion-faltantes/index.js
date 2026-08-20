'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-resolucion-faltantes — REFLEJO JS (orquestador, mitad determinista).
 * El ORQUESTADOR de la respuesta del dueño: "ante obstáculos, soluciones".
 * Consume edias.presupuesto.incompleto (emitido por edias-presupuestador cuando
 * el costeo declara un faltante) y RESUELVE el faltante cableando los órganos
 * que Enki YA tiene vivos — NO construye búsqueda ni correo, los CONDUCE:
 *
 *   1) buscar_web (crawl4rs / SearXNG)  → candidatos de precio de mercado
 *   2) leer_web (crawl4rs)              → ficha del proveedor si la web basta
 *   3) cartero.enviar (local.gmail)     → pregunta al proveedor si la web no basta
 *   4) el dato resuelto vuelve con SU FUENTE; lo no resuelto se ELEVA al admin
 *
 * Regla de honestidad (espejo del freno anti-invento): un faltante SOLO se
 * declara resuelto si el dato llegó con fuente verificable. Sin fuente, se
 * eleva — nunca se maquilla el precio.
 */

class EdiasResolucionFaltantesReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-resolucion-faltantes';
    this.version = '0.1.0';
    this._historial = []; // [{presupuesto_id, faltante, resultado, fuente, ts}]
  }

  // ── handlers ──
  // Fire-and-forget: reacciona al incompleto publicado por el presupuestador.
  onPresupuestoIncompleto(e) { return this._resolver(e); }
  // RPC: disparo manual de resolución (para probar / re-ejecutar un faltante).
  onResolverRequest(e)       { return this._atender(e, 'resolver', 'edias.resolucion.resolver.response', d => this._resolver({ data: d })); }
  // RPC: listar historial de resoluciones.
  onHistorialRequest(e)      { return this._atender(e, 'historial', 'edias.resolucion.historial.response', () => ({ status: 200, data: this._historial.slice(-50) })); }

  // ── ORQUESTADOR: resuelve cada faltante con los órganos ──
  async _resolver(event) {
    const d = (event && event.data) || event || {};
    const { presupuesto_id, faltantes = [], correlation_id } = d;
    if (!presupuesto_id || faltantes.length === 0) return;

    const resultados = [];
    for (const faltante of faltantes) {
      const resuelto = await this._resolverUno(presupuesto_id, faltante, correlation_id);
      resultados.push(resuelto);
      this._historial.push({ presupuesto_id, faltante, ...resuelto, ts: new Date().toISOString() });
    }

    const resueltos = resultados.filter(r => r.estado === 'resuelto');
    const pendientes = resultados.filter(r => r.estado === 'pendiente_proveedor');
    const elevados = resultados.filter(r => r.estado === 'elevado');

    // Emite el resultado agregado: lo resuelto vuelve al escandallo con fuente,
    // lo pendiente espera respuesta del proveedor, lo elevado pide la decisión del admin.
    if (resueltos.length > 0) {
      this.eventBus?.publish('edias.faltante.resuelto', {
        presupuesto_id, correlation_id, resueltos,
      });
    }
    if (pendientes.length > 0) {
      this.eventBus?.publish('edias.faltante.pendiente_proveedor', {
        presupuesto_id, correlation_id, pendientes,
      });
    }
    if (elevados.length > 0) {
      this.eventBus?.publish('edias.faltante.elevado', {
        presupuesto_id, correlation_id, elevados,
        para: 'admin', // la política de precios la estipula el admin del taller
      });
    }
    this.metrics?.increment('edias-resolucion-faltantes.reflejo.served', {
      op: 'resolver', resueltos: resueltos.length, elevados: elevados.length,
    });
  }

  // ── resuelve UN faltante: web → proveedor → elevar ──
  async _resolverUno(presupuesto_id, faltante, correlation_id) {
    const tipo = faltante.tipo;
    const material_id = faltante.material_id;

    // 1) Busca en la web (crawl4rs / SearXNG) — precio de mercado del material.
    const web = await this._rpc('buscar_web.request', {
      query: this._queryDe(faltante), limit: 5,
    });
    const candidato = this._primerCandidato(web);

    // 2) Si hay candidato con precio → resuelto CON FUENTE.
    if (candidato) {
      return {
        estado: 'resuelto',
        tipo, material_id,
        dato: { precio: candidato.precio, unidad: 'por_gramo' },
        fuente: { organo: 'crawl4rs', url: candidato.url, titulo: candidato.titulo },
      };
    }

    // 3) Sin candidato → pregunta al proveedor (cartero / local.gmail).
    const correo = await this._rpc('cartero.enviar.request', {
      asunto: `Solicitud de precio — material ${material_id || 'desconocido'}`,
      cuerpo: this._cuerpoCorreo(faltante, presupuesto_id),
    });

    // 4) El correo se envió con ack (messageId) → pendiente de respuesta del proveedor.
    if (correo && correo.status === 200 && correo.data?.messageId) {
      return {
        estado: 'pendiente_proveedor',
        tipo, material_id,
        fuente: { organo: 'cartero', messageId: correo.data.messageId },
      };
    }

    // 5) Ni web ni correo → se ELEVA al admin (nunca se inventa el precio).
    return {
      estado: 'elevado',
      tipo, material_id,
      motivo: 'sin_fuente_verificable',
      para: 'admin',
    };
  }

  // ── query de búsqueda según el tipo de faltante ──
  _queryDe(faltante) {
    if (faltante.tipo === 'precio_material') {
      return `precio filamento ${faltante.material_id || ''} por kg 2026`.trim();
    }
    if (faltante.tipo === 'gramos_pieza') {
      return `peso gramos pieza impresion 3D ${faltante.pieza_id || ''}`.trim();
    }
    return `precio material impresion 3D ${faltante.material_id || ''}`.trim();
  }

  // ── extrae el primer candidato con precio de la respuesta de buscar_web ──
  _primerCandidato(web) {
    const resultados = web?.data?.resultados || web?.data?.results || [];
    for (const r of resultados) {
      const precio = this._extraerPrecio(r);
      if (precio != null) {
        return { precio, url: r.url, titulo: r.titulo || r.title };
      }
    }
    return null;
  }

  // ── intenta extraer un número de precio de un resultado (heurística honesta) ──
  _extraerPrecio(r) {
    const texto = [r.precio, r.price, r.resumen, r.snippet, r.titulo, r.title]
      .filter(Boolean).join(' ');
    const m = texto.match(/(\d+(?:[.,]\d+)?)\s*[€$]/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  }

  _cuerpoCorreo(faltante, presupuesto_id) {
    return `Buenos días,\n\nEstamos presupuestando una pieza (presupuesto ${presupuesto_id}) y necesitamos el precio de ${faltante.material_id || 'un material'}.\n\n¿Podrían indicarnos su tarifa por gramo/kg?\n\nGracias.`;
  }
}

module.exports = EdiasResolucionFaltantesReflejo;
