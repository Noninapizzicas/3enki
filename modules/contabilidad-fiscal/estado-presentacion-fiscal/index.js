/**
 * contabilidad-fiscal/estado-presentacion-fiscal — CUSTODIO CON PERSISTENCIA (D12, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * EL CICLO DE VIDA DE CADA OBLIGACION FISCAL. UN SOLO ESCRITOR.
 *   pendiente → generada → presentada → justificada → atrasada
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Lleva el estado de cada obligacion (modelo 303, 390...). No genera el modelo (eso es
 * generador-modelo) ni recoge el acuse (eso es acuse-presentacion): aqui solo se AVANZA el
 * estado de la obligacion y se anuncia el cambio.
 *
 * Invariantes:
 *  - UN escritor por parcela (guard rol ESTADO_PRESENTACION_FISCAL; otro rol → 403).
 *  - TRANSICION VALIDA: solo se avanza por el orden del ciclo (o a 'atrasada' por plazo);
 *    una transicion que se salta el ciclo → 422 TRANSICION_INVALIDA (no se forcejea el estado).
 *  - IDEMPOTENTE: avanzar al MISMO estado → no cambia nada (se declara).
 *  - APPEND-ONLY de la historia: cada avance se apila; NADA se borra.
 *  - Dato ausente = desconocido: sin modelo/obligacion declarada se rechaza (no se inventa).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al avanzar publica `contabilidad.obligacion_avanzada`.
 *
 * R3 · la escucha de `contabilidad.modelo_exportado` (generador-modelo) y de las declaraciones
 *   justificada/rectificada (acuse-presentacion / rectificacion-declaracion) NO se declara:
 *   NINGUN emisor de esos eventos existe AUN en el repo → seria cadena colgada. Se anotara
 *   cuando sus emisores nazcan.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja D12 del plan-construccion y diseno-oop.md (CLASE EstadoPresentacionFiscal).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del ciclo de vida fiscal.
const ROL_ESCRITOR = 'ESTADO_PRESENTACION_FISCAL';

// El ciclo DECLARADO (no oculto): el orden en que avanza una obligacion.
const CICLO = ['pendiente', 'generada', 'presentada', 'justificada', 'atrasada'];

class EstadoPresentacionFiscal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estado-presentacion-fiscal';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, obligaciones: Map<clave, obligacion>, historia: [] }
    this._fiscales = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'estado-presentacion-fiscal.json',
      dir: '/contabilidad/estado-presentacion-fiscal',
      snapshot: (pid) => {
        const f = this._fiscales.get(pid);
        if (!f) return null;
        return { project_id: pid, esquema: f.esquema, obligaciones: [...f.obligaciones.values()], historia: f.historia };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const obligaciones = new Map();
        for (const o of (data.obligaciones || [])) if (o && o.clave) obligaciones.set(String(o.clave), o);
        this._fiscales.set(pid, {
          esquema: data.esquema || 'contabilidad-estado-presentacion-fiscal-v1',
          obligaciones,
          historia: Array.isArray(data.historia) ? data.historia : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el estado fiscal del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC de escritura (ORDEN → ui_handler) ──
  onAvanzarRequest(e) {
    return this._atender(e, 'avanzar', 'estado-presentacion-fiscal.avanzar.response', (d) => {
      const res = this._avanzar(d);
      if (res.status === 200 && res.data && res.data.avanzada) {
        // R2 · si AVANZA el estado, anuncia el HECHO.
        this.eventBus?.publish('contabilidad.obligacion_avanzada', {
          project_id: res.data.project_id,
          clave: res.data.obligacion.clave,
          modelo: res.data.obligacion.modelo,
          estado: res.data.obligacion.estado,
          estado_anterior: res.data.estado_anterior,
          correlation_id: d.correlation_id
        });
        // SUBE al motor de avisos si la obligacion quedo atrasada (best-effort por EVENTO).
        if (res.data.obligacion.estado === 'atrasada') {
          this.eventBus?.publish('motor-avisos.producir.request', {
            project_id: res.data.project_id,
            tipo: 'plazo',
            severidad: 'warn',
            titulo: `Obligacion atrasada: ${res.data.obligacion.modelo}`,
            detalle: `La obligacion ${res.data.obligacion.clave} esta atrasada`,
            origen: 'estado-presentacion-fiscal',
            ref: res.data.obligacion.clave,
            correlation_id: d.correlation_id
          });
        }
      } else if (res.status !== 200) {
        this.eventBus?.publish('estado-presentacion-fiscal.avanzar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _avanzar(input) → { status, data }  ·  avanza el estado de la obligacion
  // ══════════════════════════════════════════════════════════════════════
  _avanzar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol != null && input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del estado fiscal (ESTADO_PRESENTACION_FISCAL) puede avanzar obligaciones',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol });
    }

    const clave = this._clave(input);
    if (!clave) return this._invalid('obligacion|modelo');

    const estado_nuevo = input.estado != null ? String(input.estado).toLowerCase().trim() : null;
    if (!estado_nuevo || !CICLO.includes(estado_nuevo)) {
      return this._errorResponse(400, 'INVALID_INPUT',
        `estado debe ser uno del ciclo: ${CICLO.join(' → ')}`, { estado: input.estado ?? null, ciclo: CICLO });
    }

    const fiscal = this._obtenerOCrear(pid);
    const existente = fiscal.obligaciones.get(clave) || null;
    const estado_anterior = existente ? existente.estado : 'pendiente';

    // IDEMPOTENTE: avanzar al MISMO estado no cambia nada.
    if (estado_anterior === estado_nuevo) {
      return {
        status: 200,
        data: {
          project_id: pid, obligacion: existente, avanzada: false, idempotente: true,
          estado_anterior, motivo: 'la obligacion ya estaba en ese estado: no se avanza'
        }
      };
    }

    // TRANSICION VALIDA: no se salta el ciclo (una obligacion no salta de pendiente a justificada).
    const desde = CICLO.indexOf(estado_anterior);
    const hacia = CICLO.indexOf(estado_nuevo);
    // 'atrasada' es alcanzable desde cualquier estado por plazo; el resto respeta el orden.
    const es_atraso = estado_nuevo === 'atrasada';
    if (!es_atraso && hacia !== desde + 1 && !(existente == null && estado_nuevo === 'pendiente')) {
      return this._errorResponse(422, 'TRANSICION_INVALIDA',
        `no se puede saltar de '${estado_anterior}' a '${estado_nuevo}': el ciclo avanza de uno en uno (o a 'atrasada')`,
        { estado_anterior, estado_nuevo, ciclo: CICLO });
    }

    const ahora = new Date().toISOString();
    const obligacion = existente || {
      clave,
      modelo: input.modelo != null ? String(input.modelo) : clave,
      ejercicio: input.ejercicio != null ? String(input.ejercicio) : null,
      periodo: input.periodo != null ? String(input.periodo) : null,
      estado: 'pendiente',
      creada_en: ahora
    };
    obligacion.estado = estado_nuevo;
    obligacion.actualizada_en = ahora;
    if (obligacion.modelo == null && input.modelo != null) obligacion.modelo = String(input.modelo);
    fiscal.obligaciones.set(clave, obligacion);
    // APPEND-ONLY de la historia: se apila; NADA se borra.
    fiscal.historia.push({ clave, de: estado_anterior, a: estado_nuevo, en: ahora, rol: input.rol ?? null });
    fiscal.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        obligacion,
        avanzada: true,
        estado_anterior,
        estado: estado_nuevo,
        ciclo: CICLO,
        append_only: true,
        abierto: {
          modelo: obligacion.modelo ? null : 'la obligacion no declaro modelo (se anota el hueco, no se inventa)'
        }
      }
    };
  }

  _clave(input) {
    if (input.clave != null) return String(input.clave);
    if (input.obligacion != null) return String(input.obligacion);
    if (input.modelo != null) {
      const ej = input.ejercicio != null ? String(input.ejercicio) : '';
      const per = input.periodo != null ? String(input.periodo) : '';
      return `${String(input.modelo)}${ej ? '-' + ej : ''}${per ? '-' + per : ''}`;
    }
    return null;
  }

  _obtenerOCrear(pid) {
    let f = this._fiscales.get(pid);
    if (!f) {
      f = { esquema: 'contabilidad-estado-presentacion-fiscal-v1', obligaciones: new Map(), historia: [] };
      this._fiscales.set(pid, f);
      this._persist.marcarDirty(pid);
    }
    return f;
  }

  // ── Tools ──
  toolAvanzar(params) { return this._avanzar(params); }
}

module.exports = EstadoPresentacionFiscal;
