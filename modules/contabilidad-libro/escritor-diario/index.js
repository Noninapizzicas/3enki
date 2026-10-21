/**
 * contabilidad-libro/escritor-diario — CUSTODIO CON PERSISTENCIA (B2, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ES EL CUSTODIO DEL LIBRO. SINGLE-WRITER POR PARCELA.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Aqui se ASIENTA. Nadie mas escribe el diario: la correccion del asesor entra por
 * asiento-ajuste (B5), el hecho rectificado por hecho-rectificativo (A13), el hecho de
 * la operacion por puerto-evento-vertical (A1) → normalizador (A2). Todos ellos llegan
 * como EVENTO; este modulo es el UNICO que apila en el diario.
 *
 * EL CERROJO DE ESTE MODULO — LA PARTIDA DOBLE:
 *   Un asiento SOLO entra si suma(DEBE) == suma(HABER). Si no cuadra NO se inventa el
 *   descuadre, NO se fuerza: se RECHAZA (422 PARTIDA_DOBLE_ROTA) con las dos sumas y la
 *   diferencia declaradas. Un libro que "arregla" solo los asientos descuadrados es un
 *   libro que miente.
 *
 * Invariantes:
 *  - PARTIDA DOBLE: debe != haber → rechazo. No hay asiento a medias.
 *  - APPEND-ONLY: cada asiento se APILA con su secuencia y su huella; NADA se borra,
 *    NADA se sobrescribe. Corregir = AÑADIR otro asiento, jamas editar el anterior.
 *  - SIN LINEAS O SIN CUADRE → no se asienta (dato ausente = desconocido, no se rellena).
 *  - EJERCICIO CERRADO: si el ejercicio esta cerrado no se asienta (409 CONFLICT_STATE).
 *  - IDEMPOTENTE por huella: el mismo asiento (misma huella) no se apila dos veces
 *    (at-least-once del bus); se declara `duplicado:true`, no se duplica en silencio.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al asentar publica `contabilidad.asiento_asentado` (el hecho que
 * alimenta mayor-balanza, traza-asiento, balance, informes...). Sin ese hecho, el libro
 * seria invisible para todo el resto del dominio.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja B2 del plan-construccion y diseno-oop.md (CLASE EscritorDiario).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Tolerancia de cuadre (centimos de redondeo, no descuadre real).
const EPSILON = 0.005;

class EscritorDiario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escritor-diario';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, cerrado, asientos: [append-only], huellas:Set }
    this._diarios = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'escritor-diario.json',
      dir: '/contabilidad/escritor-diario',
      snapshot: (pid) => {
        const d = this._diarios.get(pid);
        if (!d) return null;
        return { project_id: pid, esquema: d.esquema, cerrado: d.cerrado, asientos: d.asientos };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const asientos = Array.isArray(data.asientos) ? data.asientos : [];
        const huellas = new Set(asientos.map((a) => a && a.huella).filter(Boolean));
        this._diarios.set(pid, {
          esquema: data.esquema || 'contabilidad-escritor-diario-v1',
          cerrado: data.cerrado === true,
          asientos,
          huellas
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el diario del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC unico: asentar (ORDEN → ui_handler panel) ──
  onAsentarRequest(e) {
    return this._atender(e, 'asentar', 'escritor-diario.asentar.response', async (d) => {
      const res = this._asentar(d);
      await this._reaccionAResultado(res, d);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): el hecho llega por el bus ──
  // El hecho recibido (A1/A2) puede traer ya su asiento propuesto; si no lo trae, no se
  // inventa (no se asienta). Se delega a la MISMA guarda de partida doble.
  async onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const asiento = d.asiento || (d.hecho && d.hecho.asiento) || null;
    if (!asiento) return; // sin asiento declarado NO se fabrica un apunte
    const res = this._asentar({ project_id: d.project_id, asiento, origen: d.origen || d.vertical, correlation_id: d.correlation_id });
    await this._reaccionAResultado(res, d);
  }

  // La correccion del asesor (B5) entra como ajuste; se trata como un asiento mas.
  async onAjusteEntrado(e) {
    const d = (e && (e.data || e)) || {};
    const asiento = d.asiento || (d.ajuste && d.ajuste.asiento) || null;
    if (!asiento) return;
    const res = this._asentar({ project_id: d.project_id, asiento, origen: 'asiento-ajuste', ajuste: true, correlation_id: d.correlation_id });
    await this._reaccionAResultado(res, d);
  }

  // El hecho rectificado (A13) NO borra: AÑADE un asiento que corrige/anula.
  async onHechoRectificado(e) {
    const d = (e && (e.data || e)) || {};
    const asiento = d.asiento || (d.rectificativo && d.rectificativo.asiento) || null;
    if (!asiento) return;
    const res = this._asentar({ project_id: d.project_id, asiento, origen: 'hecho-rectificativo', rectificativo: true, correlation_id: d.correlation_id });
    await this._reaccionAResultado(res, d);
  }

  // Reaccion comun: si asento → anuncia el HECHO (R2); si no → publica el par .failed.
  // Nota: los handlers de dominio NO publican .response (no son RPC).
  async _reaccionAResultado(res, d) {
    if (res.status === 200 && res.data && res.data.asentado) {
      // R2 · si ESCRIBE, anuncia el HECHO: un asiento quedo en el libro.
      this.eventBus?.publish('contabilidad.asiento_asentado', {
        project_id: res.data.project_id,
        asiento: res.data.asiento,
        numero: res.data.asiento.numero,
        total: res.data.total,
        correlation_id: d.correlation_id
      });
    } else if (res.status !== 200) {
      this.eventBus?.publish('escritor-diario.asentar.failed', res);
    }
    return res;
  }

  // ══════════════════════════════════════════════════════════════════════
  // _asentar(input) → { status, data }  ·  LA guarda de partida doble
  // ══════════════════════════════════════════════════════════════════════
  _asentar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const asiento = input.asiento !== undefined ? input.asiento : input.apunte;
    if (!asiento || typeof asiento !== 'object') return this._invalid('asiento');

    const lineas = this._lineas(asiento);
    if (lineas.length === 0) return this._invalid('asiento.lineas');

    const diario = this._obtenerOCrear(pid);

    // Ejercicio cerrado: no se asienta (no se reabre un libro cerrado por la puerta de atras).
    if (diario.cerrado) {
      return this._errorResponse(409, 'CONFLICT_STATE',
        'el ejercicio esta cerrado: no se asienta (se reabre por su propio camino, no aqui)',
        { project_id: pid });
    }

    // ── LA PARTIDA DOBLE: si no cuadra, RECHAZA (no inventa, no fuerza) ──
    const { debe, haber } = this._sumas(lineas);
    const diferencia = this._round(debe - haber, 2);
    if (Math.abs(diferencia) > EPSILON) {
      return this._errorResponse(422, 'PARTIDA_DOBLE_ROTA',
        'la suma del DEBE no cuadra con la del HABER: el asiento se RECHAZA (no se inventa el descuadre)',
        {
          project_id: pid,
          suma_debe: debe,
          suma_haber: haber,
          diferencia,
          lineas,
          rechazado: true
        });
    }

    // ── Huella determinista: el mismo asiento no se apila dos veces (at-least-once del bus) ──
    const huella = this._huella(asiento, lineas);
    if (!input.permitir_duplicado && diario.huellas.has(huella)) {
      return {
        status: 200,
        data: {
          project_id: pid,
          asiento: { huella },
          asentado: false,
          duplicado: true,
          total: diario.asientos.length,
          motivo: 'el asiento ya estaba en el libro (misma huella): no se duplica (append-only)'
        }
      };
    }

    const ahora = new Date().toISOString();
    const registro = {
      numero: diario.asientos.length + 1,
      secuencia: diario.asientos.length + 1,
      id: `${pid}-a${diario.asientos.length + 1}`,
      huella,
      fecha: asiento.fecha != null ? String(asiento.fecha) : ahora.slice(0, 10),
      concepto: asiento.concepto != null ? String(asiento.concepto) : null,
      lineas,
      suma_debe: debe,
      suma_haber: haber,
      origen: input.origen != null ? String(input.origen) : null,
      ajuste: input.ajuste === true,
      rectificativo: input.rectificativo === true,
      en: ahora
    };
    // APPEND-ONLY: se apila; NUNCA se sobrescribe ni se borra.
    diario.asientos.push(registro);
    diario.huellas.add(huella);
    diario.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        asiento: registro,
        asentado: true,
        duplicado: false,
        total: diario.asientos.length,
        append_only: true,
        abierto: {
          concepto: registro.concepto ? null : 'el asiento no declaro concepto (se apila el hueco, no se inventa)',
          origen: registro.origen ? null : 'el asiento no declaro su origen'
        }
      }
    };
  }

  // Normaliza las lineas a [{cuenta, debe, haber}] con numeros.
  _lineas(asiento) {
    const raw = Array.isArray(asiento.lineas) ? asiento.lineas : [];
    return raw
      .filter((l) => l && typeof l === 'object')
      .map((l) => ({
        cuenta: l.cuenta != null ? String(l.cuenta) : null,
        debe: this._num(l.debe),
        haber: this._num(l.haber)
      }));
  }

  _sumas(lineas) {
    let debe = 0;
    let haber = 0;
    for (const l of lineas) {
      debe += l.debe;
      haber += l.haber;
    }
    return { debe: this._round(debe, 2), haber: this._round(haber, 2) };
  }

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  _huella(asiento, lineas) {
    const base = JSON.stringify({
      clave: asiento.clave != null ? String(asiento.clave) : null,
      fecha: asiento.fecha != null ? String(asiento.fecha) : null,
      lineas: lineas.map((l) => [l.cuenta, l.debe, l.haber])
    });
    return crypto.createHash('sha1').update(base).digest('hex').slice(0, 16);
  }

  _obtenerOCrear(pid) {
    let d = this._diarios.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-escritor-diario-v1', cerrado: false, asientos: [], huellas: new Set() };
      this._diarios.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // Lectura directa del diario (mismo proceso) — solo lectura.
  asientosDe(pid) {
    const d = pid ? this._diarios.get(pid) : null;
    return d ? [...d.asientos] : [];
  }

  // Cierre de ejercicio: marca el diario como cerrado (lo decide quien cierra; aqui se refleja).
  cerrarEjercicio(pid) {
    const d = this._obtenerOCrear(pid);
    d.cerrado = true;
    this._persist.marcarDirty(pid);
  }

  // ── Tools ──
  toolAsentar(params) { return this._asentar(params); }
}

module.exports = EscritorDiario;
