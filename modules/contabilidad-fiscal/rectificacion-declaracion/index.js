/**
 * contabilidad-fiscal/rectificacion-declaracion — CUSTODIO CON PERSISTENCIA (D14, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * EL CAMINO DE CORRECCION POSTERIOR A LA PRESENTACION. SINGLE-WRITER POR PARCELA.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Cuando una declaracion YA presentada hay que corregirla (complementaria o sustitutiva),
 * se entra por AQUI — no se edita la presentacion original. Es el <> de B5 (asiento-ajuste)
 * en el eje fiscal: B5 corrige el LIBRO, este modulo corrige la DECLARACION.
 *
 * Invariantes:
 *  - UN ESCRITOR por parcela (guard de rol RECTIFICACION_DECLARACION; segundo escritor → 403).
 *  - APPEND-ONLY: cada rectificacion se APILA con su secuencia. NADA se borra, NADA se
 *    sobrescribe: la declaracion original queda INTACTA; rectificar = AÑADIR una correccion.
 *  - SIN declaracion original o sin motivo NO se rectifica (dato ausente = desconocido).
 *  - IDEMPOTENTE por clave: la misma rectificacion no se apila dos veces (at-least-once del bus).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al rectificar publica `contabilidad.declaracion_rectificada` (el hecho
 * que cierra el circulo: lo consume estado-presentacion-fiscal). Y SUBE por EVENTO el avance de
 * presentacion (estado-presentacion-fiscal.avanzar.request) — la declaracion corregida vuelve al
 * circuito de presentacion; este modulo NO presenta.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * RPC rectificar es CLASE ORDEN → SÍ lleva ui_handler.
 * Ver hoja D14 del plan-construccion y diseno-oop.md (CLASE RectificacionDeclaracion).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// El rol UNICO con permiso de escritura en esta parcela.
const ROL_ESCRITOR = 'RECTIFICACION_DECLARACION';

class RectificacionDeclaracion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'rectificacion-declaracion';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, rectificaciones: [append-only], claves:Set }
    this._rectificaciones = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'rectificacion-declaracion.json',
      dir: '/contabilidad/rectificacion-declaracion',
      snapshot: (pid) => {
        const d = this._rectificaciones.get(pid);
        if (!d) return null;
        return { project_id: pid, esquema: d.esquema, rectificaciones: d.rectificaciones };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const rectificaciones = Array.isArray(data.rectificaciones) ? data.rectificaciones : [];
        const claves = new Set(rectificaciones.map((r) => r && r.clave).filter(Boolean));
        this._rectificaciones.set(pid, {
          esquema: data.esquema || 'contabilidad-rectificacion-declaracion-v1',
          rectificaciones,
          claves
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela de rectificaciones del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC unico: rectificar (ORDEN → ui_handler panel) ──
  onRectificarRequest(e) {
    return this._atender(e, 'rectificar', 'rectificacion-declaracion.rectificar.response', (d) => {
      const res = this._rectificar(d);
      if (res.status === 200 && res.data && res.data.rectificada) {
        // R2 · si ESCRIBE, anuncia el HECHO: una declaracion quedo rectificada.
        this.eventBus?.publish('contabilidad.declaracion_rectificada', {
          project_id: res.data.project_id,
          rectificacion_id: res.data.rectificacion.rectificacion_id,
          clave: res.data.rectificacion.clave,
          tipo: res.data.rectificacion.tipo,
          declaracion: res.data.rectificacion.declaracion,
          motivo: res.data.rectificacion.motivo,
          correlation_id: d.correlation_id
        });
        // SUBE (best-effort por EVENTO) el avance de presentacion: la declaracion corregida
        // vuelve al circuito de presentacion. RectificacionDeclaracion NO presenta.
        this.eventBus?.publish('estado-presentacion-fiscal.avanzar.request', {
          project_id: res.data.project_id,
          declaracion: res.data.rectificacion.declaracion,
          tipo: res.data.rectificacion.tipo,
          rectificacion_id: res.data.rectificacion.rectificacion_id,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        // Par de fallo determinista.
        this.eventBus?.publish('rectificacion-declaracion.rectificar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _rectificar(input) → { status, data }  ·  APILA una correccion
  // ══════════════════════════════════════════════════════════════════════
  _rectificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Guard de UN escritor: solo el rol de esta parcela rectifica.
    if (input.rol != null && String(input.rol) !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        `solo el rol ${ROL_ESCRITOR} rectifica declaraciones (otro escritor → 403)`,
        { project_id: pid, rol: input.rol });
    }

    // Sin la declaracion original NO se rectifica (no se corrige lo que no se declaro).
    const declaracion = input.declaracion !== undefined ? input.declaracion
      : (input.original !== undefined ? input.original : (input.modelo !== undefined ? input.modelo : null));
    if (declaracion === null || declaracion === undefined || String(declaracion).trim() === '') {
      return this._invalid('declaracion');
    }

    // Sin motivo NO se rectifica: una correccion sin causa es una correccion que miente.
    const motivo = input.motivo !== undefined ? input.motivo
      : (input.causa !== undefined ? input.causa : (input.razon !== undefined ? input.razon : null));
    if (motivo === null || motivo === undefined || String(motivo).trim() === '') {
      return this._invalid('motivo');
    }

    const tipo = this._tipo(input.tipo);
    const parcela = this._obtenerOCrear(pid);

    // Clave de la rectificacion: declarada, o derivada (declaracion+tipo+periodo).
    const clave = input.clave != null
      ? String(input.clave)
      : crypto.createHash('sha1').update(JSON.stringify([String(declaracion), tipo, input.periodo != null ? String(input.periodo) : null, String(motivo)])).digest('hex').slice(0, 16);

    // Idempotente por clave: la misma rectificacion no se apila dos veces.
    if (!input.permitir_duplicado && parcela.claves.has(clave)) {
      return {
        status: 200,
        data: {
          project_id: pid,
          rectificacion: { clave },
          rectificada: false,
          duplicado: true,
          total: parcela.rectificaciones.length,
          motivo: 'la rectificacion ya estaba registrada (misma clave): no se duplica (append-only)'
        }
      };
    }

    const ahora = new Date().toISOString();
    const registro = {
      rectificacion_id: `${pid}-r${parcela.rectificaciones.length + 1}`,
      secuencia: parcela.rectificaciones.length + 1,
      clave,
      tipo,                                  // complementaria | sustitutiva
      declaracion: String(declaracion),      // la declaracion ORIGINAL, intacta
      periodo: input.periodo != null ? String(input.periodo) : null,
      motivo: String(motivo),
      // Lo que cambia: declarado en el input; ausente → null (no se inventa la correccion).
      correccion: input.correccion !== undefined ? input.correccion : (input.nuevo !== undefined ? input.nuevo : null),
      base: input.base != null ? this._num(input.base) : null,
      cuota: input.cuota != null ? this._num(input.cuota) : null,
      // NO se edita la declaracion original: la rectificacion es un registro NUEVO.
      original_intacta: true,
      presentada: false,                     // este modulo NO presenta; presenta el circuito fiscal
      en: ahora
    };
    // APPEND-ONLY: se apila; NUNCA se sobrescribe ni se borra.
    parcela.rectificaciones.push(registro);
    parcela.claves.add(clave);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        rectificacion: registro,
        rectificada: true,
        duplicado: false,
        total: parcela.rectificaciones.length,
        append_only: true,
        abierto: {
          correccion: registro.correccion != null ? null : 'la rectificacion no declaro el detalle de la correccion (se anota el hueco, no se inventa)'
        }
      }
    };
  }

  // El tipo de rectificacion: complementaria (añade) o sustitutiva (reemplaza). Declarado, o complementaria.
  _tipo(v) {
    const t = v != null ? String(v).toLowerCase().trim() : '';
    return ['complementaria', 'sustitutiva'].includes(t) ? t : 'complementaria';
  }

  _obtenerOCrear(pid) {
    let d = this._rectificaciones.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-rectificacion-declaracion-v1', rectificaciones: [], claves: new Set() };
      this._rectificaciones.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  // Lectura directa (mismo proceso) — solo lectura.
  rectificacionesDe(pid) {
    const d = pid ? this._rectificaciones.get(pid) : null;
    return d ? [...d.rectificaciones] : [];
  }

  // ── Tools ──
  toolRectificar(params) { return this._rectificar(params); }
}

module.exports = RectificacionDeclaracion;
