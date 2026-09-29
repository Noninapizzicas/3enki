/**
 * contabilidad-entrada/puerto-documento — CONVERSOR STATELESS (A4.2, hoja del plan).
 *
 * Frontera de las FORMAS DECLARABLES del documento: convierte una representacion
 * EXTERNA (lo que el sitio tenga: JSON de un emisor, fila de un CSV, salida de un
 * conector) en el `Documento` canonico del dominio. El adaptador lo pone el sitio:
 * el `mapeo` (campo canonico → clave externa) y las `formas_declarables` entran
 * como DATO en el payload — NO hay ninguna forma cableada en el codigo.
 *
 * Invariantes respetadas:
 *  - La ley/formatos entran como DATO: sin `forma` declarada → no se convierte nada.
 *  - Dato ausente = desconocido: un campo que no viene del exterior queda `null` y
 *    se declara en `abierto` (jamas se estima).
 *  - No asienta, no juzga: solo traduce forma. La conformacion a Hecho es competencia
 *    de normalizador-hecho (A2); la contrapartida se resuelve despues.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A4.2 del plan-construccion y diseno-oop.md (CLASE PuertoDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos del Documento. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_DOCUMENTO = ['tipo', 'emisor', 'numero', 'fecha', 'base', 'impuestos', 'total', 'moneda'];

class PuertoDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea: delega a _atender) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-documento.entrar.response', async (d) => {
      const res = this._entrar(d);
      // Cierra el circulo: exito → evento de dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.documento_normalizado', {
          project_id: d.project_id || null,
          forma: res.data.forma,
          documento: res.data.documento,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('puerto-documento.entrar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: externo → Documento canonico ──
  _entrar(input = {}) {
    const externo = input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('externo');

    const formas = Array.isArray(input.formas_declarables)
      ? input.formas_declarables.map((f) => String(f))
      : [];
    const forma = input.forma != null ? String(input.forma) : null;

    // La frontera de formas es DECLARABLE: sin forma declarada no se adivina.
    if (!forma) {
      return this._errorResponse(400, 'FORMA_NO_DECLARADA',
        'hay que declarar la forma del documento externo', { formas_declarables: formas });
    }
    if (!formas.includes(forma)) {
      return this._errorResponse(422, 'FORMA_NO_DECLARABLE',
        'la forma no esta entre las declarables del sitio', { forma, formas_declarables: formas });
    }

    const mapeo = (input.mapeo && typeof input.mapeo === 'object') ? input.mapeo : null;
    const doc = this._aDocumento(externo, mapeo);
    if (!doc.ok) return doc.res;

    return {
      status: 200,
      data: {
        project_id: input.project_id || null,
        forma,
        documento: doc.value,
        adaptador_declarado: Boolean(mapeo),
        abierto: doc.faltantes
      }
    };
  }

  // Traduce una representacion externa al Documento canonico.
  // El `mapeo` declara, por campo canonico, la clave externa que lo porta.
  _aDocumento(externo, mapeo) {
    const value = {};
    const faltantes = [];
    for (const campo of CAMPOS_DOCUMENTO) {
      const clave = mapeo && mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = externo[clave];
      if (raw === undefined || raw === null || raw === '') {
        value[campo] = null;              // desconocido — NO se estima
        faltantes.push(campo);
      } else {
        value[campo] = raw;
      }
    }
    // Los campos extra del exterior se conservan bajo `metadatos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_DOCUMENTO.map((c) => (mapeo && mapeo[c] != null ? String(mapeo[c]) : c)));
    const metadatos = {};
    for (const [k, v] of Object.entries(externo)) if (!conocidas.has(k)) metadatos[k] = v;
    value.metadatos = metadatos;

    return { ok: true, value, faltantes };
  }

  // Tool directa (misma proyeccion, sin bus).
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = PuertoDocumento;
