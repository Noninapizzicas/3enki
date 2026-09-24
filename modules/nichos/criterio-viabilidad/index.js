/**
 * nichos/criterio-viabilidad — CUSTODIO CON PERSISTENCIA (C2, hoja del plan).
 *
 * PIEZA CENTRAL del eslabón limitante (embudo de validación): guarda el
 * CRITERIO/UMBRAL DE VIABILIDAD declarable que decide qué nicho es viable.
 * Almacena por proyecto: umbral_ingresos (base 50-300 EUR/semana según tipo,
 * [ABIERTO]), minimos_demanda (búsquedas y contactos por semana),
 * disposicion_a_pagar y el tipo/segmento de viabilidad.
 *
 * CUSTODIO (patrón real, distinto del reflejo stateless): un solo escritor del
 * store — el DUEÑO declara el umbral (guard Rol=DUEÑO via K3); además el bucle
 * C7->C2 recalibra en caliente consumiendo nichos.umbral.recalibrado. La lectura
 * (_leer/leerVigente) no muta; la escritura valida y guarda. Persiste por
 * proyecto con PosPersistencia (storage /prisma/nichos/criterio-viabilidad.json),
 * restaura en project.activated y vuelca en onUnload. Emisor/par de fallo.
 *
 * REGLA: el corte DURO 'no viable no pasa' vive aquí (umbral vigente) + C6
 * (corte-temprano), NUNCA en el agente de veredicto. Ver hoja C2 del
 * plan-construccion y arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor declarable — el DUEÑO. El sistema recalibra (bucle C7),
// pero solo el dueño DECLARA el criterio base.
const ROL_DUENYO = 'DUEÑO';

// Rango base declarable del umbral de ingresos semanales (75-300 EUR/semana,
// [ABIERTO] por tipo). Es un CRITERIO, no una norma dura: se valida dentro del
// rango declarable del plan pero se permite declarar cualquier número > 0.
const UMBRAL_MIN_EUR = 50;
const UMBRAL_MAX_EUR = 300;
const RANGO = `${UMBRAL_MIN_EUR}-${UMBRAL_MAX_EUR} EUR/semana`;

// Tipos de viabilidad permitidos por el criterio ([ABIERTO]).
const TIPOS_VIABILIDAD = new Set(['marginal', 'estandar', 'premium']);

// Shape base del criterio declarable. El dueño declara todo o un subset; cada
// campo se valida y normaliza sobre este molde.
function criterioVacio() {
  return {
    esquema: 'nichos-criterio-viabilidad-v1',
    umbral_ingresos: null,          // { number > 0 } — EUR/semana (base 50-300)
    minimos_demanda: null,          // { numero_busquedas, contactos_semana } — mínimos de demanda
    disposicion_a_pagar: null,      // { number > 0 } — disposición a pagar EUR/venta
    tipo: null,                     // marginal|estandar|premium — segmento de viabilidad [ABIERTO]
    recalibrado_por: null,          // 'DUEÑO' (declarado) | 'SISTEMA_C7' (recalibrado)
    updated_at: null,
    declarado_por: null
  };
}

// Normalizador de un número (entero/float) estrictamente positivo, o null.
function numPos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

class CriterioViabilidad extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'criterio-viabilidad';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> objeto de criterio (un solo estado por proyecto)
    this._criterios = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'criterio-viabilidad.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const c = this._criterios.get(pid);
        return c ? { project_id: pid, criterio: c } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.criterio) this._criterios.set(pid, data.criterio);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el criterio del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender / fire-and-forget) ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.criterio.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.criterio.declarar.response', async (d) => {
      const res = await this._declarar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.criterio.declarado', {
          project_id: res.data.project_id,
          criterio: res.data.criterio,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.criterio.declarar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget del bucle C7->C2: reglas-aprendidas recalibra el umbral.
  onUmbralRecalibrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._recalibrar(d);
    if (res.status === 200) {
      this.eventBus?.publish('nichos.criterio.recalibrado', {
        project_id: res.data.project_id,
        criterio: res.data.criterio,
        recalibrado: true,
        delta: d.delta,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('nichos.criterio.recalibrar.failed', res);
    }
    return res;
  }

  // ── proyección de lectura (NO muta); exponer el umbral vigente ──
  _obtenerOCrear(pid) {
    let c = this._criterios.get(pid);
    if (!c) {
      c = criterioVacio();
      this._criterios.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const c = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, criterio: c } };
  }

  // Alias semántico del veredicto (C3): devuelve el umbral vigente del nicho.
  leerVigente(pid) {
    if (!pid) return null;
    return this._criterios.get(pid) || criterioVacio();
  }

  // ── proyección de escritura declarable (el único escritor: DUEÑO) ──
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el DUEÑO puede declarar el criterio base.
    if (input.rol !== ROL_DUENYO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUEÑO puede declarar el criterio de viabilidad', {
        rol_esperado: ROL_DUENYO, rol_recibido: input.rol
      });
    }

    const crit = input.criterio;
    if (!crit || typeof crit !== 'object') {
      return this._invalid('criterio');
    }

    const actual = criterioVacio();
    const previo = this._criterios.get(pid) || criterioVacio();

    // Merge conservador sobre el molde; valida y normaliza cada campo declarable.
    if (crit.umbral_ingresos != null && crit.umbral_ingresos !== '') {
      const u = numPos(crit.umbral_ingresos);
      if (!u) return this._invalid('criterio.umbral_ingresos');
      actual.umbral_ingresos = u;
    } else if (previo.umbral_ingresos != null) {
      actual.umbral_ingresos = previo.umbral_ingresos;
    }

    if (crit.minimos_demanda && typeof crit.minimos_demanda === 'object') {
      const numero_busquedas = numPos(crit.minimos_demanda.numero_busquedas);
      const contactos_semana = numPos(crit.minimos_demanda.contactos_semana);
      // tolera que solo se exija UNO de los dos mínimos; ambos null = inválido
      if (numero_busquedas == null && contactos_semana == null) {
        return this._invalid('criterio.minimos_demanda');
      }
      actual.minimos_demanda = {
        numero_busquedas,
        contactos_semana
      };
    } else if (previo.minimos_demanda) {
      actual.minimos_demanda = previo.minimos_demanda;
    }

    if (crit.disposicion_a_pagar != null && crit.disposicion_a_pagar !== '') {
      const p = numPos(crit.disposicion_a_pagar);
      if (!p) return this._invalid('criterio.disposicion_a_pagar');
      actual.disposicion_a_pagar = p;
    } else if (previo.disposicion_a_pagar != null) {
      actual.disposicion_a_pagar = previo.disposicion_a_pagar;
    }

    if (crit.tipo != null && crit.tipo !== '') {
      const tipo = String(crit.tipo).toLowerCase();
      if (!TIPOS_VIABILIDAD.has(tipo)) return this._invalid('criterio.tipo');
      actual.tipo = tipo;
    } else if (previo.tipo) {
      actual.tipo = previo.tipo;
    }

    actual.updated_at = new Date().toISOString();
    actual.recalibrado_por = 'DUEÑO';
    actual.declarado_por = ROL_DUENYO;

    this._criterios.set(pid, actual);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, criterio: actual, declarado: true } };
  }

  // ── proyección de recalibración (bucle C7->C2, autorizado al SISTEMA) ──
  _recalibrar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const delta = input.delta;
    // Delta debe ser un objeto con al menos un ajuste numérico finito.
    if (!delta || typeof delta !== 'object') return this._invalid('delta');
    const dltaIn = numPos(delta.umbral_ingresos) ?? numPos(delta.minimos_demanda);
    if (dltaIn == null) return this._invalid('delta');

    const actual = this._obtenerOCrear(pid);
    const previo = this._criterios.get(pid) || criterioVacio();

    // Refina: suma/resta el delta al umbral vigente (nunca baja de 0).
    if (delta.umbral_ingresos != null) {
      const ajuste = Number(delta.umbral_ingresos);
      if (!Number.isFinite(ajuste) || ajuste === 0) return this._invalid('delta.umbral_ingresos');
      const base = previo.umbral_ingresos != null ? previo.umbral_ingresos : 0;
      actual.umbral_ingresos = Math.max(0, base + ajuste);
    } else {
      actual.umbral_ingresos = previo.umbral_ingresos;
    }

    if (delta.minimos_demanda && typeof delta.minimos_demanda === 'object') {
      const prevMin = previo.minimos_demanda || {};
      const nuevo = { numero_busquedas: prevMin.numero_busquedas, contactos_semana: prevMin.contactos_semana };
      if (delta.minimos_demanda.numero_busquedas != null) {
        const n = Math.round(Number(delta.minimos_demanda.numero_busquedas));
        if (!Number.isFinite(n)) return this._invalid('delta.minimos_demanda.numero_busquedas');
        nuevo.numero_busquedas = Math.max(0, (prevMin.numero_busquedas || 0) + n);
      }
      if (delta.minimos_demanda.contactos_semana != null) {
        const n = Math.round(Number(delta.minimos_demanda.contactos_semana));
        if (!Number.isFinite(n)) return this._invalid('delta.minimos_demanda.contactos_semana');
        nuevo.contactos_semana = Math.max(0, (prevMin.contactos_semana || 0) + n);
      }
      actual.minimos_demanda = nuevo;
    } else {
      actual.minimos_demanda = previo.minimos_demanda;
    }

    actual.disposicion_a_pagar = previo.disposicion_a_pagar;
    actual.tipo = previo.tipo;
    actual.updated_at = new Date().toISOString();
    actual.recalibrado_por = 'SISTEMA_C7';

    this._criterios.set(pid, actual);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, criterio: actual, recalibrado: true, resultado_real: input.resultado_real } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolDeclarar(params) { return this._declarar(params); }
  toolRecalibrar(params) { return this._recalibrar(params); }
}

module.exports = CriterioViabilidad;
