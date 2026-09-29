/**
 * contabilidad-libro/aviso-cuadre — PUENTE STATELESS (C6, hoja del plan).
 *
 * El EMPUJON honesto del cuadre: si LA metrica unica de cobertura dice que FALTA algo,
 * este puente AVISA. NO finge el cuadre y NO recalcula la metrica: la LEE.
 *
 * De donde LEE la cobertura (en este orden, y se declara de donde salio):
 *   1. lo que venga declarado en la propia peticion (`cobertura`),
 *   2. la ultima `contabilidad.cobertura_medida` que paso por el bus (espejo en memoria),
 *   3. se la PIDE a completitud-cobertura POR EVENTO (RPC). Nunca la recalcula aqui.
 *
 * Invariantes:
 *  - Si NO hay metrica, NO se afirma cuadre ni descuadre: `avisa:false` sin aviso y con
 *    el motivo declarado (invariante 7: dato ausente = desconocido; nada se estima).
 *  - El DESTINO del aviso es `ParametroDeclarable` ([ABIERTO] Q70: quien actua). Sin
 *    destino declarado NO se inventa: `destino:null`, `destino_declarado:false`.
 *  - Es PURO y sin estado de dominio: solo guarda el ultimo espejo de la metrica leida
 *    para poder avisar de forma proactiva; no recuerda avisos ni decide nada.
 *
 * Forma: PUENTE → STATELESS (sin persistencia por proyecto, sin restauracion de proyecto).
 * Ver hoja C6 del plan-construccion y diseno-oop.md (CLASE AvisoCuadre).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AvisoCuadre extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-cuadre';
    this.version = 'reflejo-0.1.0';
    // espejo de LA metrica unica tal como la emitio completitud-cobertura: pid -> {cobertura, vertical}
    this._medidas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onAvisarRequest(e) {
    return this._atender(e, 'avisar', 'aviso-cuadre.avisar.response', async (d) => {
      const res = await this._avisar(d);
      if (res.status === 200) {
        // Exito con aviso → evento de dominio (lo consume motor-avisos).
        if (res.data.aviso) {
          this.eventBus?.publish('contabilidad.aviso_cuadre', {
            project_id: res.data.project_id,
            aviso: res.data.aviso,
            destino: res.data.aviso.destino,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('aviso-cuadre.avisar.failed', res);
      }
      return res;
    });
  }

  // ── fire-and-forget: LA metrica unica quedo medida → se refleja; si no cubre, se avisa ──
  async onCoberturaMedida(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return null;
    this._medidas.set(pid, {
      cobertura: d.cobertura || null,
      vertical: d.vertical != null ? d.vertical : null,
      medida_en: new Date().toISOString()
    });
    // Si la cobertura NO esta completa, el puente empuja el aviso (proactivo).
    if (!this._cubre(d.cobertura)) {
      const res = await this._avisar({
        project_id: pid,
        vertical: d.vertical != null ? d.vertical : null,
        cobertura: d.cobertura || null,
        correlation_id: d.correlation_id
      });
      if (res.status === 200) {
        if (res.data.aviso) {
          this.eventBus?.publish('contabilidad.aviso_cuadre', {
            project_id: res.data.project_id,
            aviso: res.data.aviso,
            destino: res.data.aviso.destino,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('aviso-cuadre.avisar.failed', res);
      }
      return res;
    }
    return null;
  }

  // ── proyeccion: avisar(ejercicio) → Aviso | null (LEE la metrica, no la recalcula) ──
  async _avisar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const leida = await this._leerCobertura(pid, input);

    // Sin metrica: el puente NO finge ni el cuadre ni el descuadre. Se declara.
    if (!leida.medida) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ejercicio: input.ejercicio != null ? input.ejercicio : null,
          vertical: input.vertical != null ? input.vertical : null,
          cobertura: null,
          origen_cobertura: null,
          cubre: null,
          aviso: null,
          avisa: false,
          destino_declarado: this._destinoDeclarado(input.destino),
          motivo: 'no hay metrica de cobertura disponible: el puente no finge el cuadre'
        }
      };
    }

    const cobertura = leida.medida;
    const cubre = this._cubre(cobertura);
    const destino = this._destino(input.destino);

    const aviso = cubre ? null : {
      asunto: 'cuadre',
      vertical: input.vertical != null ? input.vertical : null,
      motivo: this._motivo(cobertura),
      cobertura: {
        declarada: cobertura.declarada === true,
        tasa: cobertura.tasa != null ? cobertura.tasa : null,
        huecos: Array.isArray(cobertura.huecos) ? cobertura.huecos : null,
        completa: cobertura.completa === true
      },
      // El destino es dato declarable ([ABIERTO] Q70): sin declarar → null, no se inventa.
      destino,
      destino_declarado: this._destinoDeclarado(input.destino),
      requiere_revision: true,
      avisado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        vertical: input.vertical != null ? input.vertical : null,
        cobertura,
        origen_cobertura: cobertura.origen,
        cubre,
        aviso,
        avisa: Boolean(aviso),
        destino_declarado: this._destinoDeclarado(input.destino)
      }
    };
  }

  // LEE la metrica en 3 saltos (peticion → espejo → RPC). Nunca la recalcula.
  async _leerCobertura(pid, input = {}) {
    if (input.cobertura && typeof input.cobertura === 'object') {
      return { medida: input.cobertura, origen: 'declarada_en_peticion' };
    }
    const espejo = this._medidas.get(pid);
    if (espejo && espejo.cobertura) {
      return { medida: { ...espejo.cobertura, origen: 'cobertura_medida' }, origen: 'cobertura_medida' };
    }
    const r = await this._rpc('completitud-cobertura.medir.request',
      { project_id: pid, vertical: input.vertical != null ? input.vertical : null }, { timeout_ms: 4000 });
    if (r && r.status === 200 && r.data && r.data.cobertura) {
      return { medida: { ...r.data.cobertura, origen: 'completitud-cobertura' }, origen: 'completitud-cobertura' };
    }
    return { medida: null, origen: null };
  }

  // Una cobertura "cubre" solo si esta DECLARADA y COMPLETA. No declarada → hay hueco.
  _cubre(cobertura) {
    if (!cobertura || typeof cobertura !== 'object') return false;
    return cobertura.declarada === true && cobertura.completa === true;
  }

  _motivo(cobertura) {
    if (cobertura.declarada !== true) {
      return 'la cobertura no esta declarada: no hay expectativa declarada con la que medir el cuadre';
    }
    const huecos = Array.isArray(cobertura.huecos) ? cobertura.huecos.length : null;
    return huecos != null
      ? `faltan ${huecos} hecho(s) por llegar: hay huecos declarados`
      : 'la cobertura no esta completa: hay huecos declarados';
  }

  _destinoDeclarado(raw) {
    if (raw === undefined || raw === null) return false;
    return String(raw).trim().length > 0;
  }

  _destino(raw) {
    if (!this._destinoDeclarado(raw)) return null;
    return String(raw).trim();
  }

  // ── Tools ──
  toolAvisar(params) { return this._avisar(params); }
}

module.exports = AvisoCuadre;
