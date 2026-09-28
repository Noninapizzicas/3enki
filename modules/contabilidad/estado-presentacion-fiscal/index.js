/**
 * contabilidad/estado-presentacion-fiscal — CUSTODIO (D12, hoja del plan).
 *
 * EL CICLO DE VIDA DE CADA OBLIGACION FISCAL:
 *     PENDIENTE → GENERADA → PRESENTADA → JUSTIFICADA
 * y, cuando el plazo declarado pasa sin llegar a PRESENTADA, ATRASADA.
 * Sin este estado, el calendario (D6) avisa pero NADIE SABE EN QUE PUNTO esta
 * cada modelo.
 *
 * EL SISTEMA PREPARA, EL ASESOR PRESENTA. Esa es la invariante de esta hoja y
 * esta cableada en el GUARD: el rol SISTEMA puede llevar la obligacion hasta
 * GENERADA (el sistema prepara el modelo), pero NO puede marcarla PRESENTADA ni
 * JUSTIFICADA — eso es del ASESOR. Un sistema que se auto-presenta es un sistema
 * que miente sobre lo que hizo. El avance es MONOTONO: no se retrocede (una
 * obligacion presentada no vuelve a pendiente); lo que hay que corregir despues
 * de presentar es una RECTIFICACION (D14), no un retroceso de estado.
 *
 * CUSTODIO (patron real): store en memoria (estado por obligacion + secuencia
 * append-only de transiciones); PosPersistencia (storage
 * /contabilidad/estado-presentacion-fiscal/*.json); restaura en
 * project.activated; flush en onUnload. GUARD de un solo escritor: SISTEMA o
 * ASESOR — cualquier otro se rechaza con ERROR_DOS_ESCRITORES.
 * Emisor/par de fallo: exito publica contabilidad.obligacion_avanzada; error su
 * par determinista. La dependencia con perfil-administrativo (D15, que dice QUE
 * obligaciones aplican) y calendario-fiscal (D6, que dice CUANDO vencen) es por
 * EVENTO, NUNCA por require cruzado.
 * NO REUTILIZA: no existe estado de obligacion fiscal en el inventario.
 *
 * Ver hoja D12 del diseno-oop y bloque `estado-presentacion-fiscal` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor de la parcela (D12): SISTEMA (prepara) o ASESOR (presenta).
const ROLES_AUTORIZADOS = new Set(['SISTEMA', 'ASESOR']);

// Rol que puede declarar PRESENTADA / JUSTIFICADA: el ASESOR. El sistema PREPARA.
const ROL_PRESENTA = 'ASESOR';

// Rol que solo llega hasta GENERADA: el sistema prepara, no presenta.
const ROL_PREPARA = 'SISTEMA';

// Codigos simbolicos deterministas de los cerrojos (clase D12).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_NO_PRESENTA = 'ERROR_EL_SISTEMA_NO_PRESENTA';
const CODE_RETROCESO = 'ERROR_TRANSICION_NO_MONOTONA';

// El ciclo de vida, EN ORDEN. El avance es monotono.
const CICLO = ['PENDIENTE', 'GENERADA', 'PRESENTADA', 'JUSTIFICADA'];

// ATRASADA es un desenlace por plazo, no un escalon del ciclo.
const ESTADO_ATRASADO = 'ATRASADA';

// Estados finales (ya no avanzan mas).
const FINALES = new Set(['JUSTIFICADA', 'ATRASADA']);

class EstadoPresentacionFiscal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estado-presentacion-fiscal';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, obligaciones:{}, transiciones:[] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'estado-presentacion-fiscal.json',
      dir: '/contabilidad/estado-presentacion-fiscal',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.obligaciones) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el estado de las obligaciones del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAvanzarRequest(e) {
    return this._atender(e, 'avanzar', 'contabilidad.obligacion.avanzar.response', async (d) => {
      const res = this._avanzar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.obligacion_avanzada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.obligacion.avanzar.failed', res);
      }
      return res;
    });
  }

  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'contabilidad.obligacion.estado.response', async (d) => {
      const res = this._estadoDePayload(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.obligacion.estado.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-estado-presentacion-fiscal-v1',
        obligaciones: {},
        transiciones: [],
        escritor: [...ROLES_AUTORIZADOS]
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (D12): SISTEMA o ASESOR.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(r)) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el estado de presentacion tiene UN escritor: SISTEMA (prepara) o ASESOR (presenta)', {
          escritor_vigente: [...ROLES_AUTORIZADOS],
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // avanzar(obligacion, estado) -> ok. Escritor SISTEMA+ASESOR, con la
  // invariante: el sistema PREPARA (hasta GENERADA), el asesor PRESENTA.
  _avanzar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;
    const rol = String(input.rol).toUpperCase();

    const id = input && (input.obligacion || input.id_obligacion || (input.obligacion_ref && input.obligacion_ref.id));
    if (!id) return this._invalid('obligacion');

    const destino = String(input && (input.estado || input.a_estado || input.nuevo_estado) || '').toUpperCase();
    if (!destino) return this._invalid('estado');
    if (destino !== ESTADO_ATRASADO && !CICLO.includes(destino)) {
      return this._errorResponse(422, 'ESTADO_NO_VALIDO',
        `el estado ${destino} no pertenece al ciclo de vida de una obligacion fiscal`, {
          ciclo: CICLO, fuera_de_ciclo: [ESTADO_ATRASADO]
        });
    }

    const d = this._obtenerOCrear(pid);
    const actual = d.obligaciones[id] || {
      obligacion: String(id),
      modelo: (input && (input.modelo || input.tipo)) || null,
      periodo: (input && input.periodo) || null,
      ejercicio: (input && input.ejercicio) || null,
      sociedad: (input && input.sociedad) || null,
      estado: 'PENDIENTE',
      historial: [],
      preparado_por: null,
      presentado_por: null,
      justificante: null,
      creado_en: new Date().toISOString()
    };

    // EL SISTEMA PREPARA, EL ASESOR PRESENTA: la invariante, cableada aqui.
    if (rol === ROL_PREPARA && (destino === 'PRESENTADA' || destino === 'JUSTIFICADA')) {
      const permitidoPorDeclaracion = input && input.presenta_por_sistema === true && input.declarado === true;
      if (!permitidoPorDeclaracion) {
        return this._errorResponse(409, CODE_NO_PRESENTA,
          `el sistema PREPARA, el asesor PRESENTA: ${ROL_PREPARA} no puede marcar una obligacion como ${destino}`, {
            estado_intentado: destino,
            rol: rol,
            rol_que_presenta: ROL_PRESENTA,
            // Salvo que se DECLARE que el sistema presenta (perfil-administrativo).
            permitido_si_declarado: true,
            declarado: false,
            simbolico: CODE_NO_PRESENTA
          });
      }
    }

    // MONOTONO: no se retrocede. Lo que hay que corregir tras presentar es una
    // RECTIFICACION (D14), no un retroceso de estado.
    const idxActual = CICLO.indexOf(actual.estado);
    const idxDestino = CICLO.indexOf(destino);
    if (destino !== ESTADO_ATRASADO && idxDestino < idxActual) {
      return this._errorResponse(409, CODE_RETROCESO,
        `la obligacion ${id} esta en ${actual.estado}: el avance es MONOTONO, no se retrocede`, {
          estado_actual: actual.estado,
          estado_intentado: destino,
          correccion: 'RECTIFICACION_D14 (no un retroceso de estado)',
          simbolico: CODE_RETROCESO
        });
    }
    if (FINALES.has(actual.estado) && destino !== ESTADO_ATRASADO) {
      return this._errorResponse(409, CODE_RETROCESO,
        `la obligacion ${id} esta en ${actual.estado} (estado final): no vuelve al ciclo`, {
          estado_actual: actual.estado, estado_intentado: destino, simbolico: CODE_RETROCESO
        });
    }

    const transicion = {
      de: actual.estado,
      a: destino,
      rol,
      quien: (input && input.quien) || rol,
      cuando: (input && input.cuando) || new Date().toISOString(),
      justificante: (input && input.justificante) || null,
      motivo: (input && input.motivo) || null,
      declarado: !!(input && input.declarado)
    };

    actual.estado = destino;
    actual.historial.push(transicion);
    actual.actualizado_en = transicion.cuando;
    if (transicion.justificante) actual.justificante = transicion.justificante;
    if (destino === 'GENERADA') { actual.preparado_por = rol; actual.preparado_en = transicion.cuando; }
    if (destino === 'PRESENTADA') { actual.presentado_por = rol; actual.presentado_en = transicion.cuando; }
    if (destino === 'JUSTIFICADA') { actual.justificado_en = transicion.cuando; }
    if (destino === ESTADO_ATRASADO) { actual.atrasada_en = transicion.cuando; }

    d.obligaciones[id] = actual;
    d.transiciones.push({ obligacion: String(id), ...transicion });
    d.updated_at = transicion.cuando;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        obligacion: actual,
        id_obligacion: String(id),
        estado: destino,
        estado_anterior: transicion.de,
        presentado_por: actual.presentado_por,
        // El sistema PREPARA (GENERADA); el asesor PRESENTA.
        lo_preparo: actual.preparado_por,
        lo_presento: actual.presentado_por,
        monotono: true,
        el_sistema_presenta: false
      }
    };
  }

  // estadoDe(obligacion) -> EstadoObligacion.
  _estadoDe(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const id = input && (input.obligacion || input.id_obligacion);
    if (!id) return this._invalid('obligacion');

    const d = this._obtenerOCrear(pid);
    const o = d.obligaciones[id];
    if (!o) {
      return {
        status: 200,
        data: {
          project_id: pid,
          obligacion: String(id),
          existe: false,
          estado: 'PENDIENTE',
          // No declarada: se dice, no se asume un progreso.
          paso_actual: 0,
          ciclo: CICLO,
          asumido: false
        }
      };
    }
    const idx = CICLO.indexOf(o.estado);
    return {
      status: 200,
      data: {
        project_id: pid,
        obligacion: String(id),
        existe: true,
        estado: o.estado,
        paso_actual: idx >= 0 ? idx : CICLO.length,
        ciclo: CICLO,
        final: FINALES.has(o.estado),
        preparado_por: o.preparado_por,
        presentado_por: o.presentado_por,
        justificante: o.justificante,
        historial: o.historial,
        // El estado REFLEJA lo que paso; el sistema no presenta.
        el_sistema_presenta: false
      }
    };
  }

  // estadoDe(obligacion) via payload completo (para el RPC de lectura).
  _estadoDePayload(d) {
    const pid = d && d.project_id;
    if (!pid) return this._invalid('project_id');
    const id = d && (d.obligacion || d.id_obligacion);
    if (!id) {
      const store = this._obtenerOCrear(pid);
      return {
        status: 200,
        data: {
          project_id: pid,
          obligaciones: Object.values(store.obligaciones),
          n_obligaciones: Object.keys(store.obligaciones).length,
          ciclo: CICLO,
          el_sistema_presenta: false
        }
      };
    }
    return this._estadoDe({ project_id: pid, obligacion: id });
  }

  // ── Tools ──
  toolAvanzar(params) { return this._avanzar(params); }
  toolEstadoDe(params) { return this._estadoDe(params); }
}

module.exports = EstadoPresentacionFiscal;
