/**
 * contabilidad-entrada/anclaje-cierre-vertical — CUSTODIO CON PERSISTENCIA (A14, hoja del plan).
 *
 * LA PARCELA DECLARABLE POR VERTICAL de QUE ES "un cierre" y COMO se identifica. Su
 * puerto es construible; su CONTENIDO pende de `unidad_de_cierre` (dato del DUENO, via
 * cola-declaraciones-criterio K9). Un cierre se ANCLA a su clave:
 *   - `(proyecto, jornada)`          → el DIA cierra la CAJA.
 *   - `(proyecto, ejercicio, mes)`   → el MES cierra la CONTABILIDAD.
 *
 * Invariante 7/13: la unidad de cierre se DECLARA, no se estima. Sin definicion
 * declarada para una vertical, `anclar` devuelve `anclado:false` — el puerto existe,
 * pero no se inventa la clave de un cierre que el dueno no definio.
 *
 * UN SOLO ESCRITOR de la parcela: el declarante (rol DECLARANTE_ANCLAJE); cualquier
 * otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - Una definicion de cierre es `{unidad_de_cierre, campos_clave}` — declarada, no cableada.
 *  - No se sobrescribe: re-declarar APPENDEA version nueva (historial) y fecha la vigente.
 *  - La clave se DERIVA de la unidad declarada; sin unidad no hay clave inventada.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja A14 del plan-construccion y diseno-oop.md (CLASE AnclajeCierreVertical).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela: quien declara que es "un cierre" por vertical.
const ROL_ESCRITOR = 'DECLARANTE_ANCLAJE';

// Unidades de cierre conocidas y su forma de clave (dato del diseno; NO el valor).
//  - JORNADA: el dia cierra la caja     → (proyecto, jornada)
//  - MES:     el mes cierra la contabilidad → (proyecto, ejercicio, mes)
const CLAVES_POR_UNIDAD = {
  JORNADA: ['jornada'],
  MES: ['ejercicio', 'mes']
};

class AnclajeCierreVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'anclaje-cierre-vertical';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, anclajes: Map<vertical, DefinicionCierre> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'anclaje-cierre-vertical.json',
      dir: '/contabilidad/anclaje-cierre-vertical',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, anclajes: [...p.anclajes.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const anclajes = new Map();
        for (const a of (data.anclajes || [])) if (a && a.vertical != null) anclajes.set(String(a.vertical), a);
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-anclaje-cierre-vertical-v1', anclajes });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los anclajes de cierre del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onAnclarRequest(e) {
    return this._atender(e, 'anclar', 'anclaje-cierre-vertical.anclar.response', async (d) => {
      const res = this._anclar(d);
      if (res.status !== 200) this.eventBus?.publish('anclaje-cierre-vertical.anclar.failed', res);
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'anclaje-cierre-vertical.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el cierre de una vertical quedo anclado.
        this.eventBus?.publish('contabilidad.cierre_anclado', {
          project_id: res.data.project_id,
          anclaje: res.data.anclaje,
          vertical: res.data.anclaje.vertical,
          unidad_de_cierre: res.data.anclaje.unidad_de_cierre,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('anclaje-cierre-vertical.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta): anclar(f:Fuente) → DefinicionCierre ──
  _anclar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const parcela = this._obtenerOCrear(pid);
    const def = parcela.anclajes.get(vertical) || null;

    // Sin definicion declarada: el puerto existe; la clave NO se inventa.
    if (!def) {
      return {
        status: 200,
        data: {
          project_id: pid,
          vertical,
          anclado: false,
          anclaje: null,
          motivo: 'la vertical no ha declarado su unidad de cierre (dato del dueno, pendiente)'
        }
      };
    }

    // Clave DERIVADA de la unidad declarada; sin unidad → null (no una clave fabricada).
    const clave = this._claveDe(pid, def, input.periodo);
    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        anclado: true,
        anclaje: {
          vertical,
          unidad_de_cierre: def.unidad_de_cierre,
          campos_clave: def.campos_clave,
          version: def.version,
          declarado_por: def.declarado_por,
          declarado_en: def.declarado_en
        },
        clave,
        clave_disponible: clave != null
      }
    };
  }

  // ── proyeccion de escritura (UN escritor): se declara QUE es un cierre ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el declarante asienta anclajes.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el declarante (DECLARANTE_ANCLAJE) puede anclar el cierre de una vertical',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const unidad = input.unidad_de_cierre != null ? String(input.unidad_de_cierre).toUpperCase().trim() : '';
    if (!unidad) return this._invalid('unidad_de_cierre');

    const campos = Object.prototype.hasOwnProperty.call(CLAVES_POR_UNIDAD, unidad)
      ? [...CLAVES_POR_UNIDAD[unidad]]
      : (Array.isArray(input.campos_clave) ? input.campos_clave.map(c => String(c).trim()).filter(Boolean) : null);
    if (!campos || campos.length === 0) return this._invalid('campos_clave');

    const parcela = this._obtenerOCrear(pid);
    const previo = parcela.anclajes.get(vertical) || null;
    const ahora = new Date().toISOString();

    const def = {
      vertical,
      unidad_de_cierre: unidad,
      campos_clave: campos,
      version: previo ? previo.version + 1 : 1,
      declarado_por: ROL_ESCRITOR,
      declarado_en: ahora,
      // Re-declarar NO borra el anclaje anterior: se apila su historial.
      historial: previo && Array.isArray(previo.historial) ? previo.historial : [],
      actualizado_en: ahora
    };
    def.historial.push({ unidad_de_cierre: unidad, campos_clave: campos, version: def.version, por: ROL_ESCRITOR, en: ahora });

    parcela.anclajes.set(vertical, def);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        anclaje: { vertical, unidad_de_cierre: unidad, campos_clave: campos, version: def.version, declarado_por: ROL_ESCRITOR, declarado_en: ahora },
        anclado: true,
        sobrescritura: Boolean(previo)
      }
    };
  }

  // Clave del cierre DERIVADA: (proyecto, jornada) para caja · (proyecto, ejercicio, mes) para contabilidad.
  // Con una unidad declarada desconocida, la clave se compone con los campos_clave declarados
  // (si llegan en el periodo); si no llegan, devuelve null — nunca una clave fabricada.
  _claveDe(pid, def, periodo) {
    const p = periodo && typeof periodo === 'object' ? periodo : {};
    const unidad = def.unidad_de_cierre;
    if (unidad === 'JORNADA') {
      if (p.jornada === undefined || p.jornada === null || p.jornada === '') return null;
      return `${pid}|${String(p.jornada)}`;
    }
    if (unidad === 'MES') {
      if (p.ejercicio === undefined || p.mes === undefined) return null;
      return `${pid}|${String(p.ejercicio)}|${String(p.mes)}`;
    }
    const campos = Array.isArray(def.campos_clave) ? def.campos_clave : [];
    if (campos.length === 0) return null;
    const partes = [];
    for (const c of campos) {
      if (p[c] === undefined || p[c] === null || p[c] === '') return null;
      partes.push(String(p[c]));
    }
    return [pid, ...partes].join('|');
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-anclaje-cierre-vertical-v1', anclajes: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Definicion declarada de una vertical (mismo proceso) — no muta.
  anclajeDe(pid, vertical) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p && vertical != null ? (p.anclajes.get(String(vertical)) || null) : null;
  }

  // ── Tools ──
  toolAnclar(params) { return this._anclar(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = AnclajeCierreVertical;
