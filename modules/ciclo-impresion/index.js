/**
 * ciclo-impresion — REFLEJO / ORQUESTADOR del taller 3D (pieza 12).
 *
 * El CICLO de imprimir, DUEÑO de la máquina de estados determinista:
 *   LIBRE --iniciar--> PREPARANDO --subida_ok--> IMPRIMIENDO
 *   IMPRIMIENDO --trabajador pausar--> PAUSADO --reanudar--> IMPRIMIENDO
 *   IMPRIMIENDO --completado--> TERMINADA  -> historial + filamento.descontar + encadenar
 *   IMPRIMIENDO --fallo--> FALLIDA        -> manejo-fallo (siempre avisa)
 *   IMPRIMIENDO --abortar--> CANCELADA    -> historial CANCELADA
 *   FALLIDA --reintentar|saltar aprobado--> LIBRE (el dueño decide)
 *
 * Compone por RPC (nunca import): adaptador-impresora (subir_gcode/iniciar_impresion),
 * historial.registrar, filamento.descontar, motor-encadenamiento.al_terminar,
 * manejo-fallo.manejar, adaptador-avisos (fire-and-forget aviso.solicitar).
 *
 * CERO juicio: la aprobación de reintento/salto va por adaptador-confirmacion
 * (confirmacion_recibida); el sistema NUNCA sustituye al dueño. Contrato TOLERANTE:
 * si un RPC falla -> CANCELADA/aborto + par de fallo, nunca basura.
 *
 * El estado vive EN MEMORIA (sin PosPersistencia): si el proceso cae el ciclo se
 * reanuda desde LIBRE al reiniciar; el estado real lo reporta el adaptador externo.
 * Encola/imprime siempre piezas con GCODE listo (MONEDA REAL).
 *
 * v0.1.0: FASE 4 TANDA 4 (última).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const ESTADOS = Object.freeze([
  'LIBRE', 'PREPARANDO', 'IMPRIMIENDO', 'PAUSADO', 'TERMINADA', 'FALLIDA', 'CANCELADA'
]);

const nowISO = () => new Date().toISOString();

// Transiciones legales de la máquina. Si un evento no es legal desde el estado
// actual -> "transición ilegal" (garantiza una pieza a la vez y estados imposibles).
const TRANSICIONES = {
  iniciar:    { LIBRE: 'PREPARANDO' },
  gcode_ok:   { PREPARANDO: 'PREPARANDO' }, // sigue preparando (subida pendiente)
  subida_ok:  { PREPARANDO: 'IMPRIMIENDO' },
  imprimiendo_ok: { PREPARANDO: 'IMPRIMIENDO' }, // confirmado el arranque (redundante, comentado)
  pausar:     { IMPRIMIENDO: 'PAUSADO' },
  reanudar:   { PAUSADO: 'IMPRIMIENDO' },
  completado: { IMPRIMIENDO: 'TERMINADA' },
  fallo:      { IMPRIMIENDO: 'FALLIDA' },
  abortar:    { IMPRIMIENDO: 'CANCELADA', PREPARANDO: 'CANCELADA', PAUSADO: 'CANCELADA' }
};

const CONFIRMACIONES_CIERRE = Object.freeze(['reanudar_ciclo', 'pieza_retirada']);

class CicloImpresionReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ciclo-impresion';
    this.version = 'reflejo-0.1.0';
    // project_id → { estado, pieza, error, esperando, reintentos }
    this._ciclos = new Map();
  }

  async onUnload() { return super.onUnload(); } // NO persiste (maquina en memoria)

  // ── Handlers RPC ──
  onIniciarRequest(e)  { return this._atender(e, 'iniciar',  'ciclo-impresion.iniciar.response',  d => this._iniciar(d)); }
  onPausarRequest(e)   { return this._atender(e, 'pausar',   'ciclo-impresion.pausar.response',   d => this._pausar(d)); }
  onReanudarRequest(e) { return this._atender(e, 'reanudar', 'ciclo-impresion.reanudar.response', d => this._reanudar(d)); }
  onAbortarRequest(e)  { return this._atender(e, 'abortar',  'ciclo-impresion.abortar.response',  d => this._abortar(d)); }

  // ── fire-and-forget ──
  // Obsera el estado fisico: completado -> TERMINADA, fallo -> FALLIDA, progreso -> aviso.
  async onEstadoCrudo(e) {
    const d = (e && e.data) || e || {};
    const pid = d.project_id;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo || ciclo.estado !== 'IMPRIMIENDO') return; // solo vigila imprimiendo
    const est = d.estado_sistema || d.interpretado || {};
    const estado = est.estado;
    if (estado === 'completado') { this._manejarTerminada(pid, ciclo, d); }
    else if (estado === 'fallo') { this._manejarFallo(pid, ciclo, est, d); }
    else if (estado === 'pausado' && ciclo.estado === 'IMPRIMIENDO') { this._aplicarTransicion(pid, ciclo, 'pausar'); }
  }

  // Confirmación del dueño: solo cierra ciclos que quedaron esperando decisión.
  async onConfirmacionRecibida(e) {
    const d = (e && e.data) || e || {};
    const pid = d.project_id;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo || ciclo.estado !== 'FALLIDA') return;
    const tipo = d.tipo;
    if (!CONFIRMACIONES_CIERRE.includes(tipo)) return; // no reconocida -> no transiciona
    // El dueño decidió: reintentar o saltar; ambos liberan la máquina a LIBRE.
    ciclo.estado = 'LIBRE';
    this._publicarEvento('ciclo-impresion.resuelto', {
      project_id: pid, decision: tipo, correlation_id: d.correlation_id, timestamp: nowISO()
    });
    if (tipo === 'reanudar_ciclo') { this._encadenarSiguiente(pid); }
  }

  // ── PROYECCIONES (dominio) ──

  // _iniciar: LIBRE -> PREPARANDO -> IMPRIMIENDO. Solo piezas con gcode listo.
  // Orquesta por RPC (nunca import). Si algo falla -> aborta con pares de fallo.
  async _iniciar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    const previo = this._ciclos.get(pid);
    if (previo && previo.estado !== 'LIBRE' && previo.estado !== 'FALLIDA' && previo.estado !== 'CANCELADA') {
      return this._errorResponse(409, 'CONFLICT_STATE',
        `el ciclo ya esta en ${previo.estado}; una sola impresora, abortar primero`,
        { estado: previo.estado });
    }
    if (!input.gcode && !input.gcode_contenido && !input.archivo_id) {
      return this._invalid('gcode');
    }
    const ciclo = { project_id: pid, estado: 'LIBRE', pieza: null, gcode: null, error: null, esperando: null, reintentos: 0 };
    ciclo.pieza = {
      tarea_id: input.tarea_id || input.id || null,
      modelo_id: input.modelo_id || null,
      archivo_id: input.archivo_id || input.archivo_gcode || null,
      nombre: input.nombre || input.modelo_nombre || 'desconocido',
      material: input.material || input.filamento || 'PETG'
    };
    ciclo.estado = 'PREPARANDO';
    this._ciclos.set(pid, ciclo);

    // 1) Obtener el gcode (si el llamante lo paso, se usa; sino por cupula-gcode.obtener).
    let gcode = input.gcode_contenido || input.gcode;
    if (!gcode && input.archivo_id) {
      const r = await this._rpc('cupula-gcode.obtener.request', {
        project_id: pid, archivo_id: input.archivo_id, correlation_id: input.correlation_id });
      const arch = (((r || {}).data) || {}).archivo;
      gcode = (arch && arch.archivo_gcode) || null;
    }
    if (!gcode) return this._abortarCiclo(pid, ciclo, 'sin_gcode_listo', input.correlation_id);

    // 2) Subir el gcode a la impresora.
    const subida = await this._rpc('adaptador-impresora.subir_gcode.request', {
      project_id: pid, gcode, correlation_id: input.correlation_id }, { timeout_ms: 30000 });
    if (!subida || subida.status !== 200 || subida.data?.ok !== true) {
      this._failed('iniciar', { project_id: pid }, 'subida_impresora_fallo', input.correlation_id);
      return this._abortarCiclo(pid, ciclo, 'subida_impresora_fallo', input.correlation_id);
    }

    // 3) Iniciar la impresión.
    const inicio = await this._rpc('adaptador-impresora.iniciar_impresion.request', {
      project_id: pid, id: input.archivo_id, correlation_id: input.correlation_id }, { timeout_ms: 30000 });
    if (!inicio || inicio.status !== 200 || inicio.data?.ok !== true) {
      this._failed('iniciar', { project_id: pid }, 'inicio_impresora_fallo', input.correlation_id);
      return this._abortarCiclo(pid, ciclo, 'inicio_impresora_fallo', input.correlation_id);
    }

    // 4) Marcar la tarea en IMPRIMIENDO en la cola (best-effort; la cola marca).
    try { await this._rpc('cola.imprimiendo.request', { project_id: pid, id: ciclo.pieza.tarea_id }); }
    catch (_) { /* mejor esfuerzo */ }

    // subida + inicio ok -> IMPRIMIENDO
    this._aplicarTransicion(pid, ciclo, 'subida_ok');
    this._publicarEvento('impresion.iniciada', {
      project_id: pid, pieza: ciclo.pieza, correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 200, data: { estado: ciclo.estado, pieza: ciclo.pieza, iniciada: true } };
  }

  async _pausar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay ciclo activo para pausar', { estado: 'LIBRE' });
    try { this._aplicarTransicion(pid, ciclo, 'pausar'); }
    catch (_) { return this._errorResponse(409, 'ESTADO_ILEGAL', `no se puede pausar desde ${ciclo.estado}`, { estado: ciclo.estado }); }
    return { status: 200, data: { estado: ciclo.estado } };
  }

  async _reanudar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay ciclo activo para reanudar', { estado: 'LIBRE' });
    try { this._aplicarTransicion(pid, ciclo, 'reanudar'); }
    catch (_) { return this._errorResponse(409, 'ESTADO_ILEGAL', `no se puede reanudar desde ${ciclo.estado}`, { estado: ciclo.estado }); }
    return { status: 200, data: { estado: ciclo.estado } };
  }

  async _abortar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    const motivo = input.motivo || 'abortado_por_trabajador';
    const ciclo = this._ciclos.get(pid);
    if (!ciclo || ciclo.estado === 'LIBRE' || ciclo.estado === 'TERMINADA') {
      return this._errorResponse(409, 'CONFLICT_STATE', `no hay impresion que abortar (${ciclo ? ciclo.estado : 'LIBRE'})`, { estado: ciclo ? ciclo.estado : 'LIBRE' });
    }
    try { this._aplicarTransicion(pid, ciclo, 'abortar'); }
    catch (_) { return this._errorResponse(409, 'ESTADO_ILEGAL', `no se puede abortar desde ${ciclo.estado}`, { estado: ciclo.estado }); }
    ciclo.error = motivo;
    // registrar CANCELADA en historial (best-effort, dato medido requerido -> sin dato no forzamos)
    this._publicarEvento('ciclo_abortado', {
      project_id: pid, motivo, pieza: ciclo.pieza, correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 200, data: { estado: ciclo.estado, motivo } };
  }

  // ── manejadores internos (proyecciones) ──

  // _manejarTerminada: IMPRIMIENDO -> TERMINADA. Registra historial, descuenta filamento (solo
  // con dato medido) y encadena. TERMINADA SIEMPRE registra + encadena (invariante del plano).
  async _manejarTerminada(pid, ciclo, e) {
    try { this._aplicarTransicion(pid, ciclo, 'completado'); }
    catch (_) { return; }
    const est = (e && (e.estado_sistema || e.interpretado)) || {};
    const { correlation_id } = (e && e.data) || e || {};
    // 1) registra en historial (dato MEDIDO del estado real)
    const gramos = est.filament_used_mm != null ? this._round(est.filament_used_mm * 0.001, 2) : null; // mm→g aproximado solo si viene
    await this._rpc('historial.registrar.request', {
      project_id: pid, modelo_id: ciclo.pieza.modelo_id, resultado: 'OK',
      gramos_reales: gramos != null ? gramos : null,
      tiempo_real: est.print_duration != null ? this._round(est.print_duration, 2) : 1,
      correlation_id
    });
    // 2) descuenta filamento SOLO si hubo dato medido
    if (gramos != null) {
      await this._rpc('filamento.descontar.request', {
        project_id: pid, gramos_medido: gramos, material: ciclo.pieza.material, correlation_id });
    }
    // 3) encadena
    await this._rpc('motor-encadenamiento.al_terminar.request', {
      project_id: pid, tarea_id: ciclo.pieza.tarea_id, correlation_id });
    this._publicarEvento('impresion.finalizada', { project_id: pid, pieza: ciclo.pieza, timestamp: nowISO() });
  }

  // _manejarFallo: IMPRIMIENDO -> FALLIDA. SIEMPRE avisa y delega en manejo-fallo.
  async _manejarFallo(pid, ciclo, est, e) {
    try { this._aplicarTransicion(pid, ciclo, 'fallo'); }
    catch (_) { return; }
    ciclo.error = est.message || 'fallo_impresora';
    const { correlation_id } = (e && e.data) || e || {};
    this._publicarEvento('impresion.fallida', {
      project_id: pid, pieza: ciclo.pieza, motivo: ciclo.error,
      correlation_id, timestamp: nowISO()
    });
    // siempre avisar (manejo-fallo lo hace por diseño)
    await this._rpc('manejo-fallo.manejar.request', {
      project_id: pid, tarea_id: ciclo.pieza.tarea_id, modelo_id: ciclo.pieza.modelo_id,
      motivo: ciclo.error, correlation_id });
  }

  // _encadenarSiguiente: tras resolver FALLIDA, si el sistema encadena no decide —
  // delega en motor-encadenamiento (que a su vez respeta la decisión del dueño).
  async _encadenarSiguiente(pid) {
    await this._rpc('motor-encadenamiento.al_terminar.request', {
      project_id: pid, tarea_id: null, correlation_id: null });
  }

  // ── la máquina de estados ──
  _aplicarTransicion(pid, ciclo, evento) {
    const mapa = TRANSICIONES[evento];
    const nuevo = mapa && mapa[ciclo.estado];
    if (!nuevo) {
      throw new Error(`transición ilegal: ${ciclo.estado} --${evento}--> ?`);
    }
    ciclo.estado = nuevo;
    return nuevo;
  }

  // _abortarCiclo interno: pasa a CANCELADA + emite par de fallo canónico.
  _abortarCiclo(pid, ciclo, motivo, correlation_id) {
    try {
      if (ciclo.estado === 'PREPARANDO') ciclo.estado = 'CANCELADA';
      else this._aplicarTransicion(pid, ciclo, 'abortar');
    } catch (_) { ciclo.estado = 'CANCELADA'; }
    ciclo.error = motivo;
    this._publicarEvento('ciclo_abortado', { project_id: pid, motivo, correlation_id, timestamp: nowISO() });
    return this._errorResponse(500, 'CICLO_ABORTADO', motivo, { estado: ciclo.estado });
  }

  _failed(op, input, motivo, correlation_id) {
    this._publicarEvento(`ciclo-impresion.${op}.failed`, {
      project_id: input.project_id, motivo, correlation_id, timestamp: nowISO()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = CicloImpresionReflejo;
