/**
 * prisma/calendario — REFLEJO JS: la BASE COMPARTIDA del tiempo (órgano `agenda`).
 *
 * Dos capas: DISPONIBILIDAD (la oferta de tiempo — privada del comerciante, onboarding
 * como el coste) + RESERVAS (el consumo — el POS del tiempo). El motor de huecos es
 * NUESTRO (aritmética determinista): hueco = capacidad − reservas_solapadas, y una
 * reserva solo entra si cae en disponibilidad con hueco>0.
 *
 * Un motor, dos granos: cita (minutos · de_ida · fin fijo) e intervalo (días · con_retorno
 * · fin abierto → devolver lo cierra). Product-AGNÓSTICO: la duración y el recurso los
 * aporta el CONSUMIDOR (agenda-citas/alquiler), no el calendario — igual que carta-manager
 * no conoce recetas. Base compartida: los consumidores beben por RPC.
 *
 * v0.1 determinista, sin deps. Los bordes iCal (feed .ics + import CalDAV) y el tz/DST
 * correcto (luxon) son v0.2. Aquí las horas son reloj de pared naïve (comparadas de forma
 * determinista vía Date.UTC de los componentes, sin deriva de zona). Ver
 * arquitectura/decisiones/propuestas/calendario.md.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];   // getUTCDay(): 0=domingo · L,M(artes),X(miércoles),J,V,S
const ESTADO_ACTIVO = new Set(['confirmada', 'cumplida']);   // ocupan hueco; cancelada/devuelta/no_show liberan

const HORARIO_DEFECTO = { L: [['09:00', '14:00'], ['16:00', '20:00']], M: [['09:00', '14:00'], ['16:00', '20:00']], X: [['09:00', '14:00'], ['16:00', '20:00']], J: [['09:00', '14:00'], ['16:00', '20:00']], V: [['09:00', '14:00'], ['16:00', '20:00']], S: [], D: [] };

class PrismaCalendarioReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'calendario';
    this.version = 'reflejo-0.1.0';
    this.dispPorProyecto = new Map();   // project_id → Disponibilidad
    this.resPorProyecto = new Map();    // project_id → Array<Reserva>
    this._persist = new PosPersistencia({
      modulo: this, file: 'estado.json', dir: '/prisma/calendario',
      snapshot: (pid) => ({ disponibilidad: this.dispPorProyecto.get(pid) || null, reservas: this.resPorProyecto.get(pid) || [] }),
      hidratar: (pid, data) => { if (data.disponibilidad) this.dispPorProyecto.set(pid, data.disponibilidad); if (Array.isArray(data.reservas)) this.resPorProyecto.set(pid, data.reservas); }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }
  onProjectActivated(e) { const d = (e && (e.data || e)) || {}; return this._persist.restaurar(d.project_id); }

  // ── DISPONIBILIDAD ──
  onGetDisponibilidadRequest(e) { return this._atender(e, 'get_disponibilidad', 'calendario.get_disponibilidad.response', d => this._getDisp(d)); }
  onSetDisponibilidadRequest(e) { return this._atender(e, 'set_disponibilidad', 'calendario.set_disponibilidad.response', d => this._setDisp(d)); }
  onBloquearDiaRequest(e)       { return this._atender(e, 'bloquear_dia', 'calendario.bloquear_dia.response', d => this._bloquearDia(d)); }
  // ── HUECOS ──
  onHuecosRequest(e)            { return this._atender(e, 'huecos', 'calendario.huecos.response', d => this._huecosOp(d)); }
  // ── RESERVAS ──
  onReservarRequest(e)          { return this._atender(e, 'reservar', 'calendario.reservar.response', d => this._reservar(d)); }
  onCancelarRequest(e)          { return this._atender(e, 'cancelar', 'calendario.cancelar.response', d => this._cancelar(d)); }
  onDevolverRequest(e)          { return this._atender(e, 'devolver', 'calendario.devolver.response', d => this._devolver(d)); }
  onListReservasRequest(e)      { return this._atender(e, 'list_reservas', 'calendario.list_reservas.response', d => this._listReservas(d)); }

  // ============================================================= helpers de estado
  _disp(project_id) {
    let d = this.dispPorProyecto.get(project_id);
    if (!d) { d = { recurso_tipos: [{ id: 'general', etiqueta: 'General', capacidad: 1 }], horario: HORARIO_DEFECTO, excepciones: [], tz: 'Europe/Madrid' }; this.dispPorProyecto.set(project_id, d); }
    return d;
  }
  _reservas(project_id) {
    let r = this.resPorProyecto.get(project_id);
    if (!r) { r = []; this.resPorProyecto.set(project_id, r); }
    return r;
  }
  _capacidad(disp, recurso_tipo) {
    const t = (disp.recurso_tipos || []).find(x => x.id === recurso_tipo);
    return t ? Math.max(0, Math.floor(t.capacidad || 0)) : 0;
  }

  // ============================================================= aritmética PURA de tiempo
  // reloj de pared naïve → minutos comparables sin deriva de zona (Date.UTC de los componentes).
  _min(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso || ''));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000;
  }
  _fecha(iso) { return String(iso).slice(0, 10); }
  _dow(dateStr) { const [y, mo, d] = dateStr.split('-').map(Number); return DOW[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]; }
  _sumaDia(dateStr, n) { const [y, mo, d] = dateStr.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1, d + n)); return t.toISOString().slice(0, 10); }
  _solapa(aIni, aFin, bIni, bFin) { const AF = (aFin == null) ? Infinity : aFin; const BF = (bFin == null) ? Infinity : bFin; return aIni < BF && bIni < AF; }

  _diaCerrado(disp, dateStr) {
    for (const ex of (disp.excepciones || [])) {
      if (ex.abierto === false) {
        if (ex.fecha && ex.fecha === dateStr) return true;
        if (ex.desde && ex.hasta && dateStr >= ex.desde && dateStr <= ex.hasta) return true;
      }
    }
    return false;
  }

  // ventanas abiertas [min,min) dentro de [desde,hasta], aplicando horario por día − excepciones cerradas.
  _ventanasAbiertas(disp, desde, hasta) {
    const out = [];
    let dia = this._fecha(desde);
    const finFecha = this._fecha(hasta);
    let guard = 0;
    while (dia <= finFecha && guard++ < 800) {
      if (!this._diaCerrado(disp, dia)) {
        for (const [ini, fin] of (disp.horario && disp.horario[this._dow(dia)] || [])) {
          const vIni = this._min(`${dia}T${ini}`), vFin = this._min(`${dia}T${fin}`);
          out.push({ dia, ini: vIni, fin: vFin });
        }
      }
      dia = this._sumaDia(dia, 1);
    }
    // recorta a [desde,hasta]
    const dMin = this._min(desde), hMin = this._min(hasta);
    return out.map(v => ({ dia: v.dia, ini: Math.max(v.ini, dMin), fin: Math.min(v.fin, hMin) })).filter(v => v.ini < v.fin);
  }

  _dentroDeVentana(disp, tMin, desde, hasta) {
    return this._ventanasAbiertas(disp, desde, hasta).some(v => tMin >= v.ini && tMin < v.fin);
  }

  // ¿hay hueco para [inicio,fin) de este tipo? cita exige estar en horario; intervalo solo capacidad.
  _hayHueco(disp, reservas, { recurso_tipo, inicio, fin, grano }) {
    const cap = this._capacidad(disp, recurso_tipo);
    if (cap <= 0) return { ok: false, code: 'RECURSO_DESCONOCIDO', libres: 0 };
    const iMin = this._min(inicio), fMin = (fin == null) ? null : this._min(fin);
    if (grano !== 'intervalo') {
      // cita: el inicio debe caer en una ventana abierta del día
      if (!this._dentroDeVentana(disp, iMin, inicio, fin || inicio)) return { ok: false, code: 'FUERA_DE_HORARIO', libres: 0 };
    }
    const ocupadas = reservas.filter(r => r.recurso_tipo === recurso_tipo && ESTADO_ACTIVO.has(r.estado) && this._solapa(iMin, fMin, this._min(r.inicio), r.fin == null ? null : this._min(r.fin))).length;
    const libres = cap - ocupadas;
    return libres > 0 ? { ok: true, libres } : { ok: false, code: 'SIN_HUECO', libres: 0 };
  }

  // huecos de citas de `duracion_min` en [desde,hasta] (troceo back-to-back por ventana).
  _huecos(disp, reservas, { recurso_tipo, desde, hasta, duracion_min }) {
    const cap = this._capacidad(disp, recurso_tipo);
    if (cap <= 0) return [];
    const dur = Math.max(1, Math.floor(duracion_min || 30));
    const activas = reservas.filter(r => r.recurso_tipo === recurso_tipo && ESTADO_ACTIVO.has(r.estado));
    const huecos = [];
    for (const v of this._ventanasAbiertas(disp, desde, hasta)) {
      for (let s = v.ini; s + dur <= v.fin; s += dur) {
        const e = s + dur;
        const ocupadas = activas.filter(r => this._solapa(s, e, this._min(r.inicio), r.fin == null ? null : this._min(r.fin))).length;
        const libres = cap - ocupadas;
        if (libres > 0) huecos.push({ inicio: this._isoDe(s), fin: this._isoDe(e), libres });
      }
    }
    return huecos;
  }
  _isoDe(min) { return new Date(min * 60000).toISOString().slice(0, 16); }   // 'YYYY-MM-DDTHH:MM' (pared)

  // ============================================================= ops
  _getDisp(input) {
    if (!input.project_id) return this._invalid('project_id');
    return { status: 200, data: this._disp(input.project_id) };
  }

  _setDisp(input) {
    if (!input.project_id) return this._invalid('project_id');
    const d = this._disp(input.project_id);
    if (Array.isArray(input.recurso_tipos)) d.recurso_tipos = input.recurso_tipos.filter(t => t && t.id).map(t => ({ id: String(t.id), etiqueta: t.etiqueta || t.id, capacidad: Math.max(0, Math.floor(t.capacidad || 0)) }));
    if (input.horario && typeof input.horario === 'object') d.horario = Object.assign({}, d.horario, input.horario);
    if (Array.isArray(input.excepciones)) d.excepciones = input.excepciones;
    if (input.tz) d.tz = String(input.tz);
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('calendario.disponibilidad.cambiada', { project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: d };
  }

  // "día que NO se trabaja" (o un rango) → excepción cerrada.
  _bloquearDia(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.fecha && !(input.desde && input.hasta)) return this._invalid('fecha|desde+hasta');
    const d = this._disp(input.project_id);
    const ex = input.fecha ? { fecha: input.fecha, abierto: false, motivo: input.motivo || 'cerrado' } : { desde: input.desde, hasta: input.hasta, abierto: false, motivo: input.motivo || 'cerrado' };
    d.excepciones = (d.excepciones || []).concat([ex]);
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('calendario.disponibilidad.cambiada', { project_id: input.project_id, motivo: 'bloqueo', timestamp: nowISO() });
    return { status: 201, data: { excepcion: ex } };
  }

  _huecosOp(input) {
    if (!input.project_id || !input.recurso_tipo || !input.desde || !input.hasta) return this._invalid('recurso_tipo|desde|hasta');
    const huecos = this._huecos(this._disp(input.project_id), this._reservas(input.project_id), input);
    return { status: 200, data: { recurso_tipo: input.recurso_tipo, huecos, total: huecos.length } };
  }

  _reservar(input) {
    if (!input.project_id || !input.recurso_tipo || !input.inicio) return this._invalid('recurso_tipo|inicio');
    const grano = input.grano === 'intervalo' ? 'intervalo' : 'cita';
    if (grano === 'cita' && !input.fin) return this._invalid('fin');   // la cita tiene fin fijo
    const disp = this._disp(input.project_id);
    const reservas = this._reservas(input.project_id);
    const h = this._hayHueco(disp, reservas, { recurso_tipo: input.recurso_tipo, inicio: input.inicio, fin: input.fin || null, grano });
    if (!h.ok) {
      const st = h.code === 'RECURSO_DESCONOCIDO' ? 404 : h.code === 'FUERA_DE_HORARIO' ? 412 : 409;
      return this._errorResponse(st, h.code, 'no hay hueco para esa reserva', { recurso_tipo: input.recurso_tipo, inicio: input.inicio, fin: input.fin || null });
    }
    const reserva = {
      id: crypto.randomUUID(), recurso_tipo: input.recurso_tipo, recurso_id: input.recurso_id || null,
      inicio: input.inicio, fin: input.fin || null, estado: 'confirmada', grano,
      cliente: input.cliente || null, origen: input.origen || 'directo', ref_externa: input.ref_externa || null,
      project_id: input.project_id, created_at: nowISO()
    };
    reservas.push(reserva);
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('calendario.reservada', { project_id: input.project_id, reserva_id: reserva.id, recurso_tipo: reserva.recurso_tipo, inicio: reserva.inicio, fin: reserva.fin, origen: reserva.origen, ref_externa: reserva.ref_externa, correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 201, data: reserva };
  }

  _reservaDe(project_id, id) { return this._reservas(project_id).find(r => r.id === id); }

  _cancelar(input) {
    if (!input.project_id || !input.reserva_id) return this._invalid('reserva_id');
    const r = this._reservaDe(input.project_id, input.reserva_id);
    if (!r) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'reserva no existe', { id: input.reserva_id });
    r.estado = 'cancelada'; r.cancelada_at = nowISO();
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('calendario.cancelada', { project_id: input.project_id, reserva_id: r.id, recurso_tipo: r.recurso_tipo, timestamp: nowISO() });
    return { status: 200, data: r };
  }

  // alquiler con_retorno: cierra el intervalo abierto (libera la unidad).
  _devolver(input) {
    if (!input.project_id || !input.reserva_id) return this._invalid('reserva_id');
    const r = this._reservaDe(input.project_id, input.reserva_id);
    if (!r) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'reserva no existe', { id: input.reserva_id });
    r.fin = input.fin || nowISO().slice(0, 16);
    r.estado = 'devuelta'; r.devuelta_at = nowISO();
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('calendario.devuelta', { project_id: input.project_id, reserva_id: r.id, recurso_tipo: r.recurso_tipo, fin: r.fin, timestamp: nowISO() });
    return { status: 200, data: r };
  }

  _listReservas(input) {
    if (!input.project_id) return this._invalid('project_id');
    let out = [...this._reservas(input.project_id)];
    if (input.recurso_tipo) out = out.filter(r => r.recurso_tipo === input.recurso_tipo);
    if (input.estado) out = out.filter(r => r.estado === input.estado);
    if (input.desde) { const d = this._min(input.desde); out = out.filter(r => this._min(r.inicio) >= d); }
    if (input.hasta) { const h = this._min(input.hasta); out = out.filter(r => this._min(r.inicio) <= h); }
    return { status: 200, data: { reservas: out, total: out.length } };
  }
}

module.exports = PrismaCalendarioReflejo;
