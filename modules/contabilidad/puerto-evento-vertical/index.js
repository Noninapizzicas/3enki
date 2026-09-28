/**
 * contabilidad/puerto-evento-vertical — PUENTE STATELESS (A1, hoja del plan).
 *
 * PUERTA de los hechos ya emitidos por las verticales (VENTA, COBRO, PAGO,
 * COMPRA, CONSUMO, CIERRE_JORNADA, RECTIFICATIVO). Contabilidad LEE, NO IMPONE:
 * la fuente manda en formato, granularidad y ritmo. El puerto valida SOLO la
 * forma minima de entrada (que el hecho sea direccionable), nunca el contenido.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia; el contrato minimo por
 * vertical llega por EVENTO (contabilidad.contrato_declarado de
 * contrato-hecho-minimo) y se cachea en memoria — dependencia entre modulos por
 * evento, NUNCA require cruzado. El puerto es REEMPLAZABLE por fuente
 * (_reconectar). Si NO hay fuente para un hecho esperado → se DECLARA el hueco
 * (_declararHueco, senal a A15), jamas se fuerza a la fuente a producirlo.
 * Publica contabilidad.hecho_admitido (+ contabilidad.hecho.admitir.failed par
 * determinista). NO REUTILIZA: ningun modulo del inventario recibe hechos
 * heterogeneos de otras verticales; un adaptador por fuente se pone en el sitio
 * de despliegue.
 *
 * Ver hoja A1 del diseno-oop y bloque `puerto-evento-vertical` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoEventoVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-evento-vertical';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: solo cache en memoria del minimo por vertical (por EVENTO)
    // y de las reconexiones declaradas. Nada que persistir.
    this.project_id = null;
    this._minimos = new Map();     // vertical -> [campos] (de contabilidad.contrato_declarado)
    this._puertos = new Map();     // fuente -> estado del puerto (reemplazable)
  }

  async onUnload() { return super.onUnload(); }

  // project.activated — puente sin estado: solo registra el proyecto activo.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    return { status: 200, data: { project_id: this.project_id } };
  }

  // Fire-and-forget: contrato-hecho-minimo declaro el minimo de una vertical.
  // Dependencia por EVENTO (sin require cruzado): el puerto se hidrata el minimo.
  onContratoDeclarado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.vertical) return null;
    this._minimos.set(d.vertical, Array.isArray(d.campos) ? d.campos : []);
    this.logger?.info(`${this.name}.contrato_cacheado`, { vertical: d.vertical });
    return { status: 200, data: { vertical: d.vertical, campos: this._minimos.get(d.vertical) } };
  }

  // ── handler RPC ──
  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'contabilidad.hecho.admitir.response', async (d) => {
      const res = this._admitir(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.hecho_admitido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.hecho.admitir.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (puente stateless) ──
  // admitir(hecho) -> ok — valida la forma minima de entrada, NO el contenido.
  _admitir(input) {
    const pid = (input && input.project_id) || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = input && input.hecho;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');
    const vertical = hecho.vertical;
    if (!vertical) return this._invalid('hecho.vertical');

    // Forma minima base: direccionable (vertical + algo de payload). El CONTENIDO
    // no se juzga aqui (eso es del normalizador / contrapartida).
    const tieneCarga = hecho.payload !== undefined || hecho.datos !== undefined || hecho.importe !== undefined;
    if (!tieneCarga) return this._invalid('hecho.payload');

    // Si el minimo de esa vertical fue declarado, se calculan faltantes como
    // ADVERTENCIA (no como bloqueo: contabilidad LEE, no impone). Lo que falte
    // seguira su camino (incompleto → cola-revision).
    const minimo = this._minimos.get(vertical) || [];
    const fuente = hecho.payload !== undefined ? hecho.payload : (hecho.datos || hecho);
    const faltantes = minimo.filter((c) => fuente[c] === undefined || fuente[c] === null || fuente[c] === '');

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        admitido: true,
        faltantes,
        incompleto: faltantes.length > 0,
        contrato_aplicado: minimo.length > 0
      }
    };
  }

  // reconectar(fuente) — el puerto es REEMPLAZABLE, la fuente manda.
  _reconectar(input) {
    const fuente = input && input.fuente;
    if (!fuente) return this._invalid('fuente');
    const estado = {
      fuente,
      adaptador: (input && input.adaptador) || null,
      conectado: true,
      reconectado_en: new Date().toISOString()
    };
    this._puertos.set(fuente, estado);
    return { status: 200, data: { project_id: this.project_id, puerto: estado } };
  }

  // declararHueco(fuente) — si no hay fuente -> senal a A15, NUNCA se fuerza.
  _declararHueco(input) {
    const fuente = (input && input.fuente) || null;
    const vertical = (input && input.vertical) || null;
    if (!vertical) return this._invalid('vertical');
    // Una fuente es "faltante" si no hay puerto conectado para ella.
    const hay = fuente ? this._puertos.has(fuente) : false;
    return {
      status: 200,
      data: {
        project_id: (input && input.project_id) || this.project_id,
        fuente,
        vertical,
        hueco: !hay,
        accion: hay ? 'NINGUNA' : 'DECLARAR_HUECO_A15',
        forzado: false
      }
    };
  }

  // ── Tools ──
  toolAdmitir(params) { return this._admitir(params); }
  toolReconectar(params) { return this._reconectar(params); }
  toolDeclararHueco(params) { return this._declararHueco(params); }
}

module.exports = PuertoEventoVertical;
