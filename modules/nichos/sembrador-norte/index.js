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
 * ── LOS DOS PISOS DEL NORTE (v0.2.0) ───────────────────────────────────────────
 * El norte tiene dos pisos: TENEMOS (lo cableado, `capacidades`) y PODEMOS
 * CONSTRUIR (los encargos que C4 declara al decidir construir un nicho —
 * captura · entrega · cobro). El sembrador siembra de los DOS. Sembrar solo del
 * primero dejaba fuera precisamente los nichos que el sistema decidio crear
 * («si no existe, se crea»): el buscador nacia de medio norte.
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
    this.version = '0.2.0';
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

    // 1. EL NORTE — los DOS pisos. Piso 1 (TENEMOS): lo que sabemos servir y
    //    cobrar hoy. Piso 2 (PODEMOS CONSTRUIR): los nichos que C4 decidio
    //    construir y cuyas tres patas declaro. Sin ninguno de los dos no hay
    //    norte del que sacar semilla (y se dice: no se inventan dominios).
    const norte = await this._leerNorte(proyectoId, input.capacidades);

    if (norte.capacidades.length === 0 && norte.podemos_construir.length === 0) {
      this.eventBus?.publish('nichos.sembrador.norte.sin_norte', {
        project_id: proyectoId,
        territorio,
        detalle: 'el catalogo de capacidades esta vacio en sus DOS pisos (tenemos / podemos construir) — no hay norte del que sacar semilla; el sembrador no inventa dominios',
        timestamp: ahoraISO()
      });
      return {
        status: 200,
        data: { sembradas: [], publicadas: 0, capacidades: 0, por_construir: 0, territorio, motivo: 'sin_norte' }
      };
    }

    // 2. SEMBRAR — una idea por semilla, con la forma que usa el dueno:
    //    «<a quien le vendemos> en <territorio>». Entra por la puerta del
    //    vertical (capturador-semilla), asi que corre la cadena de siempre.
    //    Dedupe por texto: los dos pisos pueden nombrar el mismo nicho.
    const sembradas = [];
    const vistas = new Set();

    const sembrarIdea = (semilla, capacidadId, construir) => {
      const texto = `${semilla} en ${territorio}`;
      if (vistas.has(texto)) return;
      vistas.add(texto);
      this.eventBus?.publish('nichos.semilla.capturar.request', {
        request_id: `sem-norte-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        correlation_id: `sembrador-norte-${Date.now()}`,
        project_id: proyectoId,
        texto,
        origen: 'sembrador-norte',
        territorio,
        capacidad_id: capacidadId,
        por_construir: construir
      });
      sembradas.push({ capacidad_id: capacidadId, semilla, texto, por_construir: construir });
    };

    // Piso 1 — las semillas de lo que YA servimos.
    for (const capacidad of norte.capacidades) {
      for (const semilla of this._semillasDe(capacidad).slice(0, tope)) {
        sembrarIdea(semilla, capacidad.id, false);
      }
    }

    // Piso 2 — los nichos que decidimos construir: se les vuelve a buscar
    // cliente («si no existe, se crea»). UNA idea por nicho, no una por pata:
    // captura/entrega/cobro son el mismo negocio.
    for (const nicho of this._nichosAConstruir(norte.podemos_construir)) {
      sembrarIdea(nicho.texto, nicho.capacidad_id, true);
    }

    this.eventBus?.publish('nichos.sembrador.norte.sembrado', {
      project_id: proyectoId,
      territorio,
      capacidades: norte.capacidades.map((c) => c.id),
      por_construir: norte.podemos_construir.map((c) => c.id),
      publicadas: sembradas.length,
      sembradas,
      timestamp: ahoraISO()
    });

    return {
      status: 200,
      data: {
        sembradas,
        publicadas: sembradas.length,
        capacidades: norte.capacidades.length,
        por_construir: norte.podemos_construir.length,
        territorio
      }
    };
  }

  // =============================================================
  // LECTURA — el catalogo (el norte) y las semillas de cada capacidad
  // =============================================================

  /**
   * _leerNorte — el catalogo del proyecto en sus DOS pisos (vacio si no hay).
   * Piso 1 `capacidades` = TENEMOS · Piso 2 `podemos_construir` = los encargos
   * que C4 declaro al decidir CONSTRUIR. Un catalogo con un solo piso deja al
   * buscador con medio norte: siembra solo de lo que ya servimos.
   */
  async _leerNorte(proyectoId, filtro) {
    let capacidades = [];
    let podemosConstruir = [];
    try {
      const resp = await this._rpc(
        'nichos.catalogo.capacidad.disponibles.request',
        { project_id: proyectoId },
        { timeout_ms: 5000 }
      );
      const datos = (resp && resp.data) || {};
      capacidades = Array.isArray(datos.capacidades) ? datos.capacidades : [];
      podemosConstruir = Array.isArray(datos.podemos_construir) ? datos.podemos_construir : [];
    } catch (_e) {
      capacidades = [];
      podemosConstruir = [];
    }
    if (Array.isArray(filtro) && filtro.length > 0) {
      capacidades = capacidades.filter((c) => filtro.includes(c.id));
      podemosConstruir = podemosConstruir.filter((c) => filtro.includes(c.id));
    }
    return { capacidades, podemos_construir: podemosConstruir };
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

  /**
   * _nichosAConstruir — el PISO 2 convertido en semillas.
   *
   * C4 declara, por nicho, tres patas (`<nicho>:captura|entrega|cobro`). Aqui se
   * colapsan a UNA idea por nicho — las tres patas son el mismo negocio — usando
   * el texto del nicho que viaja en `meta.nicho_texto` (y el slug como fallback
   * honesto). El id de la semilla es el nicho, no la pata: sembrar «...:cobro en
   * Lorca» seria sembrar la pata, no el mercado.
   */
  _nichosAConstruir(encargos) {
    const porNicho = new Map();
    for (const e of (encargos || [])) {
      const meta = (e && e.meta) || {};
      const clave = meta.nicho || (e && e.id) || null;
      if (!clave || porNicho.has(clave)) continue;
      const texto = String(meta.nicho_texto || meta.nicho || '').trim();
      if (!texto) continue;
      porNicho.set(clave, { texto, capacidad_id: clave });
    }
    return Array.from(porNicho.values());
  }
}

module.exports = SembradorNorte;
