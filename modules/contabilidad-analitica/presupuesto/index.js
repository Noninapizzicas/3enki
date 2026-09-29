/**
 * contabilidad-analitica/presupuesto — CUSTODIO CON PERSISTENCIA (J3, hoja del plan).
 *
 * DONDE EL JEFE FIJA LOS OBJETIVOS. Este modulo es la DECLARACION del futuro economico: una
 * cifra objetivo por dimension analitica (centro, linea, producto) y por periodo. NO es una
 * inferencia: el sistema NUNCA inventa un objetivo. Un presupuesto sin cifra declarada NO existe
 * — queda `[ABIERTO]`, con su objetivo en null y declarado el hueco. Jamas se rellena con lo real
 * del periodo anterior ni con un 0: eso seria decidir por el jefe (invariante: el JEFE DECIDE Y
 * DECLARA).
 *
 * ATRIBUTOS del diseno: `objetivos:Map<Dimension,Cuantía>`.
 *   METODOS: fijar(d, v), objetivo(d, periodo):Cuantía.
 *   REGLA: cifra objetivo por dimension declarable. UN escritor.
 *
 * UN SOLO ESCRITOR: solo el JEFE (rol JEFE_PRESUPUESTO) fija objetivos; cualquier otro rol es
 * rechazado (segundo escritor → 403). El `objetivo` es LECTURA: no muta nada.
 *
 * EL UMBRAL DE AVISO TAMBIEN ES DECLARABLE: el jefe declara, junto al objetivo, el umbral a
 * partir del cual una desviacion debe avisar (`umbral`). No se cablea ningun porcentaje: ausente
 * → null y declarado (J4 lo leera y no avisara sin umbral declarado).
 *
 * LOS OBJETIVOS SON DATOS APILADOS: fijar de nuevo la misma (dimension, periodo) NO borra el
 * objetivo anterior — se apila en su historial y el vigente queda declarado con su fecha y autor.
 * Jamas se sobrescribe en silencio (la traza de lo que el jefe fijo es la fuente de verdad).
 *
 * Invariantes:
 *  - El JEFE DECIDE Y DECLARA: el sistema no infiere objetivos; ausente → [ABIERTO].
 *  - LEY/PARAMETRO COMO DATO: la cifra, el periodo y el umbral son entrada; cero constantes.
 *  - Dato ausente = desconocido: `objetivo` sin valor declarado → valor null y `abierto:true`.
 *  - Un solo escritor por parcela (guard JEFE_PRESUPUESTO).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Emite `contabilidad.presupuesto_fijado` en cada fijacion (lo consume `desviacion` J4).
 * Ver hoja J3 del plan-construccion y diseno-oop.md (CLASE Presupuesto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el JEFE fija los objetivos. Nadie mas declara el futuro del negocio.
const ROL_ESCRITOR = 'JEFE_PRESUPUESTO';

class Presupuesto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'presupuesto';
    this.version = 'reflejo-0.1.0';
    // store: project_id → { esquema, objetivos: Map<clave, Objetivo> }
    // clave = `${periodo}|${dimension}` — un objetivo por dimension Y periodo (declarado).
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'presupuesto.json',
      dir: '/contabilidad/presupuesto',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, objetivos: [...p.objetivos.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const objetivos = new Map();
        for (const o of (data.objetivos || [])) {
          if (!o) continue;
          const k = o.clave || (o.periodo != null && o.dimension != null ? `${o.periodo}|${o.dimension}` : null);
          if (k) objetivos.set(String(k), o);
        }
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-presupuesto-v1', objetivos });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela de objetivos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onFijarRequest(e) {
    return this._atender(e, 'fijar', 'presupuesto.fijar.response', async (d) => {
      const res = this._fijar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el JEFE declaro un objetivo. Lo consume desviacion (J4).
        this.eventBus?.publish('contabilidad.presupuesto_fijado', {
          project_id: res.data.project_id,
          objetivo: res.data.objetivo,
          clave: res.data.objetivo.clave,
          dimension: res.data.objetivo.dimension,
          periodo: res.data.objetivo.periodo,
          valor: res.data.objetivo.valor,
          umbral: res.data.objetivo.umbral,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('presupuesto.fijar.failed', res);
      }
      return res;
    });
  }

  onObjetivoRequest(e) {
    return this._atender(e, 'objetivo', 'presupuesto.objetivo.response', async (d) => {
      const res = this._objetivo(d);
      if (res.status !== 200) this.eventBus?.publish('presupuesto.objetivo.failed', res);
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): el JEFE declara el objetivo ──
  _fijar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el JEFE (JEFE_PRESUPUESTO) declara objetivos.
    const guard = this._guardEscritor(input.rol);
    if (guard) return guard;

    const dimension = this._clave(input.dimension != null ? input.dimension : (input.centro ?? input.linea ?? input.producto));
    if (dimension === null) return this._invalid('dimension');
    const periodo = input.periodo != null ? String(input.periodo).trim() : '';
    if (!periodo) return this._invalid('periodo');

    // El VALOR objetivo es ParametroDeclarable. Ausente/vacio NO se estima: queda [ABIERTO].
    const tieneValor = this._num(input.valor != null ? input.valor : input.cifra) !== null;
    const valor = tieneValor ? this._num(input.valor != null ? input.valor : input.cifra) : null;
    // El UMBRAL de aviso tambien es declarable (J4 no avisa sin umbral declarado).
    const umbral = this._num(input.umbral);

    const clave = `${periodo}|${dimension}`;
    const parcela = this._obtenerOCrear(pid);
    const existente = parcela.objetivos.get(clave) || null;
    const ahora = new Date().toISOString();

    const objetivo = existente || {
      clave,
      dimension,
      periodo,
      tipo_dimension: input.tipo_dimension != null ? String(input.tipo_dimension) : (input.tipo != null ? String(input.tipo) : null),
      valor: null,
      umbral: null,
      moneda: input.moneda != null ? String(input.moneda) : null,
      estado: 'ABIERTO',
      fijado_por: null,
      fijado_en: null,
      historial: []
    };

    if (tieneValor) {
      objetivo.valor = valor;
      objetivo.estado = 'DECLARADO';
      objetivo.fijado_por = ROL_ESCRITOR;
      objetivo.fijado_en = ahora;
    } else {
      // El sistema pregunta y el JEFE aun no ha declarado: sigue [ABIERTO]. No se inventa.
      objetivo.valor = null;
      objetivo.estado = 'ABIERTO';
      objetivo.fijado_en = objetivo.fijado_en || ahora;
    }
    // El umbral se conserva si no se declara de nuevo en esta fijacion (declaracion parcial).
    if (umbral !== null) objetivo.umbral = umbral;
    if (input.moneda != null) objetivo.moneda = String(input.moneda);

    // Re-fijar NO borra: se apila el cambio en el historial (traza de lo que declaro el jefe).
    objetivo.historial = Array.isArray(objetivo.historial) ? objetivo.historial : [];
    objetivo.historial.push({
      estado: objetivo.estado, valor: objetivo.valor, umbral: objetivo.umbral, por: ROL_ESCRITOR, en: ahora
    });

    parcela.objetivos.set(clave, objetivo);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        objetivo,
        fijado: true,
        actualizado: Boolean(existente),
        // Lo que el JEFE aun no ha declarado de este objetivo (nada se rellena solo).
        abierto: objetivo.estado === 'ABIERTO'
      }
    };
  }

  // ── proyeccion de lectura: objetivo(dimension, periodo) → Cuantía (NO muta) ──
  _objetivo(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const dimension = this._clave(input.dimension != null ? input.dimension : (input.centro ?? input.linea ?? input.producto));
    const periodo = input.periodo != null ? String(input.periodo).trim() : '';
    const parcela = this._obtenerOCrear(pid);

    // Sin dimension declarada: devuelve TODOS los objetivos del periodo (o de todos los periodos).
    if (dimension === null) {
      const todos = [...parcela.objetivos.values()]
        .filter(o => !periodo || o.periodo === periodo)
        .map(o => ({ ...o }));
      return {
        status: 200,
        data: {
          project_id: pid, periodo: periodo || null, dimension: null,
          objetivo: null, objetivos: todos,
          abiertos: todos.filter(o => o.estado === 'ABIERTO').length,
          // Sin cifra declarada no hay objetivo: el sistema pregunta, no decide.
          declarados: todos.filter(o => o.estado !== 'ABIERTO').length
        }
      };
    }

    const clave = `${periodo}|${dimension}`;
    const o = parcela.objetivos.get(clave) || null;

    // Objetivo no declarado por el JEFE: se declara el hueco, NO se inventa una cifra.
    if (!o) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo: periodo || null, dimension,
          objetivo: { clave, dimension, periodo: periodo || null, valor: null, umbral: null, estado: 'ABIERTO' },
          declarado: false, abierto: true, faltan: ['valor'],
          motivo: 'el JEFE no ha declarado objetivo para esa dimension y periodo: el sistema no inventa objetivos'
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid, periodo: o.periodo, dimension: o.dimension,
        objetivo: { ...o },
        declarado: o.estado !== 'ABIERTO',
        abierto: o.estado === 'ABIERTO',
        faltan: o.estado === 'ABIERTO' ? ['valor'] : [],
        motivo: o.estado === 'ABIERTO' ? 'el JEFE no ha declarado la cifra objetivo: sigue [ABIERTO]' : null
      }
    };
  }

  // GUARD de un solo escritor: solo el JEFE declara objetivos. El segundo escritor no hace cola.
  _guardEscritor(rol) {
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el JEFE (JEFE_PRESUPUESTO) fija los objetivos: el presupuesto es una DECLARACION, no una inferencia',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: rol ?? null });
    }
    return null;
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-presupuesto-v1', objetivos: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa (mismo proceso) — no muta. La usa desviacion (J4) si comparte proceso.
  objetivosDe(pid) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? [...p.objetivos.values()] : [];
  }

  _clave(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'object') return this._clave(v.id ?? v.clave ?? v.nombre ?? v.centro ?? v.linea ?? v.producto);
    return String(v);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolFijar(params) { return this._fijar(params); }
  toolObjetivo(params) { return this._objetivo(params); }
}

module.exports = Presupuesto;
