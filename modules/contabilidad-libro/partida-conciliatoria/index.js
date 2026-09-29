/**
 * contabilidad-libro/partida-conciliatoria — REFLEJO STATELESS (E9, hoja del plan).
 *
 * PARTIDAS EN TRANSITO que EXPLICAN el desfase extracto ↔ contabilidad: el cheque emitido y
 * no cobrado, el cobro ingresado y no apuntado, el cargo del banco que aun no llego al diario.
 * Toma los cubos NO CASADOS del cruce (conciliacion-bancaria E1) — `sin_contrapartida` (el
 * movimiento del banco sin apunte) y `sin_movimiento` (el apunte sin movimiento) — y los
 * CLASIFICA por su ORIGEN de transito, que es un PARAMETRO DECLARABLE del negocio.
 *
 * Calculo PURO y DETERMINISTA: misma entrada + mismas partidas declaradas → mismo desfase.
 *
 * EL JUICIO NO VIVE AQUI: este reflejo NO decide si una partida es un cheque o una comision,
 * ni inventa una partida que no este declarada. Lo que no se puede clasificar con lo declarado
 * queda SIN CLASIFICAR y se declara `[ABIERTO]` — dato ausente = desconocido, nada se estima.
 * El juicio de la partida ambigua sigue siendo EXCLUSIVO de `partida-no-identificada` (E7).
 *
 * Invariantes:
 *  - DETERMINISTA: mismo cruce + mismas partidas declaradas → mismo desfase.
 *  - La CLASIFICACION por origen es DECLARABLE (el negocio declara sus origenes de transito);
 *    no hay ninguna lista de "cheques"/"comisiones"/"transferencias" cableada.
 *  - El cruce se PIDE a conciliacion-bancaria (E1) POR EVENTO; si E1 no responde, se declara
 *    `cruce_disponible:false` y NO se estima el desfase (no se inventa un cruce).
 *  - NO escribe, NO persiste, NO muta: el cruce es de E1 y el diario de B2.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E9 del plan-construccion y diseno-oop.md (CLASE PartidaConciliatoria).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PartidaConciliatoria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'partida-conciliatoria';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onDesfaseRequest(e) {
    return this._atender(e, 'desfase', 'partida-conciliatoria.desfase.response', async (d) => {
      const res = await this._desfase(d);
      if (res.status !== 200) this.eventBus?.publish('partida-conciliatoria.desfase.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: desfase(periodo) → Set<Partida> en transito + Cuantía ──
  async _desfase(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) El CRUCE: se toma declarado en la peticion o se PIDE a E1 POR EVENTO (nunca import).
    const { cruce, cruce_disponible, fuente_cruce } = await this._cruce(pid, input, periodo);

    // 2) La CLASIFICACION de transito: los origenes los DECLARA el negocio (ParametroDeclarable).
    //    Sin clasificacion declarada, ninguna partida se puede atribuir a un origen — pero
    //    TAMPOCO se pierde: se listan sin clasificar y se declaran [ABIERTO].
    const clasificacion = this._clasificacion(input);
    const clasificacion_disponible = Boolean(clasificacion);

    // Los cubos NO CASADOS son la materia prima del desfase (el juicio de E7 no se toca aqui).
    const sin_contrapartida = cruce_disponible && Array.isArray(cruce.sin_contrapartida) ? cruce.sin_contrapartida : [];
    const sin_movimiento = cruce_disponible && Array.isArray(cruce.sin_movimiento) ? cruce.sin_movimiento : [];

    const partidas = [];
    const sin_clasificar = [];

    // 3) Movimiento del banco sin apunte → partida en transito (lado banco).
    for (const x of sin_contrapartida) {
      const m = x ? (x.movimiento || x) : null;
      const origen = this._origenDe(m, clasificacion);
      const partida = {
        lado: 'banco',
        origen,
        clase: this._claseDe(origen),
        importe: this._num(m && m.importe),
        signo: (m && m.signo != null) ? String(m.signo) : null,
        fecha: (m && m.fecha != null) ? String(m.fecha) : null,
        clave: x ? (x.clave != null ? String(x.clave) : this._claveDe(m)) : this._claveDe(m),
        referencia: (m && m.referencia != null) ? String(m.referencia) : null,
        motivo: x ? (x.motivo || null) : null,
        // El juicio NO se hace aqui: E7 decide si lo ambiguo es un cheque, una comision, etc.
        juicio_delegado_a: 'partida-no-identificada'
      };
      if (origen) partidas.push(partida); else sin_clasificar.push(partida);
    }

    // 4) Apunte del diario sin movimiento bancario → partida en transito (lado contabilidad).
    for (const x of sin_movimiento) {
      const a = x ? (x.asiento || x) : null;
      const origen = this._origenDe(a, clasificacion);
      const partida = {
        lado: 'contabilidad',
        origen,
        clase: this._claseDe(origen),
        importe: this._num(a && (a.importe != null ? a.importe : a.cuanto)),
        signo: (a && a.signo != null) ? String(a.signo) : null,
        fecha: (a && a.fecha != null) ? String(a.fecha) : null,
        clave: x ? (x.clave != null ? String(x.clave) : this._claveDe(a)) : this._claveDe(a),
        referencia: (a && a.referencia != null) ? String(a.referencia) : null,
        motivo: x ? (x.motivo || null) : null,
        juicio_delegado_a: 'partida-no-identificada'
      };
      if (origen) partidas.push(partida); else sin_clasificar.push(partida);
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        fuente_cruce,
        cruce_disponible,
        clasificacion_disponible,
        origenes_declarados: clasificacion ? clasificacion.origenes_declarados : [],
        total_partidas: partidas.length,
        partidas,
        // Lo que no se pudo atribuir a un origen declarado NO se estima: se declara [ABIERTO].
        sin_clasificar,
        // EL DESFASE: la cuantia cruda de lo NO CASADO. Sin cruce NO se estima (null, no 0).
        desfase: cruce_disponible
          ? this._round(
              (Array.isArray(cruce.sin_contrapartida) ? cruce.sin_contrapartida : [])
                .reduce((s, x) => s + (this._num(x && (x.movimiento || x) ? (x.movimiento || x).importe : null) || 0), 0),
              2
            )
          : null,
        // Se declara abierto lo que el negocio aun no ha declarado (nada se rellena solo).
        abierto: {
          cruce: cruce_disponible ? null : 'E1 (conciliacion-bancaria) no respondio: no se estima el desfase',
          clasificacion: clasificacion_disponible ? null : 'el negocio no ha declarado sus origenes de transito',
          partidas_sin_clasificar: sin_clasificar.length
        }
      }
    };
  }

  // El cruce declarado en la peticion o pedido a E1 POR EVENTO. Si no llega, no se inventa.
  async _cruce(pid, input, periodo) {
    if (input.cruce && typeof input.cruce === 'object') {
      return { cruce: input.cruce, cruce_disponible: true, fuente_cruce: 'declarado' };
    }
    const r = await this._rpc('conciliacion-bancaria.cruzar.request',
      { project_id: pid, periodo, movimientos: input.movimientos }, { timeout_ms: 4000 });
    const cruce = r && r.data ? r.data : null;
    if (cruce && (Array.isArray(cruce.sin_contrapartida) || Array.isArray(cruce.sin_movimiento))) {
      return { cruce, cruce_disponible: true, fuente_cruce: 'conciliacion-bancaria' };
    }
    return { cruce: null, cruce_disponible: false, fuente_cruce: null };
  }

  // La clasificacion de transito DECLARADA por el negocio. Ni un origen cableado.
  _clasificacion(input = {}) {
    const c = input.clasificacion && typeof input.clasificacion === 'object' ? input.clasificacion : null;
    if (!c) return null;
    const origenes = Array.isArray(c.origenes) ? c.origenes : [];
    const declarados = [];
    for (const o of origenes) {
      if (!o || typeof o !== 'object') continue;
      const id = o.id != null ? String(o.id) : null;
      if (!id) continue;
      declarados.push({
        id,
        clase: o.clase != null ? String(o.clase) : 'transito',
        // Los criterios son DECLARABLES: no se cablea ninguna heuristica de banco.
        criterios: (o.criterios && typeof o.criterios === 'object') ? o.criterios : {}
      });
    }
    return { origenes_declarados: declarados, origenes };
  }

  // Atribuye un movimiento/apunte a un origen declarado. Sin origen declarado → null ([ABIERTO]).
  _origenDe(fila, clasificacion) {
    if (!fila || !clasificacion) return null;
    for (const o of clasificacion.origenes) {
      if (!o || typeof o !== 'object') continue;
      if (this._casa(fila, o.criterios)) return o.id != null ? String(o.id) : null;
    }
    return null;
  }

  // Un criterio que la fila NO aporta NO casa (dato ausente = desconocido, no coincidente).
  _casa(fila, criterios) {
    if (!criterios || typeof criterios !== 'object') return false;
    const claves = Object.keys(criterios);
    if (claves.length === 0) return false;
    for (const k of claves) {
      const esperado = criterios[k];
      if (esperado === undefined || esperado === null || esperado === '') continue;
      const real = fila[k];
      if (real === undefined || real === null || real === '') return false;
      const a = String(real).toLowerCase();
      const b = String(esperado).toLowerCase();
      if (a !== b && a.indexOf(b) === -1) return false;
    }
    return true;
  }

  _claseDe(origen) {
    return origen ? 'transito' : null;
  }

  _claveDe(f) {
    if (!f || typeof f !== 'object') return null;
    if (f.clave != null) return String(f.clave);
    const partes = [f.fecha, f.importe, f.signo, (f.referencia != null ? f.referencia : f.concepto)];
    if (!partes.some(v => v !== null && v !== undefined)) return null;
    return partes.map(v => (v === null || v === undefined ? '-' : String(v))).join('|');
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : null;
  }

  // ── Tools ──
  toolDesfase(params) { return this._desfase(params); }
}

module.exports = PartidaConciliatoria;
