/**
 * contabilidad-analitica/aislamiento-negocio — CUSTODIO CON PERSISTENCIA (I4, hoja del plan).
 *
 * Multi-negocio SIN FUGA. Cada negocio tiene su PARCELA y un solo dueño. Un negocio NUNCA
 * se fuga a la parcela de otro: la parcela es la frontera de aislamiento del negocio.
 * (Espejo de la pareja eje negocio <-> persona.)
 *
 * La LEY de escritura no la reimplementa: RECLAMA la parcela en `single-writer` (M2) por
 * EVENTO (`single-writer.reclamar.request`), que es el unico que concede titularidad. Aqui
 * solo se GUARDA la relacion negocio → parcela y se impide que dos negocios compartan una.
 *
 *   · parcela       — PREGUNTA: ¿cual es la parcela (frontera) de este negocio?
 *   · escritor      — PREGUNTA: ¿quien es el UNICO escritor de la parcela de este negocio?
 *   · crear_parcela — ORDEN: crea la parcela del negocio y la reclama en single-writer.
 *
 * Invariantes:
 *  - AISLAMIENTO: una parcela pertenece a UN negocio; un segundo negocio sobre la misma
 *    parcela se RECHAZA (409 PARCELA_OCUPADA). Los negocios no se fugan.
 *  - Dato ausente = desconocido: sin negocio_id declarado NO hay parcela (no se inventa una).
 *  - No se borra: re-crear una parcela del MISMO negocio es idempotente; el historial se apila.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R3 · ESCUCHA: `contabilidad.negocio_registrado` lo emite onboarding-negocio (K1, grupo 5).
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + AISLAMIENTO por parcela.
 * Ver hoja I4 del plan-construccion y diseno-oop.md (CLASE AislamientoNegocio).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class AislamientoNegocio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aislamiento-negocio';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, negocios: Map<negocio_id, NegocioParcela> }
    this._libros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'aislamiento-negocio.json',
      dir: '/contabilidad/aislamiento-negocio',
      snapshot: (pid) => {
        const l = this._libros.get(pid);
        if (!l) return null;
        return { project_id: pid, esquema: l.esquema, negocios: [...l.negocios.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const negocios = new Map();
        for (const n of (data.negocios || [])) {
          if (n && n.negocio_id != null) negocios.set(String(n.negocio_id), n);
        }
        this._libros.set(pid, { esquema: data.esquema || 'contabilidad-aislamiento-negocio-v1', negocios });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela por negocio del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler FIRE-AND-FORGET: un negocio quedo registrado (onboarding-negocio K1) ──
  // No es RPC: no publica response. Deja constancia de que el negocio existe para su parcela.
  onNegocioRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      const negocio_id = d.negocio_id != null ? String(d.negocio_id)
        : (d.negocio != null ? String(d.negocio) : null);
      if (!pid || !negocio_id) return;
      // Solo se ANOTA que el negocio existe; la parcela se crea con la op crear_parcela (ORDEN).
      const libro = this._obtenerOCrear(pid);
      libro.updated_at = new Date().toISOString();
      this._persist.marcarDirty(pid);
    } catch (err) {
      this.logger?.error(`${this.name}.negocio_registrado.error`, { error: err.message });
    }
  }

  // ── handler RPC PREGUNTA (sin ui_handler): la parcela de un negocio ──
  onParcelaRequest(e) {
    return this._atender(e, 'parcela', 'aislamiento-negocio.parcela.response', async (d) => {
      const res = this._parcela(d);
      // PREGUNTA: deriva; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('aislamiento-negocio.parcela.failed', res);
      return res;
    });
  }

  // ── handler RPC PREGUNTA (sin ui_handler): el UNICO escritor de la parcela ──
  onEscritorRequest(e) {
    return this._atender(e, 'escritor', 'aislamiento-negocio.escritor.response', async (d) => {
      const res = this._escritor(d);
      if (res.status !== 200) this.eventBus?.publish('aislamiento-negocio.escritor.failed', res);
      return res;
    });
  }

  // ── handler RPC ORDEN (ui_handler: el humano crea la parcela del negocio) ──
  onCrearParcelaRequest(e) {
    return this._atender(e, 'crear_parcela', 'aislamiento-negocio.crear_parcela.response', async (d) => {
      const res = await this._crear_parcela(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: una parcela de negocio quedo creada (aislada).
        this.eventBus?.publish('contabilidad.negocio_parcela_creada', {
          project_id: res.data.project_id,
          negocio_id: res.data.negocio_id,
          parcela: res.data.parcela,
          escritor: res.data.escritor,
          creada: res.data.creada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('aislamiento-negocio.crear_parcela.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // parcela(negocio_id|parcela) → la FRONTERA del negocio (PREGUNTA, no muta)
  // ══════════════════════════════════════════════════════════════════════
  _parcela(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio_id = this._negocioId(input);
    const parcela_pedida = input.parcela != null ? String(input.parcela).trim() : '';

    if (!negocio_id && !parcela_pedida) return this._invalid('negocio_id');

    const libro = this._libros.get(pid) || null;
    const negocios = libro ? [...libro.negocios.values()] : [];

    let encontrado = null;
    if (negocio_id) encontrado = libro ? (libro.negocios.get(negocio_id) || null) : null;
    if (!encontrado && parcela_pedida) encontrado = negocios.find((n) => n.parcela === parcela_pedida) || null;

    if (!encontrado) {
      // Dato ausente = desconocido: sin parcela declarada NO se inventa una.
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio_id: negocio_id || null,
          parcela: null,
          existe: false,
          aislado: true,
          abierto: { parcela: 'el negocio no tiene parcela declarada (se declara el hueco, no se inventa)' }
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio_id: encontrado.negocio_id,
        parcela: encontrado.parcela,
        escritor: encontrado.escritor,
        existe: true,
        // El aislamiento: esta parcela y NINGUNA otra es el suelo de este negocio.
        aislado: true,
        creada_en: encontrado.creada_en,
        abierto: { parcela: null }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // escritor(negocio_id|parcela) → el UNICO escritor (PREGUNTA, no muta)
  // ══════════════════════════════════════════════════════════════════════
  _escritor(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio_id = this._negocioId(input);
    const parcela_pedida = input.parcela != null ? String(input.parcela).trim() : '';
    if (!negocio_id && !parcela_pedida) return this._invalid('negocio_id');

    const libro = this._libros.get(pid) || null;
    let encontrado = null;
    if (negocio_id) encontrado = libro ? (libro.negocios.get(negocio_id) || null) : null;
    if (!encontrado && parcela_pedida && libro) {
      encontrado = [...libro.negocios.values()].find((n) => n.parcela === parcela_pedida) || null;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio_id: encontrado ? encontrado.negocio_id : (negocio_id || null),
        parcela: encontrado ? encontrado.parcela : null,
        // Sin parcela no hay titular: nadie es escritor (no se asume).
        escritor: encontrado ? encontrado.escritor : null,
        unico_escritor: Boolean(encontrado),
        abierto: encontrado ? null : { parcela: 'el negocio no tiene parcela: no hay titular (no se asume)' }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // crear_parcela(negocio_id, escritor?) → parcela aislada + reclamada (ORDEN)
  // ══════════════════════════════════════════════════════════════════════
  async _crear_parcela(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const negocio_id = this._negocioId(input);
    if (!negocio_id) return this._invalid('negocio_id');

    const escritor = input.escritor != null ? String(input.escritor).trim()
      : (input.rol != null ? String(input.rol).trim() : negocio_id);
    if (!escritor) return this._invalid('escritor');

    // La parcela por defecto es la del propio negocio; una parcela nombrada es declarable.
    const parcela = (input.parcela != null && String(input.parcela).trim())
      ? String(input.parcela).trim()
      : `negocio:${negocio_id}`;

    const libro = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();

    // AISLAMIENTO: si la parcela ya es de OTRO negocio, se RECHAZA (los negocios no se fugan).
    const ocupante = [...libro.negocios.values()].find((n) => n.parcela === parcela) || null;
    if (ocupante && ocupante.negocio_id !== negocio_id) {
      return this._errorResponse(409, 'PARCELA_OCUPADA',
        'la parcela ya pertenece a otro negocio: los negocios NO se fugan',
        { project_id: pid, parcela, ocupante: ocupante.negocio_id, pretendiente: negocio_id });
    }

    const existente = libro.negocios.get(negocio_id) || null;
    const ya_era = Boolean(existente && existente.parcela === parcela);

    const negocio = existente || {
      negocio_id, parcela, escritor, creada_en: ahora, historial: []
    };
    negocio.parcela = parcela;
    negocio.escritor = escritor;
    negocio.historial = Array.isArray(negocio.historial) ? negocio.historial : [];
    if (!ya_era) negocio.historial.push({ parcela, escritor, en: ahora });

    libro.negocios.set(negocio_id, negocio);
    libro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    // SUBE la reclamacion a la LEY de escritura (M2) por EVENTO — nunca import.
    // Best-effort: si la ley no esta viva, la parcela queda creada y se declara el hueco.
    const reclamacion = await this._rpc('single-writer.reclamar.request', { project_id: pid, parcela, escritor });

    return {
      status: 200,
      data: {
        project_id: pid,
        negocio_id,
        parcela,
        escritor,
        creada: !ya_era,
        ya_era,
        aislada: true,
        total_negocios: libro.negocios.size,
        reclamada: Boolean(reclamacion && reclamacion.status === 200),
        abierto: reclamacion ? null
          : { single_writer: 'no se pudo subir la reclamacion a single-writer: la parcela quedo creada y la ley de escritura se declara abierta' }
      }
    };
  }

  _negocioId(input = {}) {
    const raw = input.negocio_id !== undefined ? input.negocio_id
      : (input.negocio !== undefined ? input.negocio
        : (input.n !== undefined ? input.n : null));
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    return s || null;
  }

  _obtenerOCrear(pid) {
    let l = this._libros.get(pid);
    if (!l) {
      l = { esquema: 'contabilidad-aislamiento-negocio-v1', negocios: new Map() };
      this._libros.set(pid, l);
      this._persist.marcarDirty(pid);
    }
    return l;
  }

  // Lectura directa (mismo proceso) — no muta.
  negociosDe(pid) {
    const l = pid ? this._libros.get(pid) : null;
    return l ? [...l.negocios.values()] : [];
  }

  // ── Tools ──
  toolParcela(params) { return this._parcela(params); }
  toolEscritor(params) { return this._escritor(params); }
  toolCrearParcela(params) { return this._crear_parcela(params); }
}

module.exports = AislamientoNegocio;
