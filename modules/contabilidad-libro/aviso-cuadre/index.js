/**
 * contabilidad-libro/aviso-cuadre — PUENTE (C6, hoja del plan).
 *
 * NO finge el cuadre: si falta cobertura, AVISA. Lee la METRICA UNICA que ya existe; NO la
 * recalcula (el juicio del cuadre vive en su dueno, no aqui). Este puente solo DA FORMA a la
 * señal y la convierte en HECHO de dominio.
 *
 *   cuadre (metrica unica: cuadra · cobertura · descuadre)
 *      → aviso-cuadre.avisar (LEE, no recalcula)
 *      → contabilidad.cuadre_no_cuadra  (HECHO)
 *      → (lo ESCUCHA motor-avisos K2, que produce el aviso)
 *      y SUBE best-effort motor-avisos.producir.request
 *
 * Invariante (honestidad): si el cuadre NO cuadra o FALTA cobertura, avisa. Si la metrica
 * declara `cuadra === true` Y hay cobertura, NO se inventa un aviso (silencio legitimo). Sin
 * metrica NO se finge: se declara ABIERTO (no se avisa de lo que no se sabe).
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia. RPC avisar = ORDEN → ui_handler.
 * Ver hoja C6 del plan-construccion y diseno-oop.md (CLASE AvisoCuadre).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AvisoCuadre extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-cuadre';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onAvisarRequest(e) {
    return this._atender(e, 'avisar', 'aviso-cuadre.avisar.response', (d) => {
      const res = this._avisar(d);
      if (res.status === 200) {
        if (res.data.avisa === true) {
          // R2 · si AVISA, anuncia el HECHO: el cuadre no cuadra (o falta cobertura).
          this.eventBus?.publish('contabilidad.cuadre_no_cuadra', {
            project_id: res.data.project_id,
            cuadra: res.data.cuadra,
            cobertura: res.data.cobertura,
            descuadre: res.data.descuadre,
            motivo: res.data.aviso.motivo,
            correlation_id: d.correlation_id
          });
          // SUBE (best-effort por EVENTO) la produccion del aviso a K2 (motor-avisos).
          this.eventBus?.publish('motor-avisos.producir.request', {
            project_id: res.data.project_id,
            tipo: 'cuadre',
            titulo: res.data.aviso.titulo,
            detalle: res.data.aviso.detalle,
            severidad: res.data.aviso.severidad,
            origen: 'aviso-cuadre',
            correlation_id: d.correlation_id
          });
        }
        // Si NO avisa (cuadra y hay cobertura) → silencio legitimo: no hay hecho que anunciar.
      } else {
        this.eventBus?.publish('aviso-cuadre.avisar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _avisar(input) → { status, data }  ·  LEE la metrica unica del cuadre (no la recalcula)
  // ══════════════════════════════════════════════════════════════════════
  _avisar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La METRICA: llega DECLARADA (la produce su dueno). Este puente no la recalcula.
    const metrica = (input.cuadre && typeof input.cuadre === 'object') ? input.cuadre
      : (input.metrica && typeof input.metrica === 'object' ? input.metrica : null);

    const cuadra = metrica && metrica.cuadra !== undefined ? metrica.cuadra
      : (input.cuadra !== undefined && typeof input.cuadra !== 'object' ? input.cuadra : undefined);
    const cobertura = metrica && metrica.cobertura !== undefined ? metrica.cobertura
      : (input.cobertura !== undefined ? input.cobertura : undefined);
    const descuadre = metrica && metrica.descuadre !== undefined ? metrica.descuadre
      : (input.descuadre !== undefined ? input.descuadre : null);

    const cuadraBool = cuadra === true ? true : (cuadra === false ? false : null);
    const coberturaBool = cobertura === true ? true : (cobertura === false ? false : null);

    // Sin metrica NO se finge: se declara ABIERTO (no se avisa de lo que no se sabe).
    const sinMetrica = cuadraBool === null && coberturaBool === null;

    // AVISA si: el cuadre NO cuadra (cuadra===false) O falta cobertura (cobertura===false).
    const avisa = sinMetrica ? false : (cuadraBool === false || coberturaBool === false || cuadraBool === null);

    const aviso = avisa ? {
      tipo: 'cuadre',
      severidad: cuadraBool === false ? 'alta' : 'media',
      titulo: 'el cuadre no cuadra',
      detalle: this._detalle(cuadraBool, coberturaBool, descuadre),
      motivo: this._motivo(cuadraBool, coberturaBool)
    } : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'aviso-cuadre',
        cuadra: cuadraBool,
        cobertura: coberturaBool,
        descuadre: descuadre != null ? Number(descuadre) : null,
        avisa,
        aviso,
        // Lectura fiel: NO se recalculo nada (la metrica viene declarada).
        recalcula: false,
        abierto: {
          metrica: sinMetrica ? 'no llego la metrica del cuadre: no se finge (no se avisa de lo que no se sabe)' : null,
          descuadre: (descuadre == null && cuadraBool === false) ? 'el descuadre no se declaro (se anota el hueco, no se estima)' : null
        }
      }
    };
  }

  _motivo(cuadra, cobertura) {
    const partes = [];
    if (cuadra === false) partes.push('el cuadre no cuadra');
    if (cobertura === false) partes.push('falta cobertura');
    if (cuadra === null) partes.push('no se declaro si cuadra');
    return partes.join(' · ') || null;
  }

  _detalle(cuadra, cobertura, descuadre) {
    const partes = [];
    partes.push(`cuadra=${cuadra === null ? 'desconocido' : cuadra}`);
    partes.push(`cobertura=${cobertura === null ? 'desconocida' : cobertura}`);
    if (descuadre != null) partes.push(`descuadre=${descuadre}`);
    return partes.join(' · ');
  }

  // ── Tools ──
  toolAvisar(params) { return this._avisar(params); }
}

module.exports = AvisoCuadre;
