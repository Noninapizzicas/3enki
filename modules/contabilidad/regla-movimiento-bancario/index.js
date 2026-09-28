/**
 * contabilidad/regla-movimiento-bancario — CUSTODIO (E8, hoja del plan).
 *
 * Repositorio de reglas "esta comision -> esta cuenta", DECLARADAS o APRENDIDAS.
 * Es el mismo CORTE DURO que A6.2 pero del lado del banco: una regla DECLARADA
 * actua de inmediato; una regla APRENDIDA no actua hasta ser RATIFICADA (L10).
 * Comparte con A6.2 la PUERTA UNICA de ratificacion — no hay tres puertas
 * distintas en el dominio.
 *
 * CUSTODIO (patron real): un solo escritor del repositorio (DUENO/ASESOR);
 * _aplicar es proyeccion PURA de lectura (no muta) y devuelve SIN_COBERTURA si
 * ninguna regla cubre el movimiento. Persiste por proyecto con PosPersistencia
 * (storage /contabilidad/regla-movimiento-bancario/*.json), restaura en
 * project.activated y vuelca en onUnload. Consume por EVENTO
 * contabilidad.regla_ratificada (L10 ratifico) sin require cruzado. Emisor/par
 * de fallo. NO REUTILIZA: no existe regla de clasificacion bancaria en el
 * inventario (`regla-contrapartida` A6.2 es la del hecho, no la del banco).
 *
 * Ver hoja E8 del diseno-oop y bloque `regla-movimiento-bancario` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Roles con permiso de ESCRITURA sobre el repositorio de reglas bancarias.
const ROLES_AUTORIZADOS = new Set(['DUENO', 'ASESOR']);

// Estados de una regla: solo DECLARADA/RATIFICADA actuan sobre el volumen.
const ESTADO_DECLARADA = 'DECLARADA';
const ESTADO_PENDIENTE = 'RATIFICACION_PENDIENTE';
const ESTADO_RATIFICADA = 'RATIFICADA';

class ReglaMovimientoBancario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'regla-movimiento-bancario';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, reglas: [ReglaDeclarada] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'regla-movimiento-bancario.json',
      dir: '/contabilidad/regla-movimiento-bancario',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.reglas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el repositorio de reglas bancarias del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'contabilidad.regla_movimiento.leer.response', async (d) => {
      const res = this._leer(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.regla_movimiento.leer.failed', res);
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.regla_movimiento.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.regla_movimiento_declarada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.regla_movimiento.declarar.failed', res);
      }
      return res;
    });
  }

  onAprenderRequest(e) {
    return this._atender(e, 'aprender', 'contabilidad.regla_movimiento.aprender.response', async (d) => {
      const res = this._aprender(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.regla_movimiento_aprendida', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.regla_movimiento.aprender.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: L10 ratifico la regla → pasa a ACTUAR sobre el volumen.
  onReglaRatificada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.regla_id) return null;
    const res = this._ratificar(d);
    if (res.status !== 200) this.eventBus?.publish('contabilidad.regla_movimiento_aprendida.failed', res);
    return res;
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-regla-movimiento-bancario-v1', reglas: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // leer(filtro) -> List<ReglaDeclarada> (no muta).
  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    const estado = input && input.estado;
    const reglas = estado ? d.reglas.filter((r) => r.estado === estado) : d.reglas;
    return { status: 200, data: { project_id: pid, reglas } };
  }

  // declarar(rol, regla) — un solo escritor (DUENO/ASESOR). Actua de inmediato.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo DUENO/ASESOR declara reglas bancarias', {
        roles_esperados: [...ROLES_AUTORIZADOS], rol_recibido: rol
      });
    }

    const regla = input && input.regla;
    if (!regla || typeof regla !== 'object') return this._invalid('regla');
    if (!regla.patron || typeof regla.patron !== 'object') return this._invalid('regla.patron');

    const d = this._obtenerOCrear(pid);
    const asentada = {
      id: regla.id || `${pid}-mb${d.reglas.length + 1}`,
      ambito: 'MOVIMIENTO_BANCARIO',
      patron: regla.patron,
      contrapartida: regla.contrapartida || {},
      estado: ESTADO_DECLARADA,
      declarado_por: rol,
      declarado_en: new Date().toISOString()
    };
    d.reglas.push(asentada);
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, regla: asentada, actua: true } };
  }

  // aprender(rol, regla, evidencia) — entra HIDRATADO (E7/desatasco) y queda PENDIENTE de L10.
  _aprender(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo DUENO/ASESOR aporta aprendizaje bancario', {
        roles_esperados: [...ROLES_AUTORIZADOS], rol_recibido: rol
      });
    }

    const regla = input && input.regla;
    if (!regla || typeof regla !== 'object') return this._invalid('regla');
    if (!regla.patron || typeof regla.patron !== 'object') return this._invalid('regla.patron');

    const d = this._obtenerOCrear(pid);
    const candidata = {
      id: regla.id || `${pid}-mba${d.reglas.length + 1}`,
      ambito: 'MOVIMIENTO_BANCARIO',
      patron: regla.patron,
      contrapartida: regla.contrapartida || {},
      estado: ESTADO_PENDIENTE,
      evidencia: input.evidencia || null,
      aportada_por: rol,
      aportada_en: new Date().toISOString()
    };
    d.reglas.push(candidata);
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, regla: candidata, actua: false } };
  }

  // Ratificacion (L10): una regla APRENDIDA pasa a RATIFICADA y ya actua.
  _ratificar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const reglaId = input && input.regla_id;
    if (!reglaId) return this._invalid('regla_id');

    const d = this._obtenerOCrear(pid);
    const regla = d.reglas.find((r) => r.id === reglaId);
    if (!regla) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `regla bancaria ${reglaId} no hallada`, { regla_id: reglaId });
    regla.estado = ESTADO_RATIFICADA;
    regla.ratificada_en = new Date().toISOString();
    regla.ratificada_por = input.ratificada_por || input.rol || null;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, regla_id: reglaId, estado: ESTADO_RATIFICADA, actua: true } };
  }

  // aplicar(movimiento) -> Contrapartida | SIN_COBERTURA (solo reglas que actuan).
  _aplicar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const mov = (input && input.movimiento) || input || {};
    const d = this._obtenerOCrear(pid);
    const activas = d.reglas.filter((r) => r.estado === ESTADO_DECLARADA || r.estado === ESTADO_RATIFICADA);
    for (const regla of activas) {
      const patron = regla.patron || {};
      const coincide = Object.keys(patron).every((k) => mov[k] === patron[k]);
      if (coincide) {
        return {
          status: 200,
          data: { project_id: pid, cubierto: true, contrapartida: regla.contrapartida, regla_id: regla.id }
        };
      }
    }
    return { status: 200, data: { project_id: pid, cubierto: false, contrapartida: null, resultado: 'SIN_COBERTURA' } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolDeclarar(params) { return this._declarar(params); }
  toolAprender(params) { return this._aprender(params); }
  toolAplicar(params) { return this._aplicar(params); }
}

module.exports = ReglaMovimientoBancario;
