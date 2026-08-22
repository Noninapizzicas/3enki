'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { ConfigCustodio, validarSchema } = require('../_shared/config-custodio');

const CALENDARIO_PATH = 'calendario.json';

// Contrato calendario-v1 — null = política por declarar.
const DEFAULT_CALENDARIO = {
  esquema: 'calendario-v1',
  productos: {}
};

// Días de la semana en ISO 8601: 1=Lunes ... 7=Domingo.
const NOMBRE_DIA = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };
const VALID_DIAS = [1, 2, 3, 4, 5, 6, 7];

// =============================================================
// Utilidades de calendario (conversor puro)
// =============================================================
const _diaSemanaISO = (d) => {
  const fecha = new Date(d);
  const iso = fecha.getDay(); // 0=Dom..6=Sáb
  return iso === 0 ? 7 : iso; // 1=Lun..7=Dom
};

const _aISO = (fecha) => fecha.toISOString().slice(0, 10);

const _siguienteDiaEn = (calendario, desdeISO) => {
  // Dado un producto, el próximo día de salida >= desdeISO.
  const dias = calendario.dias_salida || [];
  if (!dias.length) return null;
  const desde = new Date(`${desdeISO}T00:00:00Z`);
  for (let i = 0; i < 15; i++) {
    const candidato = new Date(desde);
    candidato.setUTCDate(candidato.getUTCDate() + i);
    const isoDia = _diasSemanaISO(candidato);
    if (dias.includes(isoDia)) return _normalISO(candidato);
  }
  return null;
};

const _normalISO = (d) => d.toISOString().slice(0, 10);
const _diaISO = (d) => d.toISOString().slice(0, 10);
const _diasSemanaISO = (d) => { const iso = d.getUTCDay(); return iso === 0 ? 7 : iso; };

// Comprueba el margen: cuántas horas hay entre ahora y la fecha deseada (fecha completa al inicio del día).
const _horasHasta = (fechaISO, ahoraISO) => {
  const t = new Date(fechaISO + 'T00:00:00Z').getTime();
  const a = new Date(ahoraISO).getTime();
  return (t - a) / 3600000;
};

// ===========================================================
// Validadores de custodia — por campo del cambio, validan SOLO lo que viene.
// ===========================================================
const VALIDADORES_CUSTODIA = {
  productos: (v) => {
    if (typeof v !== 'object' || Array.isArray(v)) return { field: 'productos', message: 'debe ser objeto {producto_id: {dias_salida, margen_antelacion_h}}' };
    for (const [id, cal] of Object.entries(v)) {
      if (typeof cal !== 'object') return { field: `productos.${id}`, message: 'debe ser objeto' };
      if (cal.dias_salida !== undefined) {
        if (!Array.isArray(cal.dias_salida) || !cal.dias_salida.length ||
            cal.dias_salida.some(x => !VAL_DIAS.includes(x))) {
          return { field: `productos.${id}.dias_salida`, message: 'debe ser array de días ISO 1..7 (1=Lun..7=Dom)' };
        }
      }
      if (cal.margen_antelacion_h !== undefined &&
          (typeof cal.margen_antelacion_h !== 'number' || cal.margen_antelacion_h < 0)) {
        return { field: `productos.${id}.margen_antelacion_h`, message: 'debe ser número ≥ 0 horas' };
      }
    }
    return null;
  }
};

// ===========================================================
// Tabla FORMULAS — conversores puros del módulo.
// ===========================================================
const validarPedido = (reglas, input) => {
  const cal = (reglas.productos || {})[input.producto_id];
  if (!cal) {
    return { status: 404, error: 'RESOURCE_NOT_FOUND', message: `sin calendario para ${input.producto_id}`, field: 'producto_id' };
  }
  const ahora = input.ahora ? new Date(input.ahora) : new Date();
  const fechaISO = input.fecha_deseada ? input.fecha_deseada.slice(0, 10) : _diaISO(new Date());
  const diaSolicitado = _diasSemanaISO(new Date(`${fechaISO}T00:00:00Z`));
  const dias = cal.dias_salida || [];
  const esDiaSalida = dias.includes(diaSolicitado);
  const margen_h = typeof cal.margen_antelacion_h === 'number' ? cal.margen_antelacion_h : 0;
  const horasHasta = _horasHasta(fechaISO, ahora.toISOString());
  const margenCumplido = horasHasta >= margen_horas;

  if (esDiaSalida && margenCumplido) {
    return {
      status: 200,
      data: {
        producto_id: input.producto_id,
        fecha_deseada: fechaISO,
        dia_semana: NOMBRE_DIA[diaSolicitado],
        valido: true,
        motivo: null
      }
    };
  }

  // No cuadra — proponer el día válido más cercano que cumpla margen.
  const propuesta = _siguienteDia({ dias_salida: dias }, _diaISO(ahora));
  // la propuesta debe respetar el margen: partir de mañana es lo más pronto posible
  // (un encargo hoy para mañana si está en salida y margen lo permite se cubre arriba).
  const motivo = [];
  if (!esDiaSalida) motivo.push(`no sale en ${NOMBRE_DIA[diaSolicitado]}`);
  if (!margenCumplido) motivo.push('margen de antelación no cumplido');
  return {
    status: 200,
    data: {
      producto_id: input.producto_id,
      fecha_deseada: fechaISO,
      dia_semanal: NOMBRE_DIA[diaSolicitado],
      valido: false,
      motivo: motivo.join(' · '),
      propuesta: { fecha: propuesta, dia: propuesta ? NOMBRE_DIA[_diasSemanaISO(new Date(propuesta + 'T00:00:00Z'))] : null }
    }
  };
};

