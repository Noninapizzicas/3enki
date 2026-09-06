/**
 * horarios_casa — HORARIOS DE CASA (PASO 10 del plan-construccion).
 *
 * Contrato: configuración de ventanas de impresión POR PERSONA (4 perfiles en
 * casa, cada uno con su ritmo). El orquestador consulta ventana_activa antes de
 * proponer/arrancar una impresión: solo imprime dentro de la ventana de quien
 * pidió la pieza, para que termine cuando hay alguien para supervisarla o
 * recogerla (PRESENCIA — gemelo del estimador_tiempo).
 *
 * FORMA: REFLEJO + PosPersistencia por proyecto (patrón custodio, gemelo de
 * cupula_stl). Store: /impresion-3d/horarios/horarios.json (single-writer).
 *
 * Invariantes:
 *   - persona_id ∈ {papa, mama, hijo1, hijo2} (4 perfiles de casa).
 *   - ventana válida: dias ⊆ {LUN..DOM} no vacío, desde < hasta (HH:MM).
 *   - configurar/obtener/listar/ventana_activa son las únicas puertas.
 *   - la base nace simple y se AFINA CON LA EXPERIENCIA (prioridad, choques,
 *     límites por persona) sin cambiar el contrato de ventanas.
 *
 * v0.1.0 (primera pasada del plan-construccion): la base de horarios por persona.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const PERSONAS = Object.freeze(['papa', 'mama', 'hijo1', 'hijo2']);
const DIAS = Object.freeze(['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM']);
const nowISO = () => new Date().toISOString();
const _key = (pid, persona) => `${pid}:${persona}`;

// Convierte "HH:MM" a minutos desde medianoche. null si no es válido.
function _aMinutos(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Valida una ventana { dias:[...], desde, hasta }. Devuelve error o null.
function _validarVentana(v) {
  if (!v || typeof v !== 'object') return 'ventana_debe_ser_objeto';
  if (!Array.isArray(v.dias) || v.dias.length === 0) return 'dias_obligatorio';
  for (const d of v.dias) if (!DIAS.includes(d)) return 'dia_invalido';
  const desde = _aMinutos(v.desde);
  const hasta = _aMinutos(v.hasta);
  if (desde === null) return 'desde_invalido';
  if (hasta === null) return 'hasta_invalido';
  if (hasta <= desde) return 'hasta_debe_ser_mayor_que_desde';
  return null;
}

class HorariosCasaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'horarios_casa';
    this.version = 'reflejo-0.1.0';
    this.horarios = new Map(); // `${project_id}:${persona}` → { persona_id, ventanas }

    this._persist = new PosPersistencia({
      modulo: this, file: 'horarios.json', dir: '/impresion-3d/horarios',
      snapshot: (pid) => {
        const suyos = (m) => [...m.values()].filter(h => h.project_id === pid);
        return { project_id: pid, horarios: suyos(this.horarios) };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        for (const h of (data.horarios || [])) this.horarios.set(_key(pid, h.persona_id), h);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onConfigurarHorarioRequest(e) { return this._atender(e, 'configurar_horario', 'horarios_casa.configurar_horario.response', d => this._configurarHorario(d)); }
  onObtenerHorarioRequest(e)    { return this._atender(e, 'obtener_horario', 'horarios_casa.obtener_horario.response', d => this._obtenerHorario(d)); }
  onListarHorariosRequest(e)    { return this._atender(e, 'listar_horarios', 'horarios_casa.listar_horarios.response', d => this._listarHorarios(d)); }
  onVentanaActivaRequest(e)     { return this._atender(e, 'ventana_activa', 'horarios_casa.ventana_activa.response', d => this._ventanaActiva(d)); }

  // ── PROYECCIONES (dominio) ──

  // _configurarHorario: fija (o reemplaza) las ventanas de una persona.
  async _configurarHorario(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!PERSONAS.includes(input.persona_id)) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', 'persona_invalida', { persona_id: input.persona_id, permitidas: PERSONAS });
    if (!Array.isArray(input.ventanas) || input.ventanas.length === 0) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', 'ventanas_obligatorio', { hint: 'al menos una ventana { dias, desde, hasta }' });

    for (const v of input.ventanas) {
      const err = _validarVentana(v);
      if (err) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', err, { hint: 'ventana = { dias:[LUN..DOM], desde:"HH:MM", hasta:"HH:MM" }' });
    }

    const horario = {
      project_id: input.project_id,
      persona_id: input.persona_id,
      ventanas: input.ventanas.map(v => ({ dias: [...v.dias], desde: v.desde, hasta: v.hasta })),
      actualizado: nowISO()
    };
    this.horarios.set(_key(input.project_id, input.persona_id), horario);
    await this._guardar(input.project_id);

    this._publicarEvento('horarios_casa.horario_actualizado', { project_id: input.project_id, persona_id: input.persona_id, ventanas: horario.ventanas });
    return { status: 200, data: { horario } };
  }

  // _obtenerHorario: devuelve las ventanas de una persona.
  async _obtenerHorario(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!PERSONAS.includes(input.persona_id)) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', 'persona_invalida', { persona_id: input.persona_id });

    const h = this.horarios.get(_key(input.project_id, input.persona_id));
    if (!h) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'horario_no_configurado', { persona_id: input.persona_id });
    return { status: 200, data: { horario: h } };
  }

  // _listarHorarios: lista los horarios configurados del proyecto.
  async _listarHorarios(input) {
    if (!input.project_id) return this._invalid('project_id');
    const lista = [...this.horarios.values()].filter(h => h.project_id === input.project_id);
    return { status: 200, data: { horarios: lista, total: lista.length } };
  }

  // _ventanaActiva: ¿está la persona dentro de una ventana en el instante dado?
  // ahora: ISO string o timestamp. Si no se pasa, usa el reloj real.
  async _ventanaActiva(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!PERSONAS.includes(input.persona_id)) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', 'persona_invalida', { persona_id: input.persona_id });

    const h = this.horarios.get(_key(input.project_id, input.persona_id));
    if (!h) return { status: 200, data: { activa: false, motivo: 'sin_horario_configurado', persona_id: input.persona_id } };

    const ahora = input.ahora ? new Date(input.ahora) : new Date();
    if (isNaN(ahora.getTime())) return this._errorResponse(422, 'PARAMETROS_INVALIDOS', 'ahora_invalido', { hint: 'ISO string o timestamp' });

    const dia = DIAS[ahora.getUTCDay() === 0 ? 6 : ahora.getUTCDay() - 1]; // DOM=0 → index 6
    const min = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();

    const ventana = h.ventanas.find(v => v.dias.includes(dia) && _aMinutos(v.desde) <= min && min < _aMinutos(v.hasta));
    return { status: 200, data: { activa: !!ventana, ventana: ventana || null, persona_id: input.persona_id, dia, minuto: min } };
  }

  // ── store (single-writer, por proyecto) ──
  async _guardar(project_id) {
    this._persist.marcarDirty(project_id);
  }

  _publicarEvento(evento, payload) {
    try { this.eventBus?.publish(evento, payload); } catch (_) { /* best-effort */ }
  }
}

module.exports = HorariosCasaReflejo;
module.exports.PERSONAS = PERSONAS;
module.exports.DIAS = DIAS;
module.exports._validarVentana = _validarVentana;
