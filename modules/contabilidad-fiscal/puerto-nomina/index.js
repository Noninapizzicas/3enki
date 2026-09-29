/**
 * contabilidad-fiscal/puerto-nomina — PUENTE STATELESS (G4, hoja del plan).
 *
 * LA FRONTERA CON EL SISTEMA DE NOMINAS EXTERNO. Por aqui ENTRA el dato de nomina de fuera:
 * la nomina que ha calculado el programa de personal (o la gestoria), o el hecho que el sistema
 * externo publica. Contabilidad se ADAPTA: NO impone formato, NO exige un catalogo de conceptos
 * y NO calcula nada — RECIBE.
 *
 * ORIGEN DECLARABLE (atributo del diseno): que sistema/canal entrega la nomina lo DECLARA el
 * negocio (`origen`); si el origen no existe todavia, se CREA el puerto para el. Sin `origen`
 * declarado NO se adivina de donde viene el dato: se declara el puerto y se dice que hay que
 * declararlo (nada cableado: ningun proveedor, ningun formato, ningun concepto tipo).
 *
 * LOS CONCEPTOS, TIPOS Y BASES SON DECLARABLES: el puerto NO normaliza un concepto a un catalogo
 * fijo ni conoce ninguna tabla legal. Transporta los conceptos TAL CUAL llegan, y declara en
 * `faltantes` los campos que la propia fuente declaro como minimos y no vinieron.
 *
 * ESTE MODULO NO CALCULA LA NOMINA: no deriva bruto, ni retencion, ni cotizacion, ni neto. Eso
 * es del sistema externo; aqui solo se RECIBE el hecho y se le da entrada al bus.
 *
 * Invariante: dato ausente = desconocido (se declara en `faltantes`), jamas se estima ni se
 * completa. La fuente manda.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G4 del plan-construccion y diseno-oop.md (CLASE PuertoNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Molde de los campos CANONICOS del hecho de nomina (los NOMBRES del sobre, no valores).
// Los conceptos y sus tipos NO se cablean: viajan en `conceptos` tal cual los entrega la fuente.
const CAMPOS_NOMINA = ['empleado', 'periodo', 'bruto', 'retencion', 'cotizacion_trabajador', 'neto', 'conceptos', 'moneda'];

class PuertoNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── RPC: el sistema de personal pide entregar una nomina por el puerto ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'puerto-nomina.recibir.response', async (d) => {
      const res = this._recibir(d);
      if (res.status === 200) {
        this._emitirRecibida(res, d);
      } else {
        this.eventBus?.publish('puerto-nomina.recibir.failed', res);
      }
      return res;
    });
  }

  // ── Fire-and-forget: el sistema externo ya emitio su nomina en su bus ──
  onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._recibir(d);
    if (res.status === 200) this._emitirRecibida(res, d);
    else this.eventBus?.publish('puerto-nomina.recibir.failed', res);
    return res;
  }

  // ── Fire-and-forget: la nomina quedo emitida por el sistema de personal ──
  onNominaEmitida(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._recibir(d);
    if (res.status === 200) this._emitirRecibida(res, d);
    else this.eventBus?.publish('puerto-nomina.recibir.failed', res);
    return res;
  }

  // Exito → evento de dominio: la nomina entro al sistema. Lo LEE recibo-nomina (G1).
  _emitirRecibida(res, d) {
    this.eventBus?.publish('contabilidad.nomina_recibida', {
      project_id: res.data.project_id,
      origen: res.data.origen,
      canal: res.data.canal,
      nomina: res.data.nomina,
      clave_natural: res.data.nomina.clave_natural,
      faltantes: res.data.nomina.faltantes,
      correlation_id: (d && d.correlation_id) || null
    });
  }

  // ── proyeccion: nomina externa → HechoNomina (la frontera trae, no calcula) ──
  _recibir(input = {}) {
    const pid = input.project_id || this.project_id || null;

    // El ORIGEN es DECLARABLE: sin el no se adivina de que sistema viene la nomina.
    const origen = input.origen != null ? String(input.origen).trim()
      : (input.sistema != null ? String(input.sistema).trim() : '');
    if (!origen) {
      return this._errorResponse(400, 'ORIGEN_NO_DECLARADO',
        'hay que declarar el origen del dato de nomina (que sistema/canal lo entrega); si el origen no existe, se crea el puerto para el',
        { origenes_declarables: this._origenes(input) });
    }

    // La nomina cruda: se acepta TAL CUAL la entrega la fuente (no se impone forma).
    const externo = input.nomina != null ? input.nomina : (input.hecho != null ? input.hecho : input.entrada);
    if (externo === undefined || externo === null) return this._invalid('nomina');

    const fuente = (externo && typeof externo === 'object') ? externo : { documento: externo };
    const canal = input.canal != null ? String(input.canal) : null;

    // Los campos canonicos se COPIAN si vienen; lo ausente queda null y se declara en faltantes.
    const valores = {};
    const faltantes = [];
    for (const campo of CAMPOS_NOMINA) {
      const raw = fuente[campo];
      if (raw === undefined || raw === null || raw === '') {
        valores[campo] = null;
        faltantes.push(campo);
      } else if (campo === 'bruto' || campo === 'retencion' || campo === 'cotizacion_trabajador' || campo === 'neto') {
        // Se COPIA el importe; NO se calcula ninguno (el calculo es del sistema externo).
        valores[campo] = this._num(raw);
        if (valores[campo] === null) faltantes.push(campo);
      } else {
        valores[campo] = raw;
      }
    }

    // Los CONCEPTOS viajan declarados, tal cual; ningun catalogo cableado de conceptos/tipos/bases.
    const conceptos = Array.isArray(fuente.conceptos)
      ? fuente.conceptos.map((c) => (c && typeof c === 'object' ? { ...c } : { concepto: c }))
      : (valores.conceptos !== null ? valores.conceptos : []);

    // Minimos DECLARADOS por la fuente: si los declara, se verifican; si no, no se le exige nada.
    const minimos = Array.isArray(input.campos_minimos) ? input.campos_minimos.map(String) : null;
    const minimos_faltantes = minimos
      ? minimos.filter((c) => fuente[c] === undefined || fuente[c] === null || fuente[c] === '')
      : [];

    // La clave natural: la que declara la fuente, o derivada del molde. NO se inventa identidad.
    const clave_natural = input.clave_natural != null ? String(input.clave_natural)
      : this._clave(fuente, valores);

    // Campos extra del sistema externo: se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_NOMINA);
    const metadatos = {};
    for (const [k, v] of Object.entries(fuente)) if (!conocidas.has(k)) metadatos[k] = v;

    return {
      status: 200,
      data: {
        project_id: pid,
        origen,
        canal,
        contrato: minimos ? 'declarado' : 'no_declarado',
        minimos_faltantes,
        nomina: {
          origen,
          canal,
          clave_natural,
          ...valores,
          conceptos,
          metadatos,
          faltantes,
          abierto: faltantes,
          // El puerto TRAE el hecho; NO lo calcula ni lo interpreta.
          calculado_aqui: false,
          calculo_delegado_a: 'sistema-de-nomina-externo',
          recibido_en: new Date().toISOString()
        }
      }
    };
  }

  // La clave natural del hecho: la que declara la fuente, o derivada del molde declarado.
  _clave(fuente, valores) {
    if (fuente && fuente.clave != null) return String(fuente.clave);
    const partes = [valores.empleado, valores.periodo];
    if (!partes.some((v) => v !== null && v !== undefined)) return null;
    return partes.map((v) => (v === null || v === undefined ? '-' : String(v))).join('|');
  }

  // Los origenes declarables los declara el sitio; el modulo NO conoce ningun sistema de memoria.
  _origenes(input = {}) {
    return Array.isArray(input.origenes_declarables)
      ? input.origenes_declarables.map((c) => String(c)).filter(Boolean)
      : [];
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolRecibir(params) { return this._recibir(params); }
}

module.exports = PuertoNomina;
