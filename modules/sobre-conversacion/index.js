'use strict';
/**
 * sobre-conversacion — P01 · REFLEJO puro (S1–S3, D1).
 *
 * La DEFINICIÓN ÚNICA de sobre válido y el valor `Sobre`. No tiene almacén de
 * negocio: la lista de campos obligatorios vive declarada en su `context.json`
 * (decisión abierta O3 del diseño). Si esa lista está vacía, el módulo responde
 * `POR_DECLARAR` y NO valida — jamás rellena la lista por su cuenta.
 *
 * Invariantes que sostiene:
 *   S1  ningún campo ausente se rellena por defecto: queda `DESCONOCIDO` y sale
 *       en `faltantes()`. `padre` ausente es `NINGUNO` (ausencia declarada, no relleno).
 *   S2  el sobre es inmutable: `conCampos()` devuelve OTRO objeto, nunca muta el original.
 *   S3  el sobre no transporta contenido: sólo identifica (el contenido es del cuaderno).
 *   D1  hay UNA definición en el sistema; este módulo es su dueño.
 *
 * Contrato (bus, request/response + hecho):
 *   sobre.definicion.request { request_id, camposObligatorios?, declarar?, declaradaPor? }
 *     → sobre.definicion.response { request_id, status, data: { definicion, fuente } }
 *   sobre.construir.request  { request_id, declaracion, definicion?, nuevos? }
 *     → sobre.construir.response { request_id, status, data: { sobre, faltantes, estado } }
 *   sobre.validar.request    { request_id, sobre|declaracion, definicion? }
 *     → sobre.validar.response  { request_id, status, data: { veredicto } }
 *     → sobre.validar.failed    (sólo cuando el payload no trae sobre: error de dominio)
 *   hecho: sobre.definicion_cambiada { antes, despues, declaradaPor }
 *     (se publica DESPUÉS de adoptar la definición, y sólo si de verdad cambió)
 *
 * Isla: no consulta almacenes ajenos, no escribe, no emite hechos que no describan
 * lo que este módulo hizo. Las dependencias son por EVENTO, nunca por require.
 */

const fsSync = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const DESCONOCIDO = 'DESCONOCIDO';
const NINGUNO = 'NINGUNO';

/**
 * Un ÚNICO mapa de alias por campo de identidad. El sobre se RECONOCE campo a
 * campo (nombres alternativos del mismo campo), nunca se adivina por el contenido
 * del mensaje: eso es lo que hace reproducible la clasificación.
 */
const ALIAS = {
  proyecto: ['proyecto', 'project_id', 'id_proyecto'],
  conversacion: ['conversacion', 'conversation_id', 'id_conversacion'],
  participante: ['participante', 'participant_id', 'id_participante'],
  mensaje: ['mensaje', 'mensaje_id', 'message_id', 'id_mensaje'],
  padre: ['padre', 'parent_id', 'id_padre'],
  instante: ['instante', 'timestamp', 'en']
};
const CAMPOS = Object.keys(ALIAS);

class SobreConversacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sobre-conversacion';
    this.version = 'reflejo-0.1.0';
    // Definición vigente (D1). Se hidrata de context.json en onLoad.
    this.definicion = { camposObligatorios: [] };
    this.fuenteDefinicion = 'context.json';
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.definicion = this._definicionDeclarada();
    this.fuenteDefinicion = 'context.json';
    if (!this.definicion.camposObligatorios.length) {
      // Degradación honesta: sin definición declarada no se valida nada.
      this.logger?.warn('sobre-conversacion.definicion.por_declarar', { module: this.name });
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Handlers RPC — una línea cada uno (patrón real del bus)
  // ───────────────────────────────────────────────────────────────────────

  onDefinicionRequest(e) {
    return this._atender(e, 'definicion', 'sobre.definicion.response', (d) => this._definicion(d));
  }

  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'sobre.construir.response', (d) => this._construir(d));
  }

  onValidarRequest(e) {
    return this._atender(e, 'validar', 'sobre.validar.response', (d) => this._validar(d));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Proyecciones (aquí vive la lógica de dominio)
  // ───────────────────────────────────────────────────────────────────────

  async _definicion(d = {}) {
    const declarados = Array.isArray(d.camposObligatorios) ? d.camposObligatorios : null;
    if (declarados && d.declarar === true) {
      const antes = [...this.definicion.camposObligatorios];
      const despues = this._limpiarCampos(declarados);
      if (JSON.stringify(antes) !== JSON.stringify(despues)) {
        this.definicion = { camposObligatorios: despues };
        this.fuenteDefinicion = 'payload';
        await this._publicarEvento('sobre.definicion_cambiada', {
          antes,
          despues,
          declaradaPor: d.declaradaPor || null
        });
      }
    }
    return {
      status: 200,
      data: {
        definicion: { camposObligatorios: [...this.definicion.camposObligatorios] },
        fuente: this.fuenteDefinicion
      }
    };
  }

  /**
   * Copia campo a campo. Lo que no venga queda DESCONOCIDO (S1); `padre`
   * ausente queda NINGUNO. Con `nuevos` re-emite el sobre SIN mutar el original (S2).
   */
  _construir(d = {}) {
    const declaracion = d.declaracion || d.sobre || {};
    const definicion = this._definicionDe(d.definicion);
    const base = this._copiar(declaracion);
    const sobre = d.nuevos && typeof d.nuevos === 'object' ? this._conCampos(base, d.nuevos) : base;
    const faltantes = this._faltantes(sobre, definicion);
    return {
      status: 200,
      data: {
        sobre,
        faltantes,
        estado: this._estado(sobre, definicion, faltantes),
        definicion
      }
    };
  }

  /** El veredicto — la implementación ÚNICA que la puerta y el clasificador replican por isla. */
  async _validar(d = {}) {
    const sobre = d.sobre && typeof d.sobre === 'object' ? d.sobre : (d.declaracion ? this._copiar(d.declaracion) : null);
    if (!sobre) {
      await this._publicarEvento('sobre.validar.failed', { motivo: 'SOBRE_AUSENTE' });
      return this._errorResponse(400, 'INVALID_INPUT', 'sobre (o declaracion) requerido', { kind: 'domain', field: 'sobre' });
    }
    const definicion = this._definicionDe(d.definicion);
    const faltantes = this._faltantes(sobre, definicion);
    const camposPresentes = CAMPOS.filter((c) => this._presente(sobre[c]));
    return {
      status: 200,
      data: {
        veredicto: {
          estado: this._estado(sobre, definicion, faltantes),
          faltantes,
          camposPresentes,
          sobre
        }
      }
    };
  }

  /** @returns {string[]} nombres de los campos obligatorios que el sobre NO trae. Nunca valores por defecto. */
  _faltantes(sobre, definicion) {
    return definicion.camposObligatorios.filter((campo) => !this._presente(sobre[campo]));
  }

  _es_completo(sobre, definicion) {
    return this._faltantes(sobre, definicion).length === 0;
  }

  _estado(sobre, definicion, faltantes) {
    // Sin definición declarada NO se valida: se declara la ausencia (O3).
    if (!definicion.camposObligatorios.length) return 'POR_DECLARAR';
    const alguno = CAMPOS.some((c) => this._presente(sobre[c]));
    if (!alguno) return 'AUSENTE';
    return faltantes.length === 0 ? 'COMPLETO' : 'PARCIAL';
  }

  /** ¿este sobre y otro hablan del mismo hilo? Mismo proyecto y misma conversación. */
  _cubre_a(a, b) {
    if (!a || !b) return false;
    if (!this._presente(a.proyecto) || !this._presente(a.conversacion)) return false;
    return a.proyecto === b.proyecto && a.conversacion === b.conversacion;
  }

  /** Re-emite: objeto NUEVO con los campos declarados encima. El original NO se toca (S2). */
  _conCampos(sobre, nuevos) {
    const out = { ...sobre };
    for (const campo of CAMPOS) {
      const valor = this._buscar(nuevos, campo);
      if (valor !== undefined) out[campo] = this._valor(campo, valor);
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  _copiar(declaracion) {
    const src = declaracion && typeof declaracion === 'object' ? declaracion : {};
    const sobre = {};
    for (const campo of CAMPOS) sobre[campo] = this._valor(campo, this._buscar(src, campo));
    return sobre;
  }

  _buscar(src, campo) {
    if (!src || typeof src !== 'object') return undefined;
    for (const nombre of ALIAS[campo]) {
      const v = src[nombre];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  _valor(campo, valor) {
    if (valor === undefined || valor === null || valor === '') return campo === 'padre' ? NINGUNO : DESCONOCIDO;
    return valor;
  }

  _presente(valor) {
    return valor !== undefined && valor !== null && valor !== '' && valor !== DESCONOCIDO && valor !== NINGUNO;
  }

  _definicionDe(definicion) {
    if (definicion && Array.isArray(definicion.camposObligatorios)) {
      return { camposObligatorios: this._limpiarCampos(definicion.camposObligatorios) };
    }
    return { camposObligatorios: [...this.definicion.camposObligatorios] };
  }

  _limpiarCampos(campos) {
    return [...new Set(campos.filter((c) => typeof c === 'string' && CAMPOS.includes(c)))];
  }

  _definicionDeclarada() {
    try {
      const raw = fsSync.readFileSync(path.join(__dirname, 'context.json'), 'utf-8');
      const ctx = JSON.parse(raw);
      const declarados = ctx?.definicion?.camposObligatorios || ctx?.camposObligatorios || [];
      return { camposObligatorios: this._limpiarCampos(Array.isArray(declarados) ? declarados : []) };
    } catch (err) {
      this.logger?.warn('sobre-conversacion.context.ilegible', { module: this.name, error: err.message });
      return { camposObligatorios: [] };
    }
  }
}

module.exports = SobreConversacion;
