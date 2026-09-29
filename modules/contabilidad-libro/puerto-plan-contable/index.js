/**
 * contabilidad-libro/puerto-plan-contable — CONVERSOR STATELESS (B6, hoja del plan).
 *
 * Frontera de CODIFICACION del plan contable: import (externo → Set<Cuenta>) y
 * export (plan → externo). El `formato` y el `mapeo` son DECLARABLES — entran como
 * DATO; no hay ninguna codificacion (PGC, CSV, XLSX, codigo de asesor) cableada.
 * Sin `mapeo` declarado solo se acepta el formato canonico declarado 'canonico'.
 *
 * Invariantes:
 *  - La ley/codificacion entra como DATO: sin formato declarado, no se convierte.
 *  - Dato ausente en una Cuenta = `null` + `abierto` (no se estima ni se completa).
 *  - No custodia el plan: el almacen es catalogo-cuentas (B1). Esto solo cruza formatos.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja B6 del plan-construccion y diseno-oop.md (CLASE PuertoPlanContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de una Cuenta del plan. Su clave externa es declarable (mapeo).
const CAMPOS_CUENTA = ['codigo', 'nombre', 'tipo', 'naturaleza', 'padre'];

class PuertoPlanContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-plan-contable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-plan-contable.entrar.response', async (d) => {
      const res = this._entrar(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-plan-contable.entrar.failed', res);
      return res;
    });
  }

  onSalirRequest(e) {
    return this._atender(e, 'salir', 'puerto-plan-contable.salir.response', async (d) => {
      const res = this._salir(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-plan-contable.salir.failed', res);
      return res;
    });
  }

  // ── import: externo → Set<Cuenta> ──
  _entrar(input = {}) {
    const formato = input.formato != null ? String(input.formato) : null;
    if (!formato) return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
      'hay que declarar el formato externo del plan contable', {});

    const externo = input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('externo');

    const mapeo = this._mapeoDe(input, formato);
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa)', { formato });
    }

    const filas = Array.isArray(externo) ? externo
      : (Array.isArray(externo.cuentas) ? externo.cuentas : null);
    if (!filas) return this._invalid('externo.cuentas');

    const cuentas = [];
    const abiertos = [];
    for (const fila of filas) {
      if (!fila || typeof fila !== 'object') continue;
      const cuenta = {};
      const faltan = [];
      for (const campo of CAMPOS_CUENTA) {
        const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
        const v = fila[clave];
        if (v === undefined || v === null || v === '') {
          cuenta[campo] = null;
          if (campo === 'codigo' || campo === 'nombre') faltan.push(campo);
        } else {
          cuenta[campo] = v;
        }
      }
      // Sin codigo no hay cuenta: no se inventa una.
      if (cuenta.codigo == null) { abiertos.push({ fila, faltantes: faltan }); continue; }
      cuentas.push(cuenta);
      if (faltan.length) abiertos.push({ codigo: cuenta.codigo, faltantes: faltan });
    }

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        adaptador_declarado: Boolean(input.mapeo),
        total: cuentas.length,
        abiertos,
        cuentas
      }
    };
  }

  // ── export: plan → externo ──
  _salir(input = {}) {
    const formato = input.formato != null ? String(input.formato) : null;
    if (!formato) return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
      'hay que declarar el formato externo de salida', {});

    const plan = input.plan;
    const filas = Array.isArray(plan) ? plan
      : (plan && Array.isArray(plan.cuentas) ? plan.cuentas : null);
    if (!filas) return this._invalid('plan.cuentas');

    const mapeo = this._mapeoDe(input, formato);
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa)', { formato });
    }

    const externo = filas.map((cuenta) => {
      const fila = {};
      for (const campo of CAMPOS_CUENTA) {
        const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
        fila[clave] = cuenta?.[campo] ?? null;   // ausente → null, no se estima
      }
      return fila;
    });

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        adaptador_declarado: Boolean(input.mapeo),
        total: externo.length,
        externo
      }
    };
  }

  // Resuelve el mapeo declarado. Sin mapeo, solo el formato canonico declarado.
  _mapeoDe(input, formato) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    if (formato === 'canonico' || formato === 'enki') {
      const identidad = {};
      for (const c of CAMPOS_CUENTA) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  toolEntrar(params) { return this._entrar(params); }
  toolSalir(params) { return this._salir(params); }
}

module.exports = PuertoPlanContable;
