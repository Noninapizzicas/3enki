/**
 * contabilidad-analitica/motor-avisos — PUENTE (K2, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * LA PIEZA QUE CIERRA EL CIRCULO DE LOS AVISOS.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * PRODUCE el aviso (requisito 4 del dueño): conecta por EVENTO y ENTREGA el aviso a
 * `aviso-al-negocio` R1, que es quien lo hace llegar al negocio. Este modulo solo
 * PRODUCE; la ENTREGA es del puente R1 (no se pisan).
 *
 * CIRCULO:
 *   señales (revision_solicitada · cuadre_no_cuadra · plazo_declarado · fuente_faltante_declarada)
 *      → motor-avisos.producir  (PRODUCE)
 *      → aviso-al-negocio.entregar (ENTREGA)
 *      → contabilidad.aviso_entregado
 *   y ademas el hecho `contabilidad.aviso_producido` (lo escuchan aviso-al-negocio R1 e
 *   informe-accionable R2).
 *
 * R3 (honestidad de la escucha): el plan declara tambien escucha de
 * `contabilidad.presupuesto_fijado` (presupuesto) y `contabilidad.hecho_recibido`
 * (puerto-evento-vertical) — AMBOS emisores YA existen → SI se declaran. En cambio
 * `contabilidad.fuente_faltante_declarada` (declaracion-fuente-faltante) aun no tiene
 * emisor en el repo → NO se declara (daria cadena colgada).
 *
 * Invariante: dato ausente = desconocido. Sin SENAL declarada NO se inventa un aviso: se
 * declara ABIERTO (nada que producir) — un aviso fabricado de la nada es un aviso que miente.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia. RPC producir = ORDEN → ui_handler.
 * Ver hoja K2 del plan-construccion y diseno-oop.md (CLASE MotorAvisos).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las SEÑALES que producen un aviso. El `tipo` es DATO declarable; el emisor de cada
// señal se documenta (no se cablea ninguna regla de negocio oculta).
const TIPOS = new Set(['revision', 'cuadre', 'plazo', 'fuente', 'presupuesto', 'hecho', 'aviso', 'otro']);

class MotorAvisos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor-avisos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onProducirRequest(e) {
    return this._atender(e, 'producir', 'motor-avisos.producir.response', (d) => {
      const res = this._producir(d);
      if (res.status === 200) {
        // R2 · si PRODUCE, anuncia el HECHO: hay un aviso listo para entregar/incorporar.
        this.eventBus?.publish('contabilidad.aviso_producido', {
          project_id: res.data.project_id,
          aviso_id: res.data.aviso.aviso_id,
          tipo: res.data.aviso.tipo,
          severidad: res.data.aviso.severidad,
          titulo: res.data.aviso.titulo,
          detalle: res.data.aviso.detalle,
          origen: res.data.aviso.origen,
          correlation_id: d.correlation_id
        });
        // SUBE (best-effort por EVENTO) la ENTREGA al puente R1 (aviso-al-negocio).
        this.eventBus?.publish('aviso-al-negocio.entregar.request', {
          project_id: res.data.project_id,
          aviso: res.data.aviso,
          correlation_id: d.correlation_id
        });
      } else {
        // Si la señal es de tipo señal-de-aviso y no hay aviso → par de fallo determinista.
        this.eventBus?.publish('motor-avisos.producir.failed', res);
      }
      return res;
    });
  }

  // ── handlers de DOMINIO (fire-and-forget): cada señal produce su aviso ──
  // Una EXCEPCION SIEMPRE genera aviso (aviso-revision A8.1 la solicito).
  onRevisionSolicitada(e) { return this._producirDeSenal(e, 'revision'); }
  // El cuadre que NO cuadra avisa (aviso-cuadre C6).
  onCuadreNoCuadra(e) { return this._producirDeSenal(e, 'cuadre'); }
  // El plazo declarado dispara el aviso proactivo (calendario-fiscal D6).
  onPlazoDeclarado(e) { return this._producirDeSenal(e, 'plazo'); }
  // El presupuesto fijado se incorpora como aviso informativo (presupuesto J3).
  onPresupuestoFijado(e) { return this._producirDeSenal(e, 'presupuesto'); }
  // Un hecho recibido se puede querer avisar: SOLO se produce si el hecho lo declara.
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const hecho = d.hecho && typeof d.hecho === 'object' ? d.hecho : null;
    if (!hecho) return;
    // No se inventa un aviso para cada hecho: solo si el hecho pide aviso explicitamente.
    if (!(hecho.aviso === true || (hecho.aviso && typeof hecho.aviso === 'object'))) return;
    const detalle_aviso = hecho.aviso && typeof hecho.aviso === 'object' ? hecho.aviso : {};
    return this._producirDeSenal({ data: { project_id: d.project_id, tipo: 'hecho', titulo: detalle_aviso.titulo, detalle: detalle_aviso.detalle, severidad: detalle_aviso.severidad, origen: d.origen || d.vertical, correlation_id: d.correlation_id } }, 'hecho');
  }

  // Comun a los handlers de dominio: produce localmente y ANUNCIA el hecho si hay señal.
  _producirDeSenal(e, tipo) {
    const d = (e && (e.data || e)) || {};
    let res;
    try {
      res = this._producir({ ...d, tipo: d.tipo != null ? d.tipo : tipo });
    } catch (err) {
      this.logger?.error(`${this.name}.senal.error`, { tipo, error: err.message });
      return;
    }
    // Sin señal NO se inventa: no hay hecho que anunciar (no se publica un aviso vacio).
    if (res.status !== 200 || !res.data || !res.data.aviso) return;
    this.eventBus?.publish('contabilidad.aviso_producido', {
      project_id: res.data.project_id,
      aviso_id: res.data.aviso.aviso_id,
      tipo: res.data.aviso.tipo,
      severidad: res.data.aviso.severidad,
      titulo: res.data.aviso.titulo,
      detalle: res.data.aviso.detalle,
      origen: res.data.aviso.origen,
      correlation_id: d.correlation_id
    });
    // SUBE la ENTREGA al puente R1.
    this.eventBus?.publish('aviso-al-negocio.entregar.request', {
      project_id: res.data.project_id,
      aviso: res.data.aviso,
      correlation_id: d.correlation_id
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _producir(input) → { status, data }  ·  PRODUCE el aviso (no lo entrega)
  // ══════════════════════════════════════════════════════════════════════
  _producir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const tipo = this._tipo(input);

    // La SEÑAL: el dato que dispara el aviso. Sin señal NO se inventa nada (dato ausente = desconocido).
    const senal = this._senal(input);
    const tieneSenal = senal && Object.keys(senal).length > 0;

    const aviso = {
      aviso_id: `aviso_${pid}_${crypto.randomUUID().slice(0, 8)}`,
      tipo,
      severidad: input.severidad != null ? String(input.severidad)
        : (senal && senal.severidad != null ? String(senal.severidad) : 'info'),
      titulo: input.titulo != null ? String(input.titulo)
        : (senal && senal.titulo != null ? String(senal.titulo) : null),
      detalle: input.detalle != null ? String(input.detalle)
        : (senal && senal.detalle != null ? String(senal.detalle) : null),
      // El ORIGEN declarado (que señal lo disparo). No se inventa: si no viene, se declara.
      origen: input.origen != null ? String(input.origen) : tipo,
      ref: input.ref != null ? String(input.ref)
        : (senal && senal.ref != null ? String(senal.ref) : null),
      // PRODUCIDO, aun no ENTREGADO (la entrega es de aviso-al-negocio R1).
      producido: true,
      entregado: false,
      producido_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'motor-avisos',
        aviso,
        producido: true,
        // La ENTREGA la hace R1 (aviso-al-negocio): aqui NO se finge entregado.
        entregador: 'aviso-al-negocio',
        senal_presente: tieneSenal,
        senal: tieneSenal ? senal : null,
        abierto: {
          senal: tieneSenal ? null : 'no llego ninguna senal declarada: no se inventa un aviso (nada que producir)',
          titulo: aviso.titulo ? null : 'el aviso no declaro titulo (se anota el hueco, no se inventa)'
        }
      }
    };
  }

  // El tipo del aviso: declarado, o inferido de la señal. Nunca una constante oculta de negocio.
  _tipo(input) {
    const raw = input.tipo != null ? String(input.tipo).toLowerCase().trim() : '';
    if (TIPOS.has(raw)) return raw;
    return 'aviso';
  }

  // La señal: lo DECLARADO en el input, o el hecho/objeto que venga. Ausente → {} (hueco).
  _senal(input = {}) {
    if (input.senal && typeof input.senal === 'object') return input.senal;
    if (input.hecho && typeof input.hecho === 'object') return input.hecho;
    // Cualquier dato declarado cuenta como señal (el aviso no se inventa si NO hay ninguno).
    const declarado = {};
    for (const k of ['titulo', 'detalle', 'severidad', 'ref', 'motivo', 'causa', 'importe']) {
      if (input[k] !== undefined && input[k] !== null) declarado[k] = input[k];
    }
    return declarado;
  }

  // ── Tools ──
  toolProducir(params) { return this._producir(params); }
}

module.exports = MotorAvisos;
