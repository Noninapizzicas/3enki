/**
 * contabilidad-fiscal/rectificacion-declaracion — CUSTODIO CON PERSISTENCIA (D14, hoja del plan).
 *
 * CAMINO DE CORRECCION **POSTERIOR A LA PRESENTACION** de una declaracion (complementaria /
 * sustitutiva). Uno de los CUATRO planos de correccion (B5 asiento-ajuste · A13 hecho-rectificativo
 * · O2 factura-rectificativa · D14 esta) — TRES actos, no uno; **!= asiento-ajuste B5**.
 *
 * LA INVARIANTE (invariante 3 aplicada aqui): **la declaracion ORIGINAL NO se borra**; la
 * rectificacion **SUMA** (append-only) y queda **TRAZADA** (liga a la original, con su motivo y su
 * autor). Este custodio nunca emite ninguna operacion de supresion: solo apila rectificaciones y
 * conserva la cadena original→rectificacion.
 *
 * El sistema GENERA y REGISTRA; el ASESOR presenta y firma la rectificacion. Aqui NO se presenta:
 * cada rectificacion declara `presentada_por_sistema:false` y `firmada_por_sistema:false`.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): el TIPO de rectificacion es DECLARABLE (`tipos_declarables`);
 * sin declarar manda el vocabulario del dominio del diseño OOP (complementaria / sustitutiva). NO se
 * cablea ningun plazo, ejercicio, escala ni importe legal: los importes de la rectificacion entran
 * DECLARADOS (`importes`) tal cual; si no vienen, la rectificacion se registra SIN importes (no se
 * inventan cifras). Sin motivo no se inventa la causa: se declara `motivo:null`.
 *
 * Depende de estado-presentacion-fiscal (D12) POR EVENTO: se consulta el estado vigente de la
 * obligacion para TRAZARLO junto a la rectificacion (lectura best-effort; nunca un `require`).
 *
 * UN SOLO ESCRITOR: el rectificador (rol RECTIFICADOR_DECLARACION). Cualquier otro rol es rechazado (403).
 *
 * Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja D14 del plan-construccion y diseno-oop.md (CLASE RectificacionDeclaracion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: el rectificador de declaraciones.
const ROL_ESCRITOR = 'RECTIFICADOR_DECLARACION';

// Tipos de rectificacion del dominio (vocabulario del diseño OOP, NO tabla legal). Declarables.
const TIPOS_POR_DEFECTO = ['complementaria', 'sustitutiva'];

class RectificacionDeclaracion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'rectificacion-declaracion';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, rectificaciones: [append-only], por_original: Map<clave, [ids]> }
    this._rectificaciones = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'rectificacion-declaracion.json',
      dir: '/contabilidad/rectificacion-declaracion',
      snapshot: (pid) => {
        const c = this._rectificaciones.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, rectificaciones: c.rectificaciones };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const rectificaciones = Array.isArray(data.rectificaciones) ? data.rectificaciones : [];
        const por_original = new Map();
        for (const r of rectificaciones) {
          if (!r || r.original_clave == null) continue;
          const k = String(r.original_clave);
          if (!por_original.has(k)) por_original.set(k, []);
          por_original.get(k).push(r.id);
        }
        this._rectificaciones.set(pid, {
          esquema: data.esquema || 'contabilidad-rectificacion-declaracion-v1',
          rectificaciones,
          por_original
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las rectificaciones del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onRectificarRequest(e) {
    return this._atender(e, 'rectificar', 'rectificacion-declaracion.rectificar.response', async (d) => {
      const res = await this._rectificar(d);
      if (res.status === 200 && res.data.rectificada) {
        // Exito → evento de dominio: la declaracion quedo rectificada (append-only, trazada).
        this.eventBus?.publish('contabilidad.declaracion_rectificada', {
          project_id: res.data.project_id,
          rectificacion: res.data.rectificacion,
          id: res.data.rectificacion.id,
          original_clave: res.data.rectificacion.original_clave,
          tipo: res.data.rectificacion.tipo,
          // El original NO se borra: la rectificacion SUMA y queda trazada.
          borra_original: false,
          suma: true,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('rectificacion-declaracion.rectificar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): rectifica posterior a la presentacion ──
  async _rectificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el rectificador rectifica declaraciones.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el rectificador (RECTIFICADOR_DECLARACION) rectifica una declaracion presentada',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    // La declaracion ORIGINAL a la que se rectifica: obligatoria. Sin ella no hay rectificacion.
    const original_clave = input.original_clave != null ? String(input.original_clave).trim()
      : (input.declaracion != null ? String(input.declaracion).trim() : '');
    if (!original_clave) return this._invalid('original_clave');

    // El tipo es DECLARABLE; sin declarar manda el vocabulario del dominio.
    const tipos = this._tiposDe(input);
    const tipo = input.tipo != null ? String(input.tipo).toLowerCase() : null;
    if (!tipo) return this._invalid('tipo');
    if (!tipos.includes(tipo)) {
      return this._errorResponse(422, 'TIPO_NO_DECLARABLE',
        'tipo de rectificacion no declarado', { tipo, tipos_declarables: tipos });
    }

    // Los importes de la rectificacion entran DECLARADOS tal cual; sin ellos, no se inventan cifras.
    const importes = (input.importes && typeof input.importes === 'object') ? input.importes : null;

    // El estado vigente de la obligacion se TRAZA junto a la rectificacion (D12, POR EVENTO,
    // best-effort de lectura: nunca un require cruzado; sin respuesta queda null, no se finge).
    const estado_vigente = await this._estadoVigente(pid, input.obligacion || original_clave);

    const c = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();

    // LA RECTIFICACION: append-only, ligada a la original, con su motivo y su autor.
    // NUNCA sustituye a la original (borra_original:false); SUMA (suma:true).
    const rectificacion = {
      id: `${pid}-r${c.rectificaciones.length + 1}`,
      original_clave,
      tipo,
      motivo: input.motivo != null ? String(input.motivo) : null,
      importes,
      obligacion: input.obligacion != null ? String(input.obligacion) : null,
      ejercicio: input.ejercicio != null ? String(input.ejercicio) : null,
      periodo: input.periodo != null ? String(input.periodo) : null,
      estado_vigente_al_rectificar: estado_vigente,
      // Invariante: el original NO se borra; la rectificacion SUMA y queda trazada.
      borra_original: false,
      suma: true,
      append_only: true,
      traza: { original_clave, por: ROL_ESCRITOR, en: ahora },
      // El sistema GENERA y REGISTRA; el ASESOR presenta y firma.
      presentada_por_sistema: false,
      firmada_por_sistema: false,
      rectificada_por: ROL_ESCRITOR,
      rectificada_en: ahora
    };

    // APPEND-ONLY: se apila. La original permanece; no se reescribe ninguna rectificacion anterior.
    c.rectificaciones.push(rectificacion);
    if (!c.por_original.has(original_clave)) c.por_original.set(original_clave, []);
    c.por_original.get(original_clave).push(rectificacion.id);
    c.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        rectificada: true,
        rectificacion,
        total_rectificaciones: c.rectificaciones.length,
        rectificaciones_de_la_original: c.por_original.get(original_clave).length,
        // El original NO se borra: la rectificacion SUMA y queda trazada.
        borra_original: false,
        suma: true
      }
    };
  }

  // El estado vigente de la obligacion se pide a estado-presentacion-fiscal (D12) POR EVENTO.
  async _estadoVigente(pid, obligacion) {
    if (!obligacion) return null;
    const r = await this._rpc('estado-presentacion-fiscal.estado.request',
      { project_id: pid, obligacion: String(obligacion) }, { timeout_ms: 4000 });
    const d = r && r.status === 200 ? r.data : null;
    return (d && d.registrada) ? d.estado : null;
  }

  // Los tipos son DECLARABLES; sin declaracion manda el vocabulario del dominio.
  _tiposDe(input = {}) {
    const t = Array.isArray(input.tipos_declarables)
      ? input.tipos_declarables.map(x => String(x).toLowerCase()).filter(Boolean)
      : null;
    if (t && t.length) return t;
    return TIPOS_POR_DEFECTO;
  }

  _obtenerOCrear(pid) {
    let c = this._rectificaciones.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-rectificacion-declaracion-v1', rectificaciones: [], por_original: new Map() };
      this._rectificaciones.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa para otras hojas (no muta): rectificaciones de una declaracion original.
  rectificacionesDe(pid, original_clave) {
    const c = pid ? this._rectificaciones.get(pid) : null;
    if (!c || original_clave == null) return [];
    const ids = c.por_original.get(String(original_clave)) || [];
    return c.rectificaciones.filter(r => ids.includes(r.id));
  }

  // ── Tools ──
  toolRectificar(params) { return this._rectificar(params); }
}

module.exports = RectificacionDeclaracion;
