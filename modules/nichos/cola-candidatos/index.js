/**
 * nichos/cola-candidatos — CUSTODIO CON PERSISTENCIA (L2, hoja del plan).
 *
 * COLA PERSISTENTE de CANDIDATOS a validar: el BUFFER del cuello de botella (el
 * embudo de validacion C). Sondeo-territorio (B1) encola candidatos
 * (_encolar / nichos.candidato.encontrado) y batch-validacion (C5) los TOMA en
 * lotes (_tomarN -> lote, SOLO C5 saca). Es el desacople entre la produccion de
 * candidatos (barrido) y el consumo (validacion en paralelo).
 *
 * CUSTODIO (patrón real de /criterio-viabilidad): single-writer de la cola — el
 * buffer lo muta UN producto-consumidor a la vez. La toma de lote guarda que solo
 * C5 extraiga (guard de consumidor). Proyecciones _encolar, _tomarN, _longitud.
 * Persiste por proyecto con PosPersistencia (storage /prisma/nichos/cola-candidatos.json),
 * restaura en project.activated y vuelca en onUnload. Emisor/par de fallo.
 *
 * Orden FIFO: los candidatos se toman en el orden en que se encolaron (justicia
 * del embudo — los primeros candidatos se validan primero).
 *
 * Ver hoja L2 del plan-construccion y arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Consumidor autorizado a extraer lotes: SOLO batch-validacion (C5).
const CONSUMIDOR_LOTE = 'BATCH_VALIDACION';

// Shape base de la cola por proyecto.
function colaVacia() {
  return {
    esquema: 'nichos-cola-candidatos-v1',
    candidatos: [],  // [{ id, nombre, audiencia, fuente, encolado_at, metadata }] — FIFO
    tamano_max: null,
    updated_at: null
  };
}

class ColaCandidatos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-candidatos';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> cola
    this._colas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-candidatos.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const c = this._colas.get(pid);
        return c ? { project_id: pid, cola: c } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.cola) this._colas.set(pid, data.cola);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cola del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender / fire-and-forget) ──
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'nichos.candidato.encolar.response', async (d) => {
      const res = this._encolar(d);
      // Emisor/par de fallo: exito → encolado; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.candidato_encolado', res.data);
      } else {
        this.eventBus?.publish('nichos.candidato.encolar.failed', res);
      }
      return res;
    });
  }

  onTomarRequest(e) {
    return this._atender(e, 'tomar', 'nichos.candidato.tomar.response', async (d) => {
      const res = this._tomarN(d);
      // Emisor/par de fallo: solo C5 saca; exito → tomado.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.candidato_tomado', res.data);
      } else {
        this.eventBus?.publish('nichos.candidato.encolar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: sondeo-territorio (B1) publica nichos.candidato.encontrado → se encola solo.
  onCandidatoEncontrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._encolar({ project_id: d.project_id, candidato: d.candidato || d, origen: 'sondeo' });
    if (res.status === 200) {
      this.eventBus?.publish('nichos.candidato_encolado', res.data);
    } else {
      this.eventBus?.publish('nichos.candidato.encolar.failed', res);
    }
    return res;
  }

  // ── proyección de lectura (no muta) ──
  _obtenerOCrear(pid) {
    let c = this._colas.get(pid);
    if (!c) {
      c = colaVacia();
      this._colas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  _longitud(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const c = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, numero_en_cola: c.candidatos.length } };
  }

  // ── proyección de escritura (bufer del embudo): encola un candidato ──
  _encolar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    // candidato directo, o envoltura { candidato }, o ya viene plano sin project_id
    let candidato = input.candidato !== undefined ? input.candidato
      : (input.nombre || input.producto ? input : null);
    if (!candidato || typeof candidato !== 'object') return this._invalid('candidato');

    const c = this._obtenerOCrear(pid);
    const nombre = (typeof candidato.nombre === 'string' && candidato.nombre.trim())
      ? candidato.nombre.trim()
      : (typeof candidato.producto === 'string' && candidato.producto.trim())
        ? candidato.producto.trim() : 'candidato';

    // Tope declarable: si tamano_max esta fijado y se rebasa → rechaza el llenado (failed).
    if (c.tamano_max != null && c.candidatos.length >= c.tamano_max) {
      return this._errorResponse(409, 'COLA_LLENA', `cola de candidatos al tope (${c.tamano_max})`, { project_id: pid });
    }

    const item = {
      id: candidato.id || `${pid}-${Date.now()}-${c.candidatos.length + 1}`,
      nombre,
      audiencia: (typeof candidato.audiencia === 'string' && candidato.audiencia.trim()) ? candidato.audiencia.trim() : null,
      fuente: (typeof candidato.fuente === 'string' && candidato.fuente.trim()) ? candidato.fuente.trim() : (input.origen || 'sondeo'),
      metadata: candidato.metadata || candidato.meta || null,
      encolado_at: new Date().toISOString(),
      estado: 'EN_COLA'
    };
    c.candidatos.push(item);
    c.updated_at = new Date().toISOString();
    this._colas.set(pid, c);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, candidato: item, numero_en_cola: c.candidatos.length, encolado: true } };
  }

  // ── proyección de escritura (SOLO C5 saca): toma un lote FIFO de N candidatos ──
  _tomarN(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    // GUARD de consumidor: solo batch-validacion extrae.
    if (input.consumidor !== CONSUMIDOR_LOTE) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo batch-validacion (C5) puede tomar candidatos de la cola', {
        consumidor_esperado: CONSUMIDOR_LOTE, consumidor_recibido: input.consumidor
      });
    }
    const n = Number(input.n !== undefined ? input.n : input.paralelismo || 3);
    const cantidad = (Number.isInteger(n) && n > 0) ? n : 3;

    const c = this._obtenerOCrear(pid);
    const lote = c.candidatos.splice(0, cantidad); // FIFO: toma los primeros
    c.updated_at = new Date().toISOString();
    this._colas.set(pid, c);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, lote, tomados: lote.length, restantes: c.candidatos.length }
    };
  }

  // ── Tools ──
  toolEncolar(params) { return this._encolar(params); }
  toolTomar(params) { return this._tomarN(params); }
  toolLongitud(params) { return this._longitud(params); }
}

module.exports = ColaCandidatos;
