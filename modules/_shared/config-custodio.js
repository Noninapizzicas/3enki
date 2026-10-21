'use strict';

/**
 * ConfigCustodio — custodia single-writer de configuración de dominio.
 *
 * INFRAESTRUCTURA (no lógica de negocio): encapsula el patrón
 *   leer → validar cambios → merge profundo → persistir → evento
 * que hoy repiten masa (reglas de masa) y mañana repetirán lotes
 * (capacidad, ventanas, umbrales de aviso) y cualquier custodio futuro.
 *
 * Cada módulo declara SOLO su esquema (contrato):
 *   - esquema        : id del contrato (ej 'reglas-masa-v1')
 *   - path           : ruta del JSON en el storage del proyecto (default '<esquema>.json')
 *   - defaultConfig  : defaults (los nulls = política por declarar)
 *   - bloques        : campos anidados que se mergean EN PROFUNDIDAD
 *   - validadores    : { campo: fn(valorDelCambio) → {field,message} | null }
 *                      validan SOLO lo que viene (campos ausentes no se tocan)
 *   - evento         : evento a publicar al persistir
 *   - campoDatos     : nombre del campo en la response/evento (ej 'reglas')
 *
 * La base (ModuloHibridoReflejo) aporta _leerJson/_editarJson/_rpc/eventBus;
 * el custodio la recibe por composición (ConfigCustodio.crear(this, opts)).
 *
 * Contrato de respuesta — idéntico al de los custodios actuales:
 *   actualizar → { status: 200, data: { [campoDatos]: nuevas } }
 *   leer       → { config, fuente: 'persistida' | 'default' }
 */

// =============================================================
// validarSchema — validación declarativa de entradas planas.
// schema: { campo: { tipo: 'string'|'number'|'boolean'|'object',
//                    requerido?, min?, max?, exclusivo? (min exclusivo), permitirNull? } }
// devuelve null (ok) o { field, message }.
// =============================================================
const validarSchema = (schema, datos) => {
  for (const [campo, reglas] of Object.entries(schema || {})) {
    const v = datos?.[campo];
    const presente = v !== undefined;
    if (reglas.requerido && !presente) return { field: campo, message: `${campo} requerido` };
    if (!presente) continue;
    if (v === null) {
      if (reglas.permitirNull) continue;
      return { field: campo, message: `${campo} no admite null` };
    }
    switch (reglas.tipo) {
      case 'string':
        if (typeof v !== 'string') return { field: campo, message: `${campo} debe ser string` };
        break;
      case 'number':
        if (typeof v !== 'number' || Number.isNaN(v)) return { field: campo, message: `${campo} debe ser número` };
        if (reglas.min !== undefined && (reglas.exclusivo ? v <= reglas.min : v < reglas.min)) {
          return { field: campo, message: `${campo} debe ser ${reglas.exclusivo ? '>' : '≥'} ${reglas.min}` };
        }
        if (reglas.max !== undefined && v > reglas.max) return { field: campo, message: `${campo} debe ser ≤ ${reglas.max}` };
        break;
      case 'boolean':
        if (typeof v !== 'boolean') return { field: campo, message: `${campo} debe ser boolean` };
        break;
      case 'object':
        if (typeof v !== 'object' || Array.isArray(v)) return { field: campo, message: `${campo} debe ser objeto` };
        break;
      default:
        return { field: campo, message: `${campo} tiene tipo de schema desconocido` };
    }
  }
  return null;
};

class ConfigCustodio {
  constructor(base, opts) {
    this._base = base;
    this.esquema = opts.esquema;
    this.path = opts.path || `${opts.esquema}.json`;
    this.defaultConfig = opts.defaultConfig || {};
    this.bloques = opts.bloques || [];
    this.validadores = opts.validadores || {};
    this.evento = opts.evento;
    this.campoDatos = opts.campoDatos || 'config';
  }

  static crear(base, opts) {
    return new ConfigCustodio(base, opts);
  }

  // Lee la config del proyecto: la persistida si es del esquema, si no el default.
  async leer(project_id) {
    const f = await this._base._leerJson(project_id, this.path);
    return (f && f.esquema === this.esquema)
      ? { config: f, fuente: 'persistida' }
      : { config: { ...this.defaultConfig }, fuente: 'default' };
  }

  // Valida (solo lo presente), mergea en profundidad, persiste y publica.
  async actualizar(project_id, cambios) {
    if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return this._base._invalid('cambios');

    for (const [campo, valor] of Object.entries(cambios)) {
      const validador = this.validadores[campo];
      if (!validador) continue;
      const error = validador(valor);
      if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    }

    const { config: actuales } = await this.leer(project_id);
    const nuevas = { ...actuales, ...cambios };
    for (const bloque of this.bloques) {
      if (cambios[bloque] && typeof cambios[bloque] === 'object' && !Array.isArray(cambios[bloque])) {
        nuevas[bloque] = { ...(actuales[bloque] || {}), ...cambios[bloque] };
      }
    }

    const existia = await this._base._leerJson(project_id, this.path);
    if (existia) {
      await this._base._editarJson(project_id, this.path, [{ op: 'replace', path: '', value: nuevas }]);
    } else {
      await this._base._rpc('fs.write.request', { project_id, path: this.path, content: JSON.stringify(nuevas, null, 2) });
    }

    this._base.eventBus?.publish(this.evento, { project_id, [this.campoDatos]: nuevas });
    return { status: 200, data: { [this.campoDatos]: nuevas } };
  }
}

module.exports = { ConfigCustodio, validarSchema };
