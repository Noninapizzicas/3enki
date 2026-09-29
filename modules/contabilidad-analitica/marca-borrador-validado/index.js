/**
 * contabilidad-analitica/marca-borrador-validado — REFLEJO STATELESS (Q4, hoja del plan).
 *
 * El SELLO del PUNTO EN QUE ESTA lo que el dueno ve: EN CURSO / REVISADO / FIRMADO. Existe para
 * que no se decida sobre un BORRADOR VIVO como si fuera definitivo.
 *
 * ATRIBUTOS del diseno: `traza:TrazaAsiento`, `firma:FlujoFirma`.
 *   METODOS: estado(dato):MarcaEstado.
 *   REGLA: sello del punto en que esta lo que ve (en curso / revisado / firmado), para no decidir
 *          sobre un borrador vivo como si fuera definitivo. Deriva el estado de la traza y la firma.
 *
 * Invariantes:
 *  - DERIVA, NO ALMACENA: el estado se COMPUTA de la traza (B4, `contabilidad.traza_registrada`) y
 *    la firma (L3, `contabilidad.firma_registrada`). No se guarda una marca por dato (no es parcela).
 *  - JAMAS SE AFIRMA FIRMADO SIN FIRMA: sin evidencia de firma el estado maximo es REVISADO (o
 *    EN_CURSO). No se declara definitivo lo que no lo es.
 *  - Dato ausente = desconocido: sin dato identificable el estado es `DESCONOCIDO` — no se asume
 *    borrador ni validado.
 *  - DETERMINISTA: misma traza + misma firma → mismo estado.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja Q4 del plan-construccion y diseno-oop.md (CLASE MarcaBorradorValidado).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los estados del contrato, de menos a mas avanzado. El diseno los fija; no se amplian.
const ESTADOS = ['DESCONOCIDO', 'EN_CURSO', 'REVISADO', 'FIRMADO'];

class MarcaBorradorValidado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marca-borrador-validado';
    this.version = 'reflejo-0.1.0';
    // Evidencia OBSERVADA de la traza (B4) y la firma (L3), por proyecto. LECTURA, no parcela:
    // el estado NO se almacena — se DERIVA. Aqui solo se recuerda la ultima evidencia emitida.
    this._trazas = new Map();
    this._firmas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'marca-borrador-validado.estado.response', async (d) => {
      const res = this._estado(d);
      if (res.status !== 200) this.eventBus?.publish('marca-borrador-validado.estado.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget: la traza del asiento (B4) → evidencia de que el dato fue creado ──
  onTrazaRegistrada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const item = { dato_id: this._dato(d.traza || d), creado: true, creado_por: (d.traza && d.traza.registrado_por) || d.registrado_por || null, en: new Date().toISOString() };
    this._push(this._trazas, d.project_id, item);
    return { status: 200, data: { project_id: d.project_id, evidencia: 'traza' } };
  }

  // ── Fire-and-forget: la firma (L3) → evidencia de que el dato fue firmado ──
  onFirmaRegistrada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const firma = d.firma || d;
    const item = {
      dato_id: this._dato(firma),
      firmado: true,
      estado_firma: firma.estado != null ? String(firma.estado).toUpperCase() : 'FIRMADO',
      firmado_por: firma.firmado_por != null ? String(firma.firmado_por) : null,
      en: new Date().toISOString()
    };
    this._push(this._firmas, d.project_id, item);
    return { status: 200, data: { project_id: d.project_id, evidencia: 'firma' } };
  }

  // ── proyeccion determinista: estado(dato) → MarcaEstado (deriva de traza + firma) ──
  _estado(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const dato_id = this._dato(input.dato || input.dato_id || input);
    if (!dato_id) {
      // Sin dato identificable NO se afirma estado: ni borrador ni validado.
      return {
        status: 200,
        data: {
          project_id: pid,
          dato_id: null,
          marca: { estado: 'DESCONOCIDO', borrador: null, validado: null, firmado: null },
          derivada_de: [],
          almacena: false,
          abierto: true,
          faltan: ['dato_id'],
          motivo: 'sin dato identificable el estado es DESCONOCIDO: no se asume borrador ni validado'
        }
      };
    }

    // La EVIDENCIA: declarada en la peticion, o la ultima observada por los eventos de dominio.
    const traza = this._evidencia(input.traza, this._buscar(this._trazas, pid, dato_id));
    const firma = this._evidencia(input.firma, this._buscar(this._firmas, pid, dato_id));

    const marca = this._derivar(traza, firma);

    return {
      status: 200,
      data: {
        project_id: pid,
        dato_id,
        marca,
        // DERIVA, NO ALMACENA: se declara de donde sale cada pieza del estado.
        derivada_de: [
          ...(traza ? ['traza-asiento (B4)'] : []),
          ...(firma ? ['flujo-firma (L3)'] : [])
        ],
        almacena: false,
        decide: false,
        abierto: {
          traza: traza ? null : 'no hay traza del dato: el punto de partida es EN_CURSO',
          firma: firma ? null : 'no hay firma registrada: el estado NO puede afirmarse FIRMADO'
        },
        faltan: [
          ...(traza ? [] : ['traza']),
          ...(firma ? [] : ['firma'])
        ]
      }
    };
  }

  // La DERIVACION: traza → EN_CURSO/REVISADO; firma → FIRMADO. Nunca se salta la firma.
  _derivar(traza, firma) {
    const firmado = Boolean(firma && (firma.firmado === true || String(firma.estado_firma || '').toUpperCase() === 'FIRMADO'));
    if (firmado) {
      return {
        estado: 'FIRMADO',
        borrador: false,
        validado: true,
        firmado: true,
        firma: { estado: firma.estado_firma != null ? firma.estado_firma : 'FIRMADO', firmado_por: firma.firmado_por != null ? firma.firmado_por : null },
        // Lo FIRMADO es definitivo: seguro sobre el que decidir.
        seguro_para_decidir: true,
        motivo: 'el dato esta FIRMADO (firma registrada, L3): es el punto definitivo'
      };
    }
    const revisado = Boolean(firma && String(firma.estado_firma || '').toUpperCase() === 'REVISADO');
    if (revisado) {
      return {
        estado: 'REVISADO',
        borrador: true,
        validado: false,
        firmado: false,
        seguro_para_decidir: false,
        motivo: 'el dato esta REVISADO pero NO firmado: sigue siendo un borrador vivo — no se decide como definitivo'
      };
    }
    if (traza) {
      return {
        estado: 'EN_CURSO',
        borrador: true,
        validado: false,
        firmado: false,
        seguro_para_decidir: false,
        motivo: 'el dato esta EN CURSO (hay traza, sin firma): es un borrador vivo'
      };
    }
    return {
      estado: 'DESCONOCIDO',
      borrador: null,
      validado: null,
      firmado: null,
      seguro_para_decidir: false,
      motivo: 'no hay traza ni firma del dato: el estado no se puede derivar'
    };
  }

  _evidencia(declarada, observada) {
    if (declarada && typeof declarada === 'object') return declarada;
    return observada || null;
  }

  _buscar(mapa, pid, dato_id) {
    const lista = mapa.get(pid) || [];
    for (let i = lista.length - 1; i >= 0; i--) {
      if (String(lista[i].dato_id) === String(dato_id)) return lista[i];
    }
    return null;
  }

  _push(mapa, pid, item) {
    if (!item.dato_id) return;
    const lista = mapa.get(pid) || [];
    lista.push(item);
    if (lista.length > 5000) lista.splice(0, lista.length - 5000);
    mapa.set(pid, lista);
  }

  _dato(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') {
      const raw = v.dato_id != null ? v.dato_id : (v.id != null ? v.id : (v.clave != null ? v.clave : (v.clave_natural != null ? v.clave_natural : null)));
      return raw != null ? String(raw) : null;
    }
    return String(v);
  }

  // ── Tools ──
  toolEstado(params) { return this._estado(params); }
}

module.exports = MarcaBorradorValidado;
