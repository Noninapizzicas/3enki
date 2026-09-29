/**
 * contabilidad-libro/cambio-desde-ultima-revision — REFLEJO STATELESS (L9, hoja del plan).
 *
 * **EL DELTA DESDE EL ULTIMO VISTO BUENO. Para que el asesor revise SOLO LO NUEVO.**
 *
 * Derivado determinista: asientos nuevos, ajustes (los que rectifican) y reglas cambiadas desde
 * el ultimo visto bueno del asesor. El asesor no re-revisa el volumen entero: revisa la DIFERENCIA.
 *
 * DE DONDE SALE EL "DESDE":
 *   - `flujo-firma` (L3) POR EVENTO (`flujo-firma.estado.request`): la ultima firma del ambito da
 *     `revisado_en`. Si L3 responde que NO hay firma, se declara `sin_revision_previa:true` y
 *     entonces TODO el material esta pendiente de revision (jamas se inventa un visto bueno).
 *   - o `desde` DECLARADO en la peticion.
 *   Si ni L3 responde ni se declara `desde` → NO hay "ultima revision": el delta se declara NO
 *   DISPONIBLE (`disponible:false`, `abierto:['desde']`). Nada se estima.
 *
 * ATRIBUTOS del diseno: `firma:FlujoFirma`.
 * METODOS: `delta():Delta`.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos asientos + misma ultima revision + mismas reglas → mismo delta.
 *  - Dato ausente = desconocido: un asiento SIN fecha no se puede ordenar contra la revision → va
 *    aparte (`sin_fecha`), no se asume ni nuevo ni viejo. Sin reglas previas no hay diff de reglas.
 *  - NO escribe, NO persiste, NO muta y NO decide: el delta es un DERIVADO; revisar es del asesor.
 *  - No sustituye la revision: el sistema NO firma ni da el visto bueno (eso es de L3).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja L9 del plan-construccion y diseno-oop.md (CLASE CambioDesdeUltimaRevision).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CambioDesdeUltimaRevision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cambio-desde-ultima-revision';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onDeltaRequest(e) {
    return this._atender(e, 'delta', 'cambio-desde-ultima-revision.delta.response', async (d) => {
      const res = await this._delta(d);
      if (res.status === 200) {
        // Exito → evento de dominio: hay delta desde el ultimo visto bueno. Lo LEEN la vista
        // revisable (L2) y la capa de avisos (K2) para poner el ojo SOLO en lo nuevo.
        this.eventBus?.publish('contabilidad.delta_revision', {
          project_id: res.data.project_id,
          desde: res.data.desde,
          fuente_desde: res.data.fuente_desde,
          sin_revision_previa: res.data.sin_revision_previa,
          num_asientos_nuevos: res.data.num_asientos_nuevos,
          num_ajustes: res.data.num_ajustes,
          num_reglas_cambiadas: res.data.num_reglas_cambiadas,
          importe_delta: res.data.importe_delta,
          requiere_revision: res.data.requiere_revision,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('cambio-desde-ultima-revision.delta.failed', res);
      }
      return res;
    });
  }

  // ── SEÑALES (fire-and-forget, TOLERANTES): el libro/firma avisan de que hay material nuevo
  // desde el ultimo visto bueno. L9 es un DERIVADO BAJO DEMANDA y stateless: no acumula nada,
  // solo deja constancia en el log de que el delta quedo desactualizado.
  _senal(evento, e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this.logger?.info(`cambio-desde-ultima-revision.senal.${evento}`, {
      module: this.name,
      project_id: d.project_id,
      ambito: d.ambito !== undefined ? d.ambito : null,
      asiento: d.asiento && d.asiento.numero !== undefined ? d.asiento.numero : (d.numero !== undefined ? d.numero : null),
      correlation_id: d.correlation_id
    });
    return null;
  }

  // L3 → L9: el asesor dio su visto bueno; el "desde" del delta se mueve a esa firma.
  onFirmaRegistrada(e) { return this._senal('firma_registrada', e); }
  // B2 → L9: un asiento quedo registrado (material nuevo para el delta).
  onAsientoRegistrado(e) { return this._senal('asiento_registrado', e); }
  // B5 → L9: un ajuste entro al libro (cambio que el asesor debe ver).
  onAsientoAjusteRecibido(e) { return this._senal('asiento_ajuste_recibido', e); }

  // ══════════════════════════════════════════════════════════════════════
  // delta() → Delta (asientos nuevos + ajustes + reglas cambiadas desde el ultimo visto bueno)
  // ══════════════════════════════════════════════════════════════════════
  async _delta(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ambito = input.ambito != null ? String(input.ambito) : null;

    // 1 · El ULTIMO VISTO BUENO: declarado o pedido a flujo-firma (L3) POR EVENTO.
    const rev = await this._ultimaRevision(pid, input, ambito);

    // 2 · Los ASIENTOS: declarados, o pedidos al diario (B2) POR EVENTO.
    const asientos = await this._asientos(pid, input);

    // Sin asientos disponibles y sin revision disponible: el delta no se puede derivar.
    if (!asientos.disponible) {
      return {
        status: 200,
        data: {
          project_id: pid, ambito, tipo: 'cambio-desde-ultima-revision',
          disponible: false,
          desde: rev.desde, fuente_desde: rev.fuente_desde,
          sin_revision_previa: rev.sin_revision_previa,
          asientos_nuevos: [], ajustes: [], reglas_cambiadas: [], sin_fecha: [],
          num_asientos_nuevos: 0, num_ajustes: 0, num_reglas_cambiadas: 0,
          importe_delta: null, requiere_revision: false,
          revisar: 'solo lo nuevo (no hay material que derivar)',
          abierto: {
            asientos: 'no hay asientos declarados y escritor-diario (B2) no respondio: no se inventa el material',
            desde: rev.abierto_desde
          }
        }
      };
    }

    // 3 · El CORTE: sin "desde" conocido, el delta no se estima (solo se puede declarar que no hay
    //     revision previa, que es un HECHO declarado por L3 — no una suposicion).
    const corte = rev.sin_revision_previa ? null : rev.desde;
    if (corte === null && !rev.sin_revision_previa) {
      return {
        status: 200,
        data: {
          project_id: pid, ambito, tipo: 'cambio-desde-ultima-revision',
          disponible: false,
          desde: null, fuente_desde: rev.fuente_desde,
          sin_revision_previa: false,
          asientos_nuevos: [], ajustes: [], reglas_cambiadas: [], sin_fecha: [],
          num_asientos_nuevos: 0, num_ajustes: 0, num_reglas_cambiadas: 0,
          importe_delta: null, requiere_revision: false,
          revisar: 'solo lo nuevo (delta no derivable)',
          fuente_asientos: asientos.fuente,
          abierto: {
            desde: rev.abierto_desde || 'no hay ultimo visto bueno conocido: no se estima el delta',
            asientos: null
          }
        }
      };
    }

    const nuevos = [];
    const sin_fecha = [];
    for (const a of asientos.asientos) {
      const fecha = this._fechaDe(a);
      if (!fecha) { sin_fecha.push(this._resumen(a)); continue; }
      // Sin revision previa, TODOS los asientos estan sin revisar (hecho declarado por L3),
      // no una estimacion: el asesor revisa todo porque nunca dio el visto bueno.
      if (rev.sin_revision_previa) { nuevos.push(this._resumen(a)); continue; }
      if (fecha > corte) nuevos.push(this._resumen(a));
    }

    // 4 · Los AJUSTES son los asientos nuevos que RECTIFICAN (append-only: no borran el original).
    const ajustes = nuevos.filter((a) => a.rectifica_a !== null || String(a.tipo || '') === 'asiento-ajuste');

    // 5 · Las REGLAS CAMBIADAS: diff de dos conjuntos DECLARADOS (actuales vs las de la ultima
    //     revision). Si falta cualquiera de los dos, no hay diff: se declara [ABIERTO], no se supone.
    const reglas = this._reglasCambiadas(input);

    const importe = this._sumarImportes(nuevos);

    return {
      status: 200,
      data: {
        project_id: pid,
        ambito,
        tipo: 'cambio-desde-ultima-revision',
        disponible: true,
        // El CORTE declarado del delta: el ultimo visto bueno (o "sin revision previa").
        desde: rev.desde,
        fuente_desde: rev.fuente_desde,
        sin_revision_previa: rev.sin_revision_previa,
        fuente_asientos: asientos.fuente,
        asientos_nuevos: nuevos,
        ajustes,
        reglas_cambiadas: reglas.cambiadas,
        // Lo que no se puede ordenar contra el corte va APARTE: no se asume ni nuevo ni viejo.
        sin_fecha,
        num_asientos_nuevos: nuevos.length,
        num_ajustes: ajustes.length,
        num_reglas_cambiadas: reglas.cambiadas.length,
        importe_delta: importe,
        // El delta DICE si hay algo que revisar; no revisa ni aprueba (eso es del asesor, L3).
        requiere_revision: nuevos.length > 0 || reglas.cambiadas.length > 0,
        revisar: rev.sin_revision_previa ? 'todo (no hay revision previa declarada)' : 'solo lo nuevo',
        firma_del_sistema: false,
        revisa: 'asesor (L3 flujo-firma)',
        abierto: {
          desde: rev.desde ? null : (rev.sin_revision_previa
            ? 'no hay ultimo visto bueno: se declara sin_revision_previa (jamas se inventa una firma)'
            : rev.abierto_desde),
          reglas: reglas.abierto,
          asientos_sin_fecha: sin_fecha.length > 0
            ? `hay ${sin_fecha.length} asiento(s) sin fecha: no se pueden ordenar contra el corte y se declaran aparte (no se asumen nuevos)`
            : null
        }
      }
    };
  }

  // La ULTIMA REVISION: `desde` declarado, o la firma vigente de flujo-firma (L3) POR EVENTO.
  async _ultimaRevision(pid, input, ambito) {
    if (input.desde !== undefined && input.desde !== null && String(input.desde).trim() !== '') {
      return {
        desde: this._fecha(input.desde),
        fuente_desde: 'declarada',
        sin_revision_previa: false,
        abierto_desde: null
      };
    }

    const r = await this._rpc('flujo-firma.estado.request',
      { project_id: pid, ambito }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && (data.revisado === true || data.estado === 'FIRMADA') && data.firma) {
      return {
        desde: this._fecha(data.firma.revisado_en),
        fuente_desde: 'flujo-firma',
        sin_revision_previa: false,
        abierto_desde: this._fecha(data.firma.revisado_en) ? null : 'la firma vigente no declara revisado_en: el corte no es conocida'
      };
    }
    // L3 respondio que NO hay firma → nunca hubo visto bueno: TODOS los asientos estan sin revisar.
    if (data && (data.estado === 'SIN_SOLICITUD' || data.estado === 'PENDIENTE' || data.revisado === false)) {
      return { desde: null, fuente_desde: 'flujo-firma', sin_revision_previa: true, abierto_desde: null };
    }
    // L3 no respondio y nadie declaro `desde`: no se conoce la ultima revision. Nada se estima.
    return {
      desde: null, fuente_desde: null, sin_revision_previa: false,
      abierto_desde: 'no se declaro `desde` y flujo-firma (L3) no respondio: no se conoce el ultimo visto bueno'
    };
  }

  // Los ASIENTOS: declarados en la peticion, o pedidos al diario (B2) POR EVENTO. Best-effort.
  async _asientos(pid, input) {
    const candidatos = input.asientos != null ? input.asientos : input.libro;
    if (Array.isArray(candidatos)) return { asientos: candidatos, fuente: 'declarados', disponible: true };
    if (candidatos && typeof candidatos === 'object' && Array.isArray(candidatos.asientos)) {
      return { asientos: candidatos.asientos, fuente: 'declarados', disponible: true };
    }
    const r = await this._rpc('escritor-diario.asientos.request',
      { project_id: pid, periodo: input.periodo ?? null }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && Array.isArray(data.asientos)) {
      return { asientos: data.asientos, fuente: 'escritor-diario', disponible: true };
    }
    return { asientos: [], fuente: null, disponible: false };
  }

  // Las REGLAS CAMBIADAS: diff de dos conjuntos DECLARADOS (nunca cablea que es una "regla").
  _reglasCambiadas(input) {
    const actuales = Array.isArray(input.reglas_actuales) ? input.reglas_actuales
      : (Array.isArray(input.reglas) ? input.reglas : null);
    const previas = Array.isArray(input.reglas_previas) ? input.reglas_previas : null;
    if (!actuales || !previas) {
      return {
        cambiadas: [],
        abierto: 'no se declararon las reglas actuales Y las de la ultima revision: sin los dos conjuntos no hay diff de reglas (no se supone que cambio)'
      };
    }
    const id = (r) => (r && (r.id != null ? r.id : (r.clave != null ? r.clave : (r.nombre != null ? r.nombre : null))));
    const mapaPrevias = new Map();
    for (const r of previas) {
      const k = id(r);
      if (k !== null) mapaPrevias.set(String(k), r);
    }
    const cambiadas = [];
    for (const r of actuales) {
      const k = id(r);
      const antes = k !== null ? mapaPrevias.get(String(k)) : null;
      if (!antes) {
        cambiadas.push({ tipo_cambio: 'nueva', regla: r, anterior: null });
      } else if (JSON.stringify(antes) !== JSON.stringify(r)) {
        cambiadas.push({ tipo_cambio: 'modificada', regla: r, anterior: antes });
      }
    }
    // Las reglas que ya no estan tambien son un cambio (declarado).
    const idsActuales = new Set(actuales.map(id).filter((x) => x !== null).map(String));
    for (const r of previas) {
      const k = id(r);
      if (k !== null && !idsActuales.has(String(k))) cambiadas.push({ tipo_cambio: 'retirada', regla: null, anterior: r });
    }
    return { cambiadas, abierto: null };
  }

  _resumen(a) {
    return {
      numero: a && a.numero !== undefined ? a.numero : null,
      clave_natural: a && a.clave_natural !== undefined ? a.clave_natural : null,
      fecha: a && a.fecha !== undefined ? a.fecha : null,
      concepto: a && a.concepto !== undefined ? a.concepto : null,
      tipo: a && a.tipo !== undefined ? a.tipo : null,
      rectifica_a: a && a.rectifica_a !== undefined ? a.rectifica_a : null,
      importe: this._importe(a),
      asiento: a
    };
  }

  _sumarImportes(lista) {
    let total = null;
    for (const x of lista) {
      const v = this._num(x.importe);
      if (v === null) continue;
      total = total === null ? 0 : total;
      total += Math.abs(v);
    }
    return total === null ? null : this._round(total, 2);
  }

  // El importe del asiento: el declarado (mayor apunte) — NO se recalcula el asiento.
  _importe(a) {
    if (!a || typeof a !== 'object') return null;
    const directo = this._num(a.importe != null ? a.importe : (a.total != null ? a.total : a.suma_debe));
    if (directo !== null) return directo;
    const apuntes = Array.isArray(a.apuntes) ? a.apuntes : [];
    let max = null;
    for (const ap of apuntes) {
      const v = this._num(ap && (ap.debe != null ? ap.debe : ap.haber));
      if (v === null) continue;
      if (max === null || Math.abs(v) > Math.abs(max)) max = v;
    }
    return max;
  }

  _fechaDe(a) {
    const f = a && (a.fecha != null ? a.fecha : a.fecha_asiento);
    return this._fecha(f);
  }

  _fecha(v) {
    if (v === undefined || v === null || v === '') return null;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolDelta(params) { return this._delta(params); }
}

module.exports = CambioDesdeUltimaRevision;