const FORMULAS = {
  margen_leer: {
    descripcion: 'Antelación mínima (horas) de un producto para encargar.',
    schema: { producto_id: { tipo: 'string', requerido: true } },
    fn: (reglas, input) => {
      const cal = (reglas.productos || {})[input.producto_id];
      return {
        status: 200,
        data: {
          producto_id: input.producto_id,
          margen_antelacion_h: cal ? (cal.margen_antelacion_h ?? null) : null,
          dias_salida: cal ? (cal.dias_salida || []) : []
        }
      };
    }
  }
};

class CalendarioReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'calendario';
    this.version = 'reflejo-0.1.0';
    this._custodio = ConfigCustodio.crear(this, {
      esquema: 'calendario-v1',
      path: CALENDARIO_PATH,
      defaultConfig: DEFAULT_CALENDARIO,
      bloques: ['productos'],
      validadores: VALIDADORES_CUSTODIA,
      evento: 'calendario.producto.actualizado',
      campoDatos: 'calendario'
    });
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onProductoLeerRequest(e) { return this._atender(e, 'producto_leer', 'calendario.producto.leer.response', d => this._productoLeer(d)); }
  onProductosLeerRequest(e) { return this._atender(e, 'productos_leer', 'calendario.productos.leer.response', d => this._productosLeer(d)); }
  onProductoActualizarRequest(e) { return this._atender(e, 'producto_actualizar', 'calendario.producto.actualizar.response', d => this._productoActualizar(d)); }
  onValidarRequest(e) { return this._atender(e, 'validar', 'calendario.validar.response', d => this._validar(d)); }
  onMargenLeerRequest(e) { return this._atender(e, 'margen_leer', 'calendario.margen.leer.response', d => this._margen(d)); }

  // ================= proyecciones =================
  async _productoLeer(input) {
    const { config } = await this._custodio.leer(input?.project_id);
    const cal = (config.productos || {})[input.producto_id];
    if (!cal) return { status: 404, error: 'RESOURCE_NOT_FOUND', message: `sin calendario para ${input.producto_id}`, field: 'producto_id' };
    return { status: 200, data: { producto_id: input.producto_id, calendario: cal } };
  }

  async _productosLeer(input) {
    const { config } = await this._custodio.leer(input?.project_id);
    return { status: 200, data: { calendarios: config.productos || {} } };
  }

  async _productoActualizar(input) {
    const { producto_id, cambios } = input || {};
    if (!producto_id) return { status: 400, error: 'INVALID_INPUT', message: 'producto_id requerido', field: 'producto_id' };
    if (!cambios || typeof cambios !== 'object') return { status: 400, error: 'INVALID_INPUT', message: 'cambios requerido', field: 'cambios' };
    // Merge profundo en productos.<id>
    const patch = { productos: { [producto_id]: cambios } };
    return this._custodio.actualizar(input.project_id, patch);
  }

  async _validar(input) {
    const error = validarSchema({ producto_id: { tipo: 'string', requerido: true } }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    const { config } = await this._custodio.leer(input?.project_id);
    return FORMULAS.validar ? FORMULAS.validar(config, input) : { status: 500, error: 'UNKNOWN_ERROR', message: 'formula validar no registrada' };
  }

  async _margen(input) {
    const error = validarSchema({ producto_id: { tipo: 'string', requerido: true } }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    const { config } = await this._custodio.leer(input?.project_id);
    return FORMULOS.producto_leer(config, input);
  }
}

module.exports = CalendarioRef;