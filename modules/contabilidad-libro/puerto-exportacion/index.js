/**
 * contabilidad-libro/puerto-exportacion — CONVERSOR STATELESS (L1, hoja del plan).
 *
 * FRONTERA DE FORMATOS contables estandar hacia el programa del ASEsor; si falta un formato,
 * se CREA (declarandolo). Cruza FORMATO, no decide CONTENIDO: no calcula saldos, no compone el
 * asiento (eso es del diario/ajuste), no firma y no presenta.
 *
 * EL FORMATO ENTRA COMO DATO: el `formato` y el `mapeo` (campo canonico → clave externa) son
 * DECLARABLES. NO hay ningun esquema cableado (ni A3/CSV/XML/…). Sin `formato` declarado NO se
 * convierte; si el formato no tiene `mapeo` declarado y no es el canonico → 422 FORMATO_NO_DECLARABLE.
 *
 * Invariante: dato ausente = desconocido. Un campo que no viene del exterior queda `null` y se
 * declara en `abierto` (jamas se estima ni se completa).
 *
 * `salir` — canonico → formato destino (para el asesor). `entrar` — formato externo → canonico.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated. Ambas ops PREGUNTA → sin ui_handler.
 * Ver hoja L1 del plan-construccion y diseno-oop.md (CLASE PuertoExportacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos del paquete contable exportable. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_PAQUETE = ['ejercicio', 'asientos', 'cuentas', 'terceros', 'saldos'];

class PuertoExportacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-exportacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (PREGUNTA → sin ui_handler) ──
  onSalirRequest(e) {
    return this._atender(e, 'salir', 'puerto-exportacion.salir.response', async (d) => {
      const res = this._salir(d);
      // Conversor puro: no escribe → no hay hecho que anunciar. Su cara es el bus.
      if (res.status !== 200) this.eventBus?.publish('puerto-exportacion.salir.failed', res);
      return res;
    });
  }

  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-exportacion.entrar.response', async (d) => {
      const res = this._entrar(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-exportacion.entrar.failed', res);
      // Si el paquete entrante YA declara su asiento, se sube al libro (best-effort); no se inventa.
      else this._encadenar(res, d);
      return res;
    });
  }

  // ── salir: canonico → formato externo declarado (para el programa del asesor) ──
  _salir(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato contable de salida', { esquemas_declarables: this._esquemas(input) });
    }
    const paquete = input.paquete;
    if (!paquete || typeof paquete !== 'object') return this._invalid('paquete');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const externo = {};
    for (const campo of CAMPOS_PAQUETE) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      externo[clave] = paquete?.[campo] ?? null;   // ausente → null, no se estima
    }

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        direccion: 'salir',
        externo,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO, no decide CONTENIDO: no firma ni presenta (eso es del asesor).
        firmado: false,
        presentado: false
      }
    };
  }

  // ── entrar: formato externo → paquete canonico ──
  _entrar(input = {}) {
    const formato = this._formato(input);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el formato contable de entrada', { esquemas_declarables: this._esquemas(input) });
    }
    const externo = input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('externo');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { formato, esquemas_declarables: this._esquemas(input) });
    }

    const paquete = {};
    const faltantes = [];
    for (const campo of CAMPOS_PAQUETE) {
      const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = externo[clave];
      if (raw === undefined || raw === null || raw === '') { paquete[campo] = null; faltantes.push(campo); }
      else paquete[campo] = raw;
    }
    // Los campos extra del exterior se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_PAQUETE.map((c) => (mapeo[c] != null ? String(mapeo[c]) : c)));
    const metadatos = {};
    for (const [k, v] of Object.entries(externo)) if (!conocidas.has(k)) metadatos[k] = v;
    paquete.metadatos = metadatos;

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        formato,
        direccion: 'entrar',
        paquete,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO, no decide CONTENIDO: se declara que no se compuso nada.
        contenido_compuesto: false,
        abierto: faltantes
      }
    };
  }

  // Si el paquete entrante YA declara un asiento, se sube a asiento-ajuste (B5) por EVENTO.
  _encadenar(res, d) {
    const paquete = res.data.paquete || {};
    const asiento = paquete.asiento || null;
    if (!asiento) return;   // sin asiento declarado NO se fabrica
    try {
      this.eventBus?.publish('asiento-ajuste.entrar.request', {
        project_id: res.data.project_id, asiento, origen: 'puerto-exportacion', correlation_id: d.correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  _formato(input = {}) {
    const f = input.formato != null ? String(input.formato).trim() : '';
    return f || null;
  }

  _esquemas(input = {}) {
    return Array.isArray(input.esquemas_declarables)
      ? input.esquemas_declarables.map((f) => String(f)).filter(Boolean)
      : [];
  }

  _mapeoDe(input, formato, esquemas) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    const canonico = formato === 'canonico' || formato === 'enki';
    if (canonico || esquemas.includes(formato)) {
      const identidad = {};
      for (const c of CAMPOS_PAQUETE) identidad[c] = c;
      return identidad;
    }
    return null;
  }

  // ── Tools ──
  toolSalir(params) { return this._salir(params); }
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = PuertoExportacion;
