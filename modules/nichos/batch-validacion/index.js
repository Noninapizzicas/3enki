/**
 * nichos/batch-validacion — REFLEJO stateless (C5, hoja del plan).
 *
 * DESACOPLA el cuello de botella del sistema (el embudo de validacion C): dado
 * N candidatos de la cola (cola-candidatos L2), los REPARTE/PROCESA en un LOTE en
 * PARALELO — no en serie. Cada candidato del lote pasa por estudio-demanda (C1)
 * y veredicto-viabilidad (C3) por RPC, y el batch agrega la List<Veredicto>.
 *
 * REFLEJO puro y determinista en la ORGANIZACION del lote (_programar, _repartir),
 * aunque el juicio de cada candidato lo delega por RPC a los micro-agentes C1/C3
 * (el batch NO decide por si mismo: solo coordina). Stateless — sin estado, sin
 * custodia. Cada op es funcion pura de su entrada.
 *
 *   _programar(lote)          -> loteEnEjecucion (id, items, programado_at)
 *   _repartir(items, n)       -> N grupos paralelos del lote (distribucion justa)
 *   _ejecutarEnParalelo(lote) -> List<Veredicto> (un RPC estudio.medir + veredicto.evaluar
 *                                por item, resueltos en paralelo con Promise.all)
 *
 * Cierra su circulo: si el lote viene vacio o un item malformado, responde honesto
 * y publica nichos.batch.programar.failed. Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class BatchValidacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'batch-validacion';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onProgramarRequest(e) {
    return this._atender(e, 'programar', 'nichos.batch.programar.response', async (d) => {
      const res = await this._programar(d);
      // Fire-and-forget de dominio: exito → lote ejecutado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.batch.lote_ejecutado', res.data);
      } else {
        this.eventBus?.publish('nichos.batch.programar.failed', res);
      }
      return res;
    });
  }

  // ── REFLEJO: programa el lote EnEjecucion y lo procesa en paralelo ──
  async _programar({ project_id, lote, criterio, paralelismo = 3 } = {}) {
    project_id = project_id || this.project_id;
    if (!lote || !Array.isArray(lote) || lote.length === 0) {
      return this._errorResponse(400, 'LOTE_VACIO', 'el lote de candidatos a validar esta vacio', { project_id });
    }
    const n = Number(paralelismo);
    const nParalel = (Number.isInteger(n) && n > 0) ? n : 3;

    // Organizacion determinista: reparte items en grupos paralelos (distribucion justa).
    const grupos = this._repartir(lote, nParalel);
    const loteEnEjecucion = {
      batch_id: `${project_id}-${Date.now()}`,
      project_id,
      items: lote.length,
      paralelismo: nParalel,
      grupos,
      programado_at: new Date().toISOString()
    };

    // Procesa en paralelo: una cadena C1->C3 por item, resuelta con Promise.all.
    // Cada veredicto agrega a la List<Veredicto>; fallos por item se marcan sin romper el lote.
    const veredictos = await this._ejecutarEnParalelo(project_id, lote, criterio, nParalel);
    const fallidos = veredictos.filter(v => v.status === 'fallido').length;
    return {
      status: 200,
      data: {
        project_id,
        batch_id: loteEnEjecucion.batch_id,
        lote_en_ejecucion: loteEnEjecucion,
        veredictos: veredictos.filter(v => v.status === 'exito'),
        fallidos,
        total: lote.length,
        ejecutado: true
      }
    };
  }

  // ── REFLEJO puro: reparte items en N grupos lo mas equitativos posible ──
  _repartir(items, n) {
    const grupos = Array.from({ length: n }, () => []);
    items.forEach((item, i) => {
      grupos[i % n].push(item);
    });
    return grupos.filter(g => g.length > 0);
  }

  // ── REFLEJO: un veredicto por item (RPC C1 medir + C3 evaluar), en paralelo ──
  async _ejecutarEnParalelo(project_id, lote, criterio, nParalel) {
    // Lotes de trabajo: cada grupo de items se procesa como una tarea paralela.
    const tareas = this._repartir(lote, nParalel).map(grupo => this._validarGrupo(project_id, grupo, criterio));
    const resultados = await Promise.all(tareas);
    return resultados.flat();
  }

  // ── REFLEJO: valida un grupo de items (estudio + veredicto por item) ──
  async _validarGrupo(project_id, items, criterio) {
    const salidas = [];
    for (const item of items) {
      const candidato = typeof item === 'object' ? (item.candidato || item) : { nombre: item };
      salidas.push(await this._validarItem(project_id, candidato, criterio));
    }
    return salidas;
  }

  // ── REFLEJO: un item -> estudio (C1) + veredicto (C3); fallo no rompe el lote ──
  async _validarItem(project_id, candidato, criterio) {
    try {
      const estudio = await this._rpc('nichos.estudio.medir.request', {
        project_id, candidato
      }, { timeout_ms: 20000 }).catch(() => null);
      if (!estudio || estudio.status !== 200) {
        return { status: 'fallido', candidato, codigo: (estudio && estudio.error && estudio.error.code) || 'ESTUDIO_NO_DISPONIBLE' };
      }
      const veredicto = await this._rpc('nichos.veredicto.evaluar.request', {
        project_id, estudio: estudio.data, criterio
      }, { timeout_ms: 20000 }).catch(() => null);
      if (!veredicto || veredicto.status !== 200) {
        return { status: 'fallido', candidato, codigo: (veredicto && veredicto.error && veredicto.error.code) || 'VEREDICTO_NO_DISPONIBLE' };
      }
      return { status: 'exito', candidato, veredicto: veredicto.data.veredicto, confianza: veredicto.data.confianza, motivo: veredicto.data.motivo };
    } catch (err) {
      return { status: 'fallido', candidato, codigo: 'ERROR_BATCH' };
    }
  }

  // ── Tools ──
  toolProgramar(params) { return this._programar(params); }
  toolRepartir(params) { return this._repartir(params.items, params.n); }
}

module.exports = BatchValidacion;
