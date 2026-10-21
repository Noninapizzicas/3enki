'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const STORE_PATH = 'lotes.json';

// Contrato lotes-config-v1 — null = política por declarar (el dueño puebla).
// La MECÁNICA es genérica; estos VALORES los declara cada negocio.
const DEFAULT_CONFIG = {
  esquema: 'lotes-config-v1',
  capacidad: { unidad: 'kg', total: 250, calibracion: null },
  ventanas_por_tipo: {
    masa: { ventana_min_horas: 24, ventana_max_horas: 72 }
  },
  avisos: { al_entrar_en_ventana: true, se_agota_en_horas: 12, fuera_de_circuito: true },
  lote_parcial: { hacer_parcial_mas_2_veces: false },
  condiciones: { temperatura_objetivo_c: null }
};

const ESTADOS = { NACIDO: 'NACIDO', EN_VENTANA: 'EN_VENTANA', CONSUMIDO: 'CONSUMIDO', DESCARTADO: 'DESCARTADO' };

// State machine del lote — cada acción con sus estados de origen y su destino.
// 'madurar' es especial: materializa la maduración YA ocurrida (el lote pasa a
// EN_VENTANA en el store cuando su fecha llegó); el guard de fecha lo valida.
const ACCIONES = {
  madurar: { desde: [ESTADOS.NACIDO], a: ESTADOS.EN_VENTANA, materializa: true },
  consumir: { desde: [ESTADOS.EN_VENTANA], a: ESTADOS.CONSUMIDO },
  descartar: { desde: [ESTADOS.NACIDO, ESTADOS.EN_VENTANA], a: ESTADOS.DESCARTADO },
  reamasar_parcial: { desde: [ESTADOS.EN_VENTANA], a: ESTADOS.EN_VENTANA }
};

const round = (x, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
};

const sumarHoras = (iso, horas) => new Date(new Date(iso).getTime() + horas * 3600 * 1000).toISOString();

// =============================================================
// Validadores declarativos de la custodia — por campo del cambio,
// validan SOLO lo que viene (campos ausentes no se tocan).
// =============================================================
const VALIDADORES_CUSTODIA = {
  capacidad: (v) => {
    if (v.unidad !== undefined && (typeof v.unidad !== 'string' || !v.unidad.trim())) {
      return { field: 'capacidad.unidad', message: 'unidad debe ser string no vacío' };
    }
    if (v.total !== undefined && (typeof v.total !== 'number' || v.total <= 0)) {
      return { field: 'capacidad.total', message: 'total debe ser número > 0' };
    }
    if (v.calibracion !== undefined && v.calibracion !== null && (typeof v.calibracion !== 'number' || v.calibracion <= 0)) {
      return { field: 'capacidad.calibracion', message: 'calibracion debe ser número > 0 o null' };
    }
    return null;
  },
  ventanas_por_tipo: (v) => {
    for (const [tipo, ventana] of Object.entries(v)) {
      const min = ventana?.ventana_min_horas;
      const max = ventana?.ventana_max_horas;
      if (typeof min !== 'number' || min <= 0) {
        return { field: `ventanas_por_tipo.${tipo}.ventana_min_horas`, message: 'debe ser número > 0' };
      }
      if (typeof max !== 'number' || max <= 0) {
        return { field: `ventanas_por_tipo.${tipo}.ventana_max_horas`, message: 'debe ser número > 0' };
      }
      if (min >= max) {
        return { field: `ventanas_por_tipo.${tipo}`, message: 'ventana.min debe ser < ventana.max' };
      }
    }
    return null;
  },
  avisos: (v) => {
    if (v.se_agota_en_horas !== undefined && (typeof v.se_agota_en_horas !== 'number' || v.se_agota_en_horas <= 0)) {
      return { field: 'avisos.se_agota_en_horas', message: 'debe ser número > 0' };
    }
    for (const flag of ['al_entrar_en_ventana', 'fuera_de_circuito']) {
      if (v[flag] !== undefined && typeof v[flag] !== 'boolean') {
        return { field: `avisos.${flag}`, message: 'debe ser boolean' };
      }
    }
    return null;
  },
  lote_parcial: (v) => {
    if (v.hacer_parcial_mas_2_veces !== undefined && typeof v.hacer_parcial_mas_2_veces !== 'boolean') {
      return { field: 'lote_parcial.hacer_parcial_mas_2_veces', message: 'debe ser boolean' };
    }
    return null;
  },
  condiciones: (v) => {
    if (v.temperatura_objetivo_c !== undefined && v.temperatura_objetivo_c !== null && typeof v.temperatura_objetivo_c !== 'number') {
      return { field: 'condiciones.temperatura_objetivo_c', message: 'debe ser número o null' };
    }
    return null;
  }
};

class LotesReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lotes';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'lotes-config-v1',
      path: 'lotes-config.json',
      defaultConfig: DEFAULT_CONFIG,
      bloques: ['capacidad', 'ventanas_por_tipo', 'avisos', 'lote_parcial', 'condiciones'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'lote.config.actualizado',
      campoDatos: 'config'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch) =================
  onCrearRequest(e) { return this._atender(e, 'crear', 'lote.crear.response', d => this._crear(d)); }
  onEstadoConsultarRequest(e) { return this._atender(e, 'estado_consultar', 'lote.estado.consultar.response', d => this._estadoConsultar(d)); }
  onAvanzarRequest(e) { return this._atender(e, 'avanzar', 'lote.avanzar.response', d => this._avanzar(d)); }
  onOcupacionConsultarRequest(e) { return this._atender(e, 'ocupacion_consultar', 'lote.ocupacion.consultar.response', d => this._ocupacionConsultar(d)); }
  onVentanaConsultarRequest(e) { return this._atender(e, 'ventana_consultar', 'lote.ventana.consultar.response', d => this._ventanaConsultar(d)); }
  onConfigLeerRequest(e) { return this._atender(e, 'config_leer', 'lote.config.leer.response', d => this._configLeer(d)); }
  onConfigActualizarRequest(e) { return this._atender(e, 'config_actualizar', 'lote.config.actualizar.response', d => this._custodio.actualizar(d.project_id, d.cambios)); }

  // ================= store de lotes (lotes.json del proyecto) =================
  async _leerStore(project_id) {
    const store = await this._leerJson(project_id, STORE_PATH);
    if (store && store.esquema === 'lotes-store-v1' && store.lotes) return store;
    return { esquema: 'lotes-store-v1', lotes: {} };
  }

  async _guardarStore(project_id, store) {
    const existia = await this._leerJson(project_id, STORE_PATH);
    if (existia) {
      await this._editarJson(project_id, STORE_PATH, [{ op: 'replace', path: '', value: store }]);
    } else {
      await this._rpc('fs.write.request', { project_id, path: STORE_PATH, content: JSON.stringify(store, null, 2) });
    }
  }

  // Ocupación sumada de los lotes vivos (todo lo que aún ocupa el frigo).
  async _ocupacionVivaTotal(project_id) {
    const store = await this._leerStore(project_id);
    return Object.values(store.lotes)
      .filter(l => l.estado !== ESTADOS.CONSUMIDO && l.estado !== ESTADOS.DESCARTADO)
      .reduce((s, l) => s + (typeof l.ocupacion === 'number' ? l.ocupacion : 0), 0);
  }

  // Estado EFECTIVO: un lote NACIDO cuya maduración ya pasó está EN_VENTANA.
  _estadoEfectivo(lote, ahoraTs) {
    if (lote.estado !== ESTADOS.NACIDO) return lote.estado;
    const maduracion = lote.maduracion_iso ? new Date(lote.maduracion_iso).getTime() : null;
    if (maduracion !== null && ahoraTs >= maduracion) return ESTADOS.EN_VENTANA;
    return ESTADOS.NACIDO;
  }

  // Proyección pública del lote (estado efectivo + tiempo restante de ventana).
  _proyeccionLote(lote, ahoraTs) {
    const efectivo = this._estadoEfectivo(lote, ahoraTs);
    const fin = lote.fin_ventana_iso ? new Date(lote.fin_ventana_iso).getTime() : null;
    return {
      id: lote.id,
      tipo: lote.tipo,
      cantidad: lote.cantidad,
      unidad: lote.unidad,
      ocupacion: lote.ocupacion,
      estado: efectivo,
      parciales: lote.parciales,
      nacido_iso: lote.nacido_iso,
      maduracion_iso: lote.maduracion_iso,
      fin_ventana_iso: lote.fin_ventana_iso,
      en_ventana: efectivo === ESTADOS.EN_VENTANA,
      tiempo_restante_horas: fin ? round((fin - ahoraTs) / 3600000) : null
    };
  }

  // ================= proyecciones =================
  async _crear(input) {
    const error = validarSchema({
      tipo: { tipo: 'string', requerido: true },
      cantidad: { tipo: 'number', min: 0, exclusivo: true, requerido: true },
      unidad: { tipo: 'string', requerido: true },
      ocupacion: { tipo: 'number', min: 0 },
      nacido_iso: { tipo: 'string' },
      nota: { tipo: 'string' }
    }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };

    const { config } = await this._custodio.leer(input.project_id);
    const ventana = config.ventanas_por_tipo?.[input.tipo];
    if (!ventana) {
      return {
        status: 400, error: 'INVALID_INPUT',
        message: `tipo '${input.tipo}' sin ventana declarada: declárala en lotes-config (ventanas_por_tipo)`,
        field: 'tipo'
      };
    }

    // Capacidad: si el lote declara ocupación, comprobar que cabe.
    if (typeof input.ocupacion === 'number') {
      const ocupacionActual = await this._ocupacionVivaTotal(input.project_id);
      if (ocupacionActual + input.ocupacion > config.capacidad.total) {
        return {
          status: 409, error: 'CONFLICT_STATE',
          message: `no cabe: ocupación actual ${round(ocupacionActual)} + ${input.ocupacion} > capacidad ${config.capacidad.total}`,
          field: 'ocupacion'
        };
      }
    }

    const nacido = input.nacido_iso || new Date().toISOString();
    const ahoraTs = Date.now();
    const lote = {
      id: `lote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tipo: input.tipo,
      cantidad: input.cantidad,
      unidad: input.unidad,
      ocupacion: typeof input.ocupacion === 'number' ? input.ocupacion : null,
      estado: ESTADOS.NACIDO,
      nacido_iso: nacido,
      maduracion_iso: sumarHoras(nacido, ventana.ventana_min_horas),
      fin_ventana_iso: sumarHoras(nacido, ventana.ventana_max_horas),
      parciales: 0,
      historial: [{ ts: nacido, evento: 'creado', detalle: `lote de ${input.tipo} (${input.cantidad} ${input.unidad})` }]
    };
    if (input.nota) lote.nota = input.nota;

    const store = await this._leerStore(input.project_id);
    store.lotes[lote.id] = lote;
    await this._guardarStore(input.project_id, store);

    const proyeccion = this._proyeccionLote(lote, ahoraTs);
    this.eventBus?.publish('lote.creado', { project_id: input.project_id, lote: proyeccion });
    return { status: 200, data: { lote: proyeccion } };
  }

  async _estadoConsultar(input) {
    const error = validarSchema({ lote_id: { tipo: 'string', requerido: true } }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };

    const store = await this._leerStore(input.project_id);
    const lote = store.lotes[input.lote_id];
    if (!lote) {
      return { status: 404, error: 'RESOURCE_NOT_FOUND', message: `lote '${input.lote_id}' no encontrado`, field: 'lote_id' };
    }
    return { status: 200, data: { lote: this._proyeccionLote(lote, Date.now()) } };
  }

  async _avanzar(input) {
    const error = validarSchema({
      lote_id: { tipo: 'string', requerido: true },
      accion: { tipo: 'string', requerido: true },
      motivo: { tipo: 'string' }
    }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };

    const accion = ACCIONES[input.accion];
    if (!accion) {
      return {
        status: 400, error: 'INVALID_INPUT',
        message: `acción '${input.accion}' desconocida (madurar | consumir | descartar | reamasar_parcial)`,
        field: 'accion'
      };
    }

    const store = await this._leerStore(input.project_id);
    const lote = store.lotes[input.lote_id];
    if (!lote) {
      return { status: 404, error: 'RESOURCE_NOT_FOUND', message: `lote '${input.lote_id}' no encontrado`, field: 'lote_id' };
    }

    const ahoraTs = Date.now();
    const estadoPersistido = lote.estado;
    const estadoActual = this._estadoEfectivo(lote, ahoraTs);

    // 'madurar' materializa la maduración ya ocurrida: guard sobre el estado
    // persistido (debe estar NACIDO) + la fecha debe haber llegado.
    if (accion.materializa) {
      if (!accion.desde.includes(estadoPersistido)) {
        return {
          status: 409, error: 'CONFLICT_STATE',
          message: `no se puede '${input.accion}' desde estado ${estadoActual}`,
          field: 'accion'
        };
      }
      if (estadoActual !== ESTADOS.EN_VENTANA) {
        return {
          status: 409, error: 'CONFLICT_STATE',
          message: `el lote aún madura: maduración en ${lote.maduracion_iso}`,
          field: 'accion'
        };
      }
    } else if (!accion.desde.includes(estadoActual)) {
      return {
        status: 409, error: 'CONFLICT_STATE',
        message: `no se puede '${input.accion}' desde estado ${estadoActual}`,
        field: 'accion'
      };
    }

    if (input.accion === 'reamasar_parcial') {
      const { config } = await this._custodio.leer(input.project_id);
      const limite = config.lote_parcial?.hacer_parcial_mas_2_veces ? 2 : 1;
      if (lote.parciales >= limite) {
        return {
          status: 409, error: 'CONFLICT_STATE',
          message: `política lotes-config: máximo ${limite} reamasado(s) parcial(es) por lote`,
          field: 'accion'
        };
      }
      const ventana = config.ventanas_por_tipo?.[lote.tipo];
      if (!ventana) {
        return {
          status: 400, error: 'INVALID_INPUT',
          message: `tipo '${lote.tipo}' sin ventana declarada en lotes-config`,
          field: 'tipo'
        };
      }
      // EN_VENTANA → EN_VENTANA: el lote sigue vivo, la ventana se recalcula desde ahora.
      const ahoraIso = new Date(ahoraTs).toISOString();
      lote.maduracion_iso = sumarHoras(ahoraIso, ventana.ventana_min_horas);
      lote.fin_ventana_iso = sumarHoras(ahoraIso, ventana.ventana_max_horas);
      lote.parciales += 1;
      lote.estado = ESTADOS.EN_VENTANA;
      lote.historial.push({ ts: ahoraIso, evento: 'reamasado_parcial', detalle: input.motivo || 'sobrante reamasado; ventana recalculada' });
    } else {
      lote.estado = accion.a;
      lote.historial.push({ ts: new Date(ahoraTs).toISOString(), evento: input.accion, detalle: input.motivo || null });
    }

    await this._guardarStore(input.project_id, store);

    const proyeccion = this._proyeccionLote(lote, Date.now());
    this.eventBus?.publish('lote.estado.avanzado', {
      project_id: input.project_id,
      lote_id: lote.id,
      accion: input.accion,
      estado_anterior: accion.materializa ? estadoPersistido : estadoActual,
      estado_nuevo: proyeccion.estado,
      lote: proyeccion
    });
    return { status: 200, data: { lote: proyeccion } };
  }

  async _ocupacionConsultar(input) {
    const { config } = await this._custodio.leer(input?.project_id);
    const store = await this._leerStore(input?.project_id);
    const vivos = Object.values(store.lotes)
      .filter(l => l.estado !== ESTADOS.CONSUMIDO && l.estado !== ESTADOS.DESCARTADO);
    const ocupacionTotal = vivos.reduce((s, l) => s + (typeof l.ocupacion === 'number' ? l.ocupacion : 0), 0);
    const total = config.capacidad.total;
    return {
      status: 200,
      data: {
        ocupacion_total: round(ocupacionTotal),
        capacidad_total: total,
        unidad: config.capacidad.unidad,
        disponible: round(Math.max(0, total - ocupacionTotal)),
        lotes_vivos: vivos.length,
        pct_ocupacion: round(total > 0 ? ocupacionTotal * 100 / total : 0)
      }
    };
  }

  async _ventanaConsultar(input) {
    const { config } = await this._custodio.leer(input?.project_id);
    if (input?.tipo) {
      const ventana = config.ventanas_por_tipo?.[input.tipo] || null;
      return {
        status: 200,
        data: {
          tipo: input.tipo,
          ventana: ventana ? { ...ventana } : null,
          nota: ventana ? null : `tipo '${input.tipo}' sin ventana declarada en lotes-config`
        }
      };
    }
    return { status: 200, data: { ventanas_por_tipo: config.ventanas_por_tipo || {} } };
  }

  async _configLeer(input) {
    const { config, fuente } = await this._custodio.leer(input?.project_id);
    return { status: 200, data: { config, fuente } };
  }
}

module.exports = LotesReflejo;
