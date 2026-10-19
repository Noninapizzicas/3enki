'use strict';

/**
 * sembrador-norte — el vertical NICHOS arranca SOLO, por donde sabemos cobrar.
 *
 * El problema que resuelve: el buscador (sondeador-territorio) tiene NORTE —
 * el iman del catalogo de capacidades — pero el norte solo ORDENA lo que ya
 * entro. La SEMILLA seguia viniendo de fuera: el dueno escribia una idea al
 * bot, y el vertical juzgaba lo que le llegara. Con eso, la mina se llenaba de
 * dominios donde no podemos servir (la competencia del taller de crochet), que
 * es exactamente «buscar donde nosotros fallamos».
 *
 * Este modulo cierra ese hueco por el otro extremo: SIEMBRA. Lee el catalogo
 * de lo que sabemos ENTREGAR y COBRAR (el NORTE) y de cada capacidad saca sus
 * semillas (meta.semillas = a QUIEN le vendemos eso), las cruza con el
 * territorio y publica la idea COMPLETA en la puerta del vertical
 * (`nichos.semilla.capturar.request`), igual que si la hubiera escrito el
 * dueno: «pizzeria en Lorca». La cadena hace el resto — normaliza, sondea,
 * anota contra el norte, juzga.
 *
 * Nada se inventa: sin capacidades declaradas NO siembra; pulsa
 * `nichos.sembrador.norte.sin_norte` y lo dice. La semilla sale SIEMPRE del
 * catalogo (el dato), nunca de una lista clavada en el codigo.
 *
 * Patron: ModuloHibridoReflejo (REFLEJO puro, JS determinista). Sin LLM: la
 * semilla es datos del catalogo cruzados con el territorio.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const ahoraISO = () => new Date().toISOString();
const MAX_SEMILLAS_POR_CAPACIDAD = 3;

class SembradorNorte extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sembrador-norte';
    this.version = '0.1.0';
  }

  // ── RPC HANDLERS ──
  onSembrarRequest(e) {
    return this._atender(
      e,
      'sembrar',
      'nichos.sembrador.norte.sembrar.response',
      (d) => this._sembrar(d)
    );
  }

  // =============================================================
  // PROYECCION — _sembrar
  // =============================================================

  /**
   * _sembrar — siembra el vertical con las ideas que nacen de NUESTRO norte.
   *
   * @param {string}   input.project_id  proyecto del vertical (obligatorio)
   * @param {string}   input.territorio  zona donde buscamos clientes (obligatorio)
   * @param {string[]} [input.capacidades]  filtra por ids de capacidad (opcional)
   * @param {number}   [input.max_semillas] tope de semillas por capacidad
   * @returns {status, data} sembradas[] + publicadas
   */
  async _sembrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.territorio || typeof input.territorio !== 'string') return this._invalid('territorio');

    const proyectoId = input.project_id;
    const territorio = input.territorio.trim();
    const tope = Number.isInteger(input.max_semillas) && input.max_semillas > 0
      ? input.max_semillas
      : MAX_SEMILLAS_POR_CAPACIDAD;

    // 1. EL NORTE — lo que sabemos entregar y cobrar. Es la FUENTE de la
    //    semilla: sin catalogo no hay nada que sembrar (y se dice).
    const capacidades = await this._leerNorte(proyectoId, input.capacidades);

    if (capacidades.length === 0) {
      this.eventBus?.publish('nichos.sembrador.norte.sin_norte', {
        project_id: proyectoId,
        territorio,
        detalle: 'el catalogo de capacidades esta vacio — no hay norte del que sacar semilla; el sembrador no inventa dominios',
        timestamp: ahoraISO()
      });
      return {
        status: 200,
        data: { sembradas: [], publicadas: 0, capacidades: 0, territorio, motivo: 'sin_norte' }
      };
    }

    // 2. SEMBRAR — una idea por semilla, con la forma que usa el dueno:
    //    «<a quien le vendemos> en <territorio>». Entra por la puerta del
    //    vertical (capturador-semilla), asi que corre la cadena de siempre.
    const sembradas = [];
    for (const capacidad of capacidades) {
      for (const semilla of this._semillasDe(capacidad).slice(0, tope)) {
        const texto = `${semilla} en ${territorio}`;
        this.eventBus?.publish('nichos.semilla.capturar.request', {
          request_id: `sem-norte-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          correlation_id: `sembrador-norte-${Date.now()}`,
          project_id: proyectoId,
          texto,
          origen: 'sembrador-norte',
          territorio,
          capacidad_id: capacidad.id
        });
        sembradas.push({ capacidad_id: capacidad.id, semilla, texto });
      }
    }

    this.eventBus?.publish('nichos.sembrador.norte.sembrado', {
      project_id: proyectoId,
      territorio,
      capacidades: capacidades.map((c) => c.id),
      publicadas: sembradas.length,
      sembradas,
      timestamp: ahoraISO()
    });

    return {
      status: 200,
      data: {
        sembradas,
        publicadas: sembradas.length,
        capacidades: capacidades.length,
        territorio
      }
    };
  }

  // =============================================================
  // LECTURA — el catalogo (el norte) y las semillas de cada capacidad
  // =============================================================

  /** _leerNorte — capacidades DISPONIBLES del proyecto (vacio si no hay). */
  async _leerNorte(proyectoId, filtro) {
    let capacidades = [];
    try {
      const resp = await this._rpc(
        'nichos.catalogo.capacidad.disponibles.request',
        { project_id: proyectoId },
        { timeout_ms: 5000 }
      );
      capacidades = resp && resp.data && Array.isArray(resp.data.capacidades)
        ? resp.data.capacidades
        : [];
    } catch (_e) {
      capacidades = [];
    }
    if (Array.isArray(filtro) && filtro.length > 0) {
      capacidades = capacidades.filter((c) => filtro.includes(c.id));
    }
    return capacidades;
  }

  /**
   * _semillasDe — a QUIEN le vendemos esta capacidad (el giro del cliente).
   * Sale del catalogo: `meta.semillas` es la declaracion explicita; si no la
   * hay, `meta.dominio` es el minimo honesto. Nunca una lista clavada aqui.
   */
  _semillasDe(capacidad) {
    const meta = (capacidad && capacidad.meta) || {};
    if (Array.isArray(meta.semillas) && meta.semillas.length > 0) {
      return meta.semillas.map((s) => String(s).trim()).filter((s) => s.length > 0);
    }
    if (meta.dominio) return [String(meta.dominio)];
    return [];
  }
}

module.exports = SembradorNorte;
