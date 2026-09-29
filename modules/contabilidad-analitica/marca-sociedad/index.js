/**
 * contabilidad-analitica/marca-sociedad — REFLEJO STATELESS (I1, hoja del plan).
 *
 * LA MARCA DE SOCIEDAD: etiqueta cada ASIENTO con la SOCIEDAD a la que pertenece. Es la BASE
 * de todo el grupo multi-sociedad: sin la marca, ni las eliminaciones intercompany (I2) ni la
 * consolidacion (I3) pueden saber que partida es de quien.
 *
 * ATRIBUTOS del diseno: `sociedad:Sociedad`. MECANICO, CERO JUICIO: el reflejo NO decide a que
 * sociedad pertenece un asiento — lo DICE el asiento (o la peticion). Aqui solo se pega la
 * etiqueta y se declara la pertenencia. Si la sociedad no viene declarada, el asiento queda
 * SIN_MARCA y `[ABIERTO]`: jamas se inventa una sociedad por defecto (una sociedad inventada
 * contamina el grupo entero y falsea la consolidacion).
 *
 * Escucha `contabilidad.asiento_registrado` (lo publica el diario/escritor-diario) fire-and-forget
 * para mantener en memoria un indice de marcas por proyecto: es lo que despues beberan I2/I3 por
 * su puerta (por EVENTO), nunca por require cruzado.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo asiento + misma sociedad → misma marca (una sola respuesta correcta).
 *  - Dato ausente = desconocido: sin sociedad declarada → `marca:null`, `sin_marca:true`,
 *    `abierto:true`. Nada se estima.
 *  - NO escribe el asiento ni lo persiste: el asiento es del diario; este reflejo solo lo ETIQUETA
 *    y recuerda la etiqueta en memoria.
 *
 * Forma: REFLEJO → STATELESS (indice en memoria, sin PosPersistencia ni onProjectActivated).
 * Ver hoja I1 del plan-construccion y diseno-oop.md (CLASE MarcaSociedad).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class MarcaSociedad extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marca-sociedad';
    this.version = 'reflejo-0.1.0';
    // Indice en memoria de marcas por proyecto: project_id → Map<id_asiento, Marca>
    this._marcas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onMarcarRequest(e) {
    return this._atender(e, 'marcar', 'marca-sociedad.marcar.response', async (d) => {
      const res = await this._marcar(d);
      if (res.status !== 200) this.eventBus?.publish('marca-sociedad.marcar.failed', res);
      return res;
    });
  }

  // ── handler fire-and-forget: el asiento registrado llega para ser etiquetado ──
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const asiento = d.asiento || d;
    const res = this._marcar({ project_id: pid, asiento, sociedad: d.sociedad });
    if (res && res.status === 200 && !res.data.sin_marca) {
      // El asiento quedo marcado: se recuerda y se declara la pertenencia.
      this.eventBus?.publish('contabilidad.sociedad_marcada', {
        project_id: pid,
        id_asiento: res.data.id_asiento,
        sociedad: res.data.marca.sociedad,
        correlation_id: d.correlation_id
      });
    }
  }

  // ── proyeccion determinista: marcar(a:Asiento) → Asiento ──
  _marcar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const asiento = input.asiento && typeof input.asiento === 'object' ? input.asiento : input;
    const id_asiento = asiento.id_asiento != null ? String(asiento.id_asiento)
      : (asiento.id != null ? String(asiento.id) : null);

    // La SOCIEDAD: dato declarado. Se acepta string, objeto, o el campo dentro del asiento.
    const sociedad = this._sociedad(input, asiento);

    // Zona de consolidacion declarada (a que perimetro pertenece). Ausente → null (no se estima).
    const zona = input.zona != null ? String(input.zona)
      : (asiento.zona != null ? String(asiento.zona) : (sociedad && sociedad.zona != null ? String(sociedad.zona) : null));
    const periodo = input.periodo != null ? String(input.periodo) : (asiento.periodo != null ? String(asiento.periodo) : null);

    // SIN SOCIEDAD DECLARADA: el asiento queda sin marcar. NO se inventa una sociedad por defecto.
    if (sociedad === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          id_asiento,
          marca: null,
          sin_marca: true,
          zona,
          periodo,
          abierto: true,
          faltan: ['sociedad'],
          motivo: 'no se marca el asiento: no hay sociedad declarada (una sociedad por defecto contaminaria el grupo)'
        }
      };
    }

    const marca = {
      sociedad,
      // El id canonico de la sociedad: su nombre/clave declarada, normalizada a string.
      sociedad_id: typeof sociedad === 'object' ? (sociedad.id ?? sociedad.nombre ?? null) : sociedad,
      zona,
      periodo,
      marcado_en: new Date().toISOString()
    };

    // Se recuerda la marca (indice en memoria, no persistencia) — lo beberan I2/I3 por evento.
    this._recordar(pid, id_asiento, marca);

    return {
      status: 200,
      data: {
        project_id: pid,
        id_asiento,
        // El asiento ETIQUETADO: se devuelve con su marca pegada. Mecanico, cero juicio.
        asiento: { ...asiento, sociedad: marca.sociedad_id, zona: marca.zona, periodo: marca.periodo },
        marca,
        sin_marca: false,
        abierto: false,
        faltan: [],
        motivo: null
      }
    };
  }

  _sociedad(input = {}, asiento = {}) {
    const s = input.sociedad != null ? input.sociedad
      : (asiento.sociedad != null ? asiento.sociedad : null);
    if (s === null || s === undefined || s === '') return null;
    if (typeof s === 'object') return { ...s };
    return String(s);
  }

  _recordar(pid, id_asiento, marca) {
    if (!id_asiento) return;
    let m = this._marcas.get(pid);
    if (!m) { m = new Map(); this._marcas.set(pid, m); }
    m.set(id_asiento, marca);
  }

  // Lectura directa del indice (mismo proceso) — no muta. Lo usa I2/I3 si comparten proceso.
  marcasDe(pid) {
    const m = pid ? this._marcas.get(pid) : null;
    return m ? [...m.values()] : [];
  }

  // ── Tools ──
  toolMarcar(params) { return this._marcar(params); }
}

module.exports = MarcaSociedad;
