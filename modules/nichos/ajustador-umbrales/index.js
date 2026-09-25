/**
 * nichos/ajustador-umbrales — CUSTODIO (K3, hoja del plan).
 *
 * El JEFE retunea en caliente el criterio/umbral de validación del pipeline:
 *   - _retunear(duenyo, nuevoUmbral)  custodia el cambio en su store (un solo
 *     escritor: rol DUEÑO, guard single-writer) y lo declara aplicado.
 *   - _aplicar(cambio)                recalcula el umbral vigente (merge
 *     conservador sobre el último ajustado) y devuelve el criterio refinado.
 *
 * ORQUESTADOR LIGERO: escucha el cambio de umbral del jefe y lo PROPAGA hacia
 * criterio-viabilidad (C2) publicando nichos.umbral_ajustado (fire-and-forget,
 * ver seccion 3.2 del plan: emisor -> par de fallo). El siguiente lote de
 * validación (C3 veredicto) evalúa contra el umbral refinado del proyecto.
 *
 * PosPersistencia per-proyecto (patrón custodio real, ver criterio-viabilidad):
 * restaura el umbral en project.activated y vuelca en onUnload. Emisor/par de
 * fallo: exito -> nichos.umbral_ajustado; error -> nichos.umbral.retunear.failed
 * (cierra el circulo de nichos.umbral.retunear.request). Ver hoja K3 del
 * plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor declarable — el DUEÑO retunea el umbral (single-writer).
const ROL_DUENYO = 'DUEÑO';

// Rango base declarable del umbral de ingresos semanales ([ABIERTO], 25-400).
const UMBRAL_MIN_EUR = 25;
const UMBRAL_MAX_EUR = 400;

// Shape base del umbral ajustado. El jefe declara todo o un subset; cada campo
// se valida/normaliza sobre este molde.
function umbralVacio() {
  return {
    esquema: 'nichos-ajustador-umbrales-v1',
    umbral_ingresos: null,          // { number > 0 } — EUR/semana
    minimos_demanda: null,          // { numero_busquedas, contactos_semana }
    disposicion_a_pagar: null,      // { number > 0 } — EUR/venta
    tipo: null,                     // marginal|estandar|premium [ABIERTO]
    anterior: null,                 // snapshot del umbral previo (para recalcular delta)
    ajustado_por: null,             // siempre ROL_DUENYO
    aplicado: false,                 // true cuando se publicó nichos.umbral_ajustado
    updated_at: null
  };
}

function numPos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

class AjustadorUmbrales extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ajustador-umbrales';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> umbral ajustado (un solo estado por proyecto)
    this._umbrales = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'ajustador-umbrales.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const u = this._umbrales.get(pid);
        return u ? { project_id: pid, umbral: u } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.umbral) this._umbrales.set(pid, data.umbral);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el umbral ajustado del proyecto activado (PosPersistencia).
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una línea, delega a _atender / fire-and-forget) ──
  onRetunearRequest(e) {
    return this._atender(e, 'retunear', 'nichos.umbral.retunear.response', (d) => {
      const res = this._procesarRetunear(d);
      // Emisor/par de fallo: exito → propaga nichos.umbral_ajustado; error → failed.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.umbral_ajustado', {
          project_id: res.data.project_id,
          nuevo_umbral: res.data.umbral.umbral_ingresos,
          anterior: res.data.anterior,
          aplicado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.umbral.retunear.failed', res);
      }
      return res;
    });
  }

  // Procesa el retune: valida el escrito, custodia y aplica (proyeccion _aplicar).
  _procesarRetunear(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor single-writer: solo el DUEÑO retunea.
    if (input.rol !== ROL_DUENYO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUEÑO puede retunear el umbral de validacion', {
        rol_esperado: ROL_DUENYO, rol_recibido: input.rol
      });
    }

    const cambio = input.nuevo_umbral || (typeof input.cambio === 'object' ? input.cambio : null);
    if (!cambio || typeof cambio !== 'object') {
      return this._invalid('nuevo_umbral');
    }

    const res = this._aplicar(pid, cambio, ROL_DUENYO);
    return res;
  }

  // ── proyeccion de escritura (el único escritor: DUEÑO) ──
  // Custodia el cambio en el store y recalcula el umbral vigente (merge conservador).
  _aplicar(pid, cambio, rol) {
    if (!cambio || typeof cambio !== 'object') return this._invalid('cambio');

    const previo = this._umbrales.get(pid) || umbralVacio();
    const actual = umbralVacio();

    // Merge conservador: lo que el jefe declara se valida; lo que no, se conserva.
    if (cambio.umbral_ingresos != null && cambio.umbral_ingresos !== '') {
      const u = numPos(cambio.umbral_ingresos);
      if (!u || u < UMBRAL_MIN_EUR || u > UMBRAL_MAX_EUR) {
        return this._errorResponse(400, 'INVALID_INPUT', `umbral_ingresos fuera de rango ${UMBRAL_MIN_EUR}-${UMBRAL_MAX_EUR} EUR/semana`, { umbral_ingresos: cambio.umbral_ingresos });
      }
      actual.umbral_ingresos = u;
    } else if (previo.umbral_ingresos != null) {
      actual.umbral_ingresos = previo.umbral_ingresos;
    }

    if (cambio.minimos_demanda && typeof cambio.minimos_demanda === 'object') {
      const numero_busquedas = numPos(cambio.minimos_demanda.numero_busquedas);
      const contactos_semana = numPos(cambio.minimos_demanda.contactos_semana);
      if (numero_busquedas == null && contactos_semana == null) {
        return this._invalid('cambio.minimos_demanda');
      }
      actual.minimos_demanda = { numero_busquedas, contactos_semana };
    } else if (previo.minimos_demanda) {
      actual.minimos_demanda = previo.minimos_demanda;
    }

    if (cambio.disposicion_a_pagar != null && cambio.disposicion_a_pagar !== '') {
      const p = numPos(cambio.disposicion_a_pagar);
      if (!p) return this._invalid('cambio.disposicion_a_pagar');
      actual.disposicion_a_pagar = p;
    } else if (previo.disposicion_a_pagar != null) {
      actual.disposicion_a_pagar = previo.disposicion_a_pagar;
    }

    // snapshot del previo para recalcular delta en C7 / portafolio
    actual.anterior = {
      umbral_ingresos: previo.umbral_ingresos ?? actual.umbral_ingresos,
      minimos_demanda: previo.minimos_demanda ?? actual.minimos_demanda,
      disposicion_a_pagar: previo.disposicion_a_pagar ?? actual.disposicion_a_pagar
    };
    actual.ajustado_por = rol || ROL_DUENYO;
    actual.aplicado = true;
    actual.updated_at = new Date().toISOString();

    this._umbrales.set(pid, actual);
    this._persist.marcarDirty(pid);

    return { status: 200, data: {
      project_id: pid,
      umbral: actual,
      // delta del cambio (para trazas / recalibrado C7)
      delta: this._deltaDe(previo, actual),
      anterior: actual.anterior,
      aplicado: true
    } };
  }

  // Delta del ajuste: diferencia entre el umbral previo y el nuevo (solo numéricos).
  _deltaDe(previo, actual) {
    const delta = {};
    if (previo.umbral_ingresos != null && actual.umbral_ingresos != null) {
      delta.umbral_ingresos = this._round(actual.umbral_ingresos - previo.umbral_ingresos);
    }
    if (previo.disposicion_a_pagar != null && actual.disposicion_a_pagar != null) {
      delta.disposicion_a_pagar = this._round(actual.disposicion_a_pagar - previo.disposicion_a_pagar);
    }
    return delta;
  }

  // ── proyeccion de lectura (NO muta) ──
  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    return { status: 200, data: { project_id: pid, umbral: this._umbrales.get(pid) || umbralVacio() } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolRetunear(params) { return this._procesarRetunear(params); }
}

module.exports = AjustadorUmbrales;
