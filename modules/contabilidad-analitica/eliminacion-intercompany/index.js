/**
 * contabilidad-analitica/eliminacion-intercompany — REFLEJO STATELESS (I2, hoja del plan).
 *
 * LAS ELIMINACIONES DE OPERACIONES INTERNAS entre sociedades del grupo. Detecta el CRUCE
 * interno (una partida de una sociedad contra otra sociedad del MISMO grupo) y devuelve el
 * conjunto de PARTIDAS A ELIMINAR en la consolidacion. DETERMINISTA: la deteccion es un
 * emparejamiento por reglas, no un juicio.
 *
 * ATRIBUTOS del diseno: `asientos:Flujo<Asiento>`. Las partidas llegan DECLARADAS o se piden
 * a `marca-sociedad` (I1) POR EVENTO — la marca de sociedad es lo que hace posible saber que
 * dos partidas son del mismo grupo y se cruzan.
 *
 * REGLAS DECLARABLES (LEY COMO DATO — cero constantes):
 *   - `criterio.grupo` → el conjunto de sociedades que forman el grupo (o su id).
 *   - `criterio.umbral` → tolerancia declarada para considerar dos importes el mismo cruce.
 *   - `criterio.cuentas_internas` → cuentas marcadas como internas (si se declaran).
 * Si no vienen declaradas, el reflejo aplica el unico criterio que NO es un parametro de
 * negocio: el cruce EXISTE cuando la contraparte de una partida pertenece al grupo declarado
 * por la propia partida (sociedad ≠ sociedad_contraparte y ambas en `sociedades`). Un grupo
 * NO declarado → `[ABIERTO]`: no se adivina el perimetro.
 *
 * La ELIMINACION es una PROPUESTA de partidas: el reflejo NO escribe, NO borra, NO persiste.
 * Devuelve, por cada cruce, las dos partidas que se anulan y su importe neto.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos asientos + mismo criterio → mismas eliminaciones (una sola respuesta).
 *  - Dato ausente = desconocido: sin asientos o sin grupo declarado → `eliminaciones` vacias y
 *    `abierto:true` con lo que falta. Nada se estima.
 *  - NO escribe, NO persiste: las partidas son del diario.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja I2 del plan-construccion y diseno-oop.md (CLASE EliminacionIntercompany).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class EliminacionIntercompany extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'eliminacion-intercompany';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onEliminarRequest(e) {
    return this._atender(e, 'eliminar', 'eliminacion-intercompany.eliminar.response', async (d) => {
      const res = await this._eliminar(d);
      if (res.status !== 200) this.eventBus?.publish('eliminacion-intercompany.eliminar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: eliminar() → Set<Partida> ──
  async _eliminar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // 1) Las PARTIDAS: declaradas, o pedidas a marca-sociedad (I1) POR EVENTO.
    const { partidas, fuente_partidas } = await this._partidas(pid, input);
    if (partidas === null) {
      return {
        status: 200,
        data: {
          project_id: pid, fuente_partidas: null, eliminaciones: [], neto: null,
          abierto: true, faltan: ['partidas'],
          motivo: 'no hay partidas declaradas ni marcas de sociedad que consultar: no se derivan eliminaciones'
        }
      };
    }

    // 2) El CRITERIO de grupo: declarado (ParametroDeclarable). Sin grupo, no hay perimetro.
    const criterio = this._criterio(input);
    if (criterio.sociedades.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid, fuente_partidas, criterio, eliminaciones: [], neto: null,
          abierto: true, faltan: ['criterio.grupo'],
          motivo: 'no se adivina el perimetro: falta el grupo declarado (criterio.grupo / sociedades)'
        }
      };
    }

    // 3) DETECCION DETERMINISTA del cruce interno (emparejamiento por reglas declaradas).
    const eliminaciones = [];
    let neto = 0;
    for (const p of partidas) {
      if (!p || typeof p !== 'object') continue;
      const soc = this._clave(p.sociedad);
      const contraparte = this._clave(p.sociedad_contraparte != null ? p.sociedad_contraparte : p.contraparte);
      if (soc === null || contraparte === null || soc === contraparte) continue; // misma sociedad / sin contraparte: no es cruce
      if (!criterio.conjunto.has(soc) || !criterio.conjunto.has(contraparte)) continue; // fuera del grupo declarado
      const importe = this._num(p.importe);
      if (importe === null) continue; // sin importe no hay cruce valorado (no se estima)
      neto += importe;
      eliminaciones.push({
        id_partida: p.id_partida ?? p.id ?? null,
        sociedad: soc,
        sociedad_contraparte: contraparte,
        cuenta: p.cuenta ?? null,
        cuenta_interna: criterio.internas.size > 0 ? criterio.internas.has(String(p.cuenta)) : null,
        importe: this._round(importe, 2),
        // La eliminacion ANULA la partida: se declara el signo de su anulacion.
        anulacion: this._round(-importe, 2),
        motivo: 'cruce interno entre sociedades del grupo declarado'
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        fuente_partidas,
        criterio: { sociedades: criterio.sociedades, umbral: criterio.umbral, cuentas_internas: [...criterio.internas] },
        // Set<Partida> → lista determinista (ordenada por id_partida para reproducibilidad).
        eliminaciones: eliminaciones.sort((a, b) => String(a.id_partida ?? '').localeCompare(String(b.id_partida ?? ''))),
        n_eliminaciones: eliminaciones.length,
        neto: this._round(neto, 2),
        abierto: false,
        faltan: [],
        motivo: null
      }
    };
  }

  // Las partidas: declaradas en la peticion o PEDIDAS a marca-sociedad (I1) POR EVENTO.
  async _partidas(pid, input = {}) {
    const declaradas = input.partidas || input.asientos;
    if (Array.isArray(declaradas)) {
      // Los "asientos" pueden traer sus partidas dentro: se aplanan, no se reinterpretan.
      const out = [];
      for (const a of declaradas) {
        if (a && Array.isArray(a.partidas)) out.push(...a.partidas.map(p => ({ ...p, sociedad: p.sociedad ?? a.sociedad })));
        else if (a && typeof a === 'object') out.push(a);
      }
      return { partidas: out, fuente_partidas: 'declarado' };
    }
    const r = await this._rpc('marca-sociedad.marcar.request',
      { project_id: pid, listar: true, periodo: input.periodo }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && Array.isArray(data.marcas)) {
      return { partidas: data.marcas.map(m => ({ ...m })), fuente_partidas: 'marca-sociedad' };
    }
    return { partidas: null, fuente_partidas: null };
  }

  // El criterio de grupo: ParametroDeclarable. Cero constantes de negocio cableadas.
  _criterio(input = {}) {
    const c = input.criterio && typeof input.criterio === 'object' ? input.criterio : {};
    const raw = c.grupo || c.sociedades || input.grupo || input.sociedades || [];
    const sociedades = (Array.isArray(raw) ? raw : [raw])
      .map(s => this._clave(typeof s === 'object' && s !== null ? (s.id ?? s.nombre ?? s.sociedad) : s))
      .filter(v => v !== null);
    const umbral = this._num(c.umbral != null ? c.umbral : input.umbral);
    const internasRaw = c.cuentas_internas || input.cuentas_internas || [];
    const internas = new Set((Array.isArray(internasRaw) ? internasRaw : [internasRaw]).map(v => String(v)));
    return { sociedades, conjunto: new Set(sociedades), umbral, internas };
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.nombre ?? v.sociedad);
    return String(v);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolEliminar(params) { return this._eliminar(params); }
}

module.exports = EliminacionIntercompany;
