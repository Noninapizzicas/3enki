/**
 * contabilidad-fiscal/acceso-nomina — CUSTODIO CON PERSISTENCIA (G7, hoja del plan).
 *
 * GOBERNANZA DE QUIEN VE QUE NOMINA (DATO PERSONAL): cada uno ve la suya.
 * El diseno lo dice literal: `autorizar(quien, nomina):bool` y `declarar(p)`, con
 * `permisos:Map<Empleado,Alcance>`. UN SOLO ESCRITOR.
 *
 * AISLAMIENTO PERSONA↔PERSONA (invariante dura): la nomina es dato personal. Un negocio NO se
 * fuga, Y UNA PERSONA TAMPOCO. Aqui no vale "soy del mismo negocio": dentro del negocio, el
 * acceso a la nomina de OTRO se DENIEGA por defecto. Es el espejo de AislamientoNegocio (I4) en
 * el eje PERSONA (complementa el eje negocio).
 *
 * LA LEY ES DATO: los ALCANCES (`self_only` para el trabajador, `admin`/`responsable` para quien
 * gobierna la parcela) y los CONCEDIDOS (un encargo declarado: quien ve la nomina de quien) son
 * DECLARABLES. Cero roles cableados. El default SIN declarar es el MAS ESTRECHO: `self_only`.
 *
 * UN SOLO ESCRITOR de la parcela: el escritor del organigrama (`rol: AUTORIDAD_NOMINA`) declara
 * alcances y concedidos; cualquier otro rol es un SEGUNDO ESCRITOR → se le RECHAZA en el acto
 * (403). La autorizacion (`autorizar`) es LECTURA determinista: NO muta.
 *
 * Invariante: dato ausente = desconocido. A quien no se le ha declarado alcance se le aplica
 * `self_only` (el mas estrecho), no se le concede un acceso "de buena fe".
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de un solo escritor.
 * Ver hoja G7 del plan-construccion y diseno-oop.md (CLASE AccesoNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela: la AUTORIDAD DE PERSONAL (el organigrama / quien gobierna).
const ROL_AUTORIDAD = 'AUTORIDAD_NOMINA';

// Alcances DECLARABLES (no cableados como ley): el mas estrecho es el default.
const ALCANCE_DEFAULT = 'self_only';
const ALCANCES_VALIDOS = new Set([ALCANCE_DEFAULT, 'equipo', 'admin']);

class AccesoNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'acceso-nomina';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, permisos: Map<persona,{alcance,empleado,ve_a}>, concedidos: [] }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'acceso-nomina.json',
      dir: '/contabilidad/acceso-nomina',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return {
          project_id: pid,
          esquema: p.esquema,
          permisos: [...p.permisos.entries()].map(([persona, v]) => ({ persona, ...v })),
          concedidos: p.concedidos
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const permisos = new Map();
        for (const d of (data.permisos || [])) {
          if (d && d.persona != null) {
            permisos.set(String(d.persona), {
              alcance: d.alcance != null ? String(d.alcance) : ALCANCE_DEFAULT,
              empleado: d.empleado != null ? String(d.empleado) : null,
              ve_a: Array.isArray(d.ve_a) ? d.ve_a.map(String) : [],
              declarado_en: d.declarado_en ?? null
            });
          }
        }
        this._parcelas.set(pid, {
          esquema: data.esquema || 'contabilidad-acceso-nomina-v1',
          permisos,
          concedidos: Array.isArray(data.concedidos) ? data.concedidos : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los permisos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC de LECTURA (NO muta): ¿puede `quien` ver la nomina de `empleado`? ──
  onAutorizarRequest(e) {
    return this._atender(e, 'autorizar', 'acceso-nomina.autorizar.response', async (d) => {
      const res = this._autorizar(d);
      if (res.status !== 200) this.eventBus?.publish('acceso-nomina.autorizar.failed', res);
      return res;
    });
  }

  // ── handler RPC de ESCRITURA (UN escritor: la autoridad de personal): declara permisos ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'acceso-nomina.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: la gobernanza de acceso quedo declarada.
        this.eventBus?.publish('contabilidad.acceso_nomina', {
          project_id: res.data.project_id,
          persona: res.data.persona,
          alcance: res.data.alcance,
          empleado: res.data.empleado,
          ve_a: res.data.ve_a,
          declarado_por: ROL_AUTORIDAD,
          correlation_id: d.correlation_id
        });
      } else {
        // Falta de declaracion, guard de escritor violado → par determinista.
        this.eventBus?.publish('acceso-nomina.declarar.failed', res);
      }
      return res;
    });
  }

  // ── PROYECCION DE LECTURA (NO muta): autorizar(quien, empleado) → bool + motivo ──
  _autorizar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const quien = input.quien != null ? String(input.quien).trim() : '';
    if (!quien) return this._invalid('quien');
    // `empleado` = de quien es la nomina que se pretende ver; `nomina.empleado` tambien vale.
    const empleado = input.empleado != null ? String(input.empleado).trim()
      : (input.nomina && input.nomina.empleado != null ? String(input.nomina.empleado).trim() : quien);

    const parcela = this._obtenerOCrear(pid);
    const alcance = this._alcanceDe(parcela, quien);

    // AISLAMIENTO PERSONA↔PERSONA: lo primero es el EJE PERSONA — uno ve la suya SIEMPRE.
    const es_propia = empleado === quien;

    let permitido;
    let motivo;
    if (es_propia) {
      permitido = true;
      motivo = 'cada uno ve la suya (eje persona)';
    } else if (alcance === 'admin') {
      permitido = true;
      motivo = 'alcance admin declarado: gobierna la parcela de personal';
    } else if (alcance === 'equipo' && this._enConcedido(parcela, quien, empleado)) {
      permitido = true;
      motivo = 'alcance de equipo y encargo declarado para esa persona';
    } else {
      // Sin encargo declarado, la nomina de OTRO queda DENEGADA. Nada se concede de buena fe.
      permitido = false;
      motivo = 'la nomina es dato personal: sin encargo declarado no se ve la de otro (aislamiento persona-a-persona)';
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        quien,
        empleado,
        alcance,
        es_propia,
        permitido,
        motivo,
        // La gobernanza es DATO declarable: la autoridad declara; el modulo no cablea la ley.
        ley_origen: 'declarada',
        ley_cableada: false
      }
    };
  }

  // ── PROYECCION DE ESCRITURA (UN escritor: la AUTORIDAD_NOMINA): declarar un permiso ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de un solo escritor: solo la autoridad de personal declara la parcela de personal.
    if (input.rol !== ROL_AUTORIDAD) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo la autoridad de personal (AUTORIDAD_NOMINA) declara el acceso a la nomina; un segundo escritor es corrupcion',
        { rol_esperado: ROL_AUTORIDAD, rol_recibido: input.rol ?? null });
    }

    const persona = input.persona != null ? String(input.persona).trim()
      : (input.quien != null ? String(input.quien).trim() : '');
    if (!persona) return this._invalid('persona');

    // El alcance es DECLARABLE; sin declarar → self_only (el mas estrecho, jamas "de buena fe").
    const alcance = input.alcance != null ? String(input.alcance).trim() : ALCANCE_DEFAULT;
    if (!ALCANCES_VALIDOS.has(alcance)) {
      return this._errorResponse(400, 'ALCANCE_NO_DECLARADO',
        `alcance '${alcance}' no es un alcance declarable`,
        { alcances_declarables: [...ALCANCES_VALIDOS] });
    }

    const ve_a = this._normalizarVeA(input.ve_a != null ? input.ve_a : input.concedidos);
    // Los concedidos: el encargo DECLARADO persona→empleados concretos (nada de "todo el equipo").
    const parcela = this._obtenerOCrear(pid);
    for (const empleado of ve_a) {
      if (!parcela.concedidos.some((c) => c.quien === persona && c.empleado === empleado)) {
        parcela.concedidos.push({ quien: persona, empleado, declarado_en: new Date().toISOString() });
      }
    }

    const permiso = {
      alcance,
      empleado: input.empleado != null ? String(input.empleado) : persona,
      ve_a,
      declarado_en: new Date().toISOString()
    };
    parcela.permisos.set(persona, permiso);
    parcela.updated_at = permiso.declarado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        persona,
        alcance: permiso.alcance,
        empleado: permiso.empleado,
        ve_a: permiso.ve_a,
        declarado_por: ROL_AUTORIDAD,
        // Cada uno ve la suya, siempre: se declara el acceso propio junto al concedido.
        accesos_efectivos: this._efectivos(persona, permiso),
        ley_origen: 'declarada',
        ley_cableada: false
      }
    };
  }

  // Los accesos efectivos de la persona: su propia nomina SIEMPRE + los encargos declarados.
  _efectivos(persona, permiso) {
    const propios = new Set([persona]);
    if (permiso.alcance === 'admin' || permiso.alcance === 'equipo') {
      for (const e of permiso.ve_a) propios.add(e);
    }
    return [...propios].sort();
  }

  _normalizarVeA(raw) {
    if (raw === undefined || raw === null || raw === '') return [];
    if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
    if (typeof raw === 'object') return Object.keys(raw).filter((k) => raw[k]).map(String);
    return [String(raw)];
  }

  _alcanceDe(parcela, persona) {
    const p = parcela.permisos.get(persona);
    return p && p.alcance ? p.alcance : ALCANCE_DEFAULT;   // sin declarar → el mas estrecho
  }

  _enConcedido(parcela, quien, empleado) {
    return parcela.concedidos.some((c) => c.quien === quien && c.empleado === empleado);
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-acceso-nomina-v1', permisos: new Map(), concedidos: [] };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa (mismo proceso) para otros custodios — NO muta.
  alcanceDe(pid, persona) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? this._alcanceDe(p, String(persona)) : ALCANCE_DEFAULT;
  }

  // ── Tools ──
  toolAutorizar(params) { return this._autorizar(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = AccesoNomina;
