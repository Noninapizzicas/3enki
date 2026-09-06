'use strict';

/**
 * ciclo-impresion — EL ORQUESTADOR DEL CICLO DE IMPRESIÓN 3D (MICRO-AGENTE).
 *
 * Es el CORAZÓN del sistema y la ÚLTIMA hoja del plan (sección 6.12). Encadena el
 * ciclo completo: libre → propuesta → aprobación → imprimiendo → impreso → libre.
 * Es el DUEÑO de la máquina de estados del ciclo (en memoria, no persiste):
 *
 *   IDLE ──ciclo.iniciar──▶ OBTENIENDO_GCODE
 *   OBTENIENDO_GCODE ──gcode ok──▶ SUBIENDO_GCODE
 *   OBTENIENDO_GCODE ──cola vacía──▶ COLA_VACIA
 *   OBTENIENDO_GCODE ──sin .3mf / slicer falla──▶ ERROR
 *   SUBIENDO_GCODE ──subida ok──▶ IMPRIMIENDO
 *   SUBIENDO_GCODE ──subida falla──▶ ERROR
 *   IMPRIMIENDO ──impresion.completada──▶ ESPERANDO_RETIRADA
 *   IMPRIMIENDO ──filamento.falta──▶ PAUSADO_FALTA_FILAMENTO
 *   IMPRIMIENDO ──impresion.error──▶ ERROR
 *   ESPERANDO_RETIRADA ──confirmación pieza_retirada──▶ IDLE (encadena siguiente)
 *   PAUSADO_FALTA_FILAMENTO ──confirmación filamento_cambiado──▶ IMPRIMIENDO
 *   ERROR ──confirmación reanudar_ciclo──▶ IDLE
 *   COLA_VACIA ──ciclo.iniciar (nueva pieza)──▶ OBTENIENDO_GCODE
 *
 * Garantía: la impresora nunca queda idle por falta de gcode (invariante 11) — la
 * cúpula-gcode cachea el gcode por (modelo, material) o se slicera antes de encadenar.
 *
 * Orquesta por RPC (nunca import, regla de traducción): cola-impresion (siguiente),
 * cupula-gcode (buscar/almacenar), gestion-filamento (decrementar via filamento.usado),
 * historial-impresiones (registrar), adaptador-impresora (subir_gcode/iniciar_impresion/
 * observar_estado), adaptador-slicing (slicear), adaptador-avisos (enviar),
 * adaptador-confirmacion (confirmar).
 *
 * Contrato TOLERANTE: si un RPC falla, el ciclo pasa a ERROR y emite ciclo.abortado
 * (nunca basura). Cuando termina una pieza, encadena la siguiente automáticamente; el
 * dueño debe retirar la pieza y cambiar filamento entre ciclos (no 100% autónomo).
 *
 * Los 16 REFLEJOS y 3 CONVERSORES del esquema que no son módulos viven como
 * proyecciones internas _op de este orquestador: _obtenerGcode (3.1), _vigilarProgreso
 * (3.3), _detectarFin (3.4), _detectarError (3.5), _detectarFaltaFilamento (3.6),
 * _aplicarTransicion, _encadenarSiguiente.
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

// Estados canónicos del ciclo (DUEÑO).
const ESTADOS = Object.freeze([
  'IDLE', 'OBTENIENDO_GCODE', 'SUBIENDO_GCODE', 'IMPRIMIENDO',
  'ESPERANDO_RETIRADA', 'PAUSADO_FALTA_FILAMENTO', 'ERROR', 'COLA_VACIA'
]);

// Tipos de confirmación que el ciclo entiende (mapeo botón → tipo, 12.2).
const CONFIRMACIONES = Object.freeze([
  'pieza_retirada', 'filamento_cambiado', 'reanudar_ciclo',
  'modelo_aprobado', 'modelo_rechazado'
]);

class CicloImpresionReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ciclo-impresion';
    this.version = 'reflejo-0.1.0';
    // Estado del ciclo por proyecto (en memoria, DUEÑO). No persiste.
    // { estado, pieza, gcode, error, esperando }
    this._ciclos = new Map();
  }

  async onUnload() {
    // No persiste estado: la máquina de estados es runtime. Solo log.
    return super.onUnload();
  }

  // =============================================================
  // Handlers (una línea cada uno, delegan a _atender o a la máquina)
  // =============================================================
  onIniciarRequest(e) {
    return this._atender(e, 'iniciar', 'ciclo.iniciar.response', d => this._iniciar(d));
  }

  // fire-and-forget: la impresora reporta estado crudo interpretado → vigilar.
  onEstadoCrudo(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo || ciclo.estado !== 'IMPRIMIENDO') return;   // solo vigila en impresión
    const estado = d.estado_sistema || d.estado || {};
    this._vigilarProgreso(pid, ciclo, estado);
    this._detectarFin(pid, ciclo, estado);
    this._detectarError(pid, ciclo, estado);
    this._detectarFaltaFilamento(pid, ciclo, estado);
  }

  // fire-and-forget: una pieza terminó → DUEÑO aplica transición.
  onImpresionCompletada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return;
    try {
      this._aplicarTransicion(pid, ciclo, 'impresion.completada');
    } catch (err) {
      this._abortar(pid, ciclo, err.message);
    }
  }

  // fire-and-forget: la impresión falló → DUEÑO aplica transición.
  onImpresionError(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return;
    try {
      this._aplicarTransicion(pid, ciclo, 'impresion.error');
    } catch (err) {
      this._abortar(pid, ciclo, err.message);
    }
  }

  // fire-and-forget: falta filamento → DUEÑO aplica transición.
  onFilamentoFalta(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return;
    try {
      this._aplicarTransicion(pid, ciclo, 'filamento.falta');
    } catch (err) {
      this._abortar(pid, ciclo, err.message);
    }
  }

  // fire-and-forget: el dueño confirmó → DUEÑO aplica transición.
  onConfirmacionRecibida(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return;
    const tipo = d.tipo || d.confirmacion || 'no_reconocida';
    if (!CONFIRMACIONES.includes(tipo)) return;   // no_reconocida → pide aclaración (12.2), no transiciona
    try {
      this._aplicarTransicion(pid, ciclo, `confirmacion:${tipo}`);
    } catch (err) {
      this._abortar(pid, ciclo, err.message);
    }
  }

  // =============================================================
  // Proyecciones
  // =============================================================

  // _iniciar — arranca el ciclo: siguiente pieza → gcode → subir → iniciar → observar.
  async _iniciar(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');

    let ciclo = this._ciclos.get(pid);
    if (!ciclo) {
      ciclo = { estado: 'IDLE', pieza: null, gcode: null, error: null, esperando: null };
      this._ciclos.set(pid, ciclo);
    }

    // Si ya está imprimiendo o esperando retirada, no se re-arranca (una pieza a la vez).
    if (ciclo.estado === 'IMPRIMIENDO' || ciclo.estado === 'ESPERANDO_RETIRADA'
      || ciclo.estado === 'PAUSADO_FALTA_FILAMENTO' || ciclo.estado === 'SUBIENDO_GCODE'
      || ciclo.estado === 'OBTENIENDO_GCODE') {
      return this._errorResponse(409, 'CONFLICT_STATE', `el ciclo ya está en ${ciclo.estado}`, { estado: ciclo.estado });
    }

    // COLA_VACIA → re-iniciar con nueva pieza (transición legal).
    this._aplicarTransicion(pid, ciclo, 'ciclo.iniciar');

    // 1. Siguiente pieza de la cola (RPC best-effort).
    const cola = await this._rpc('cola.siguiente.request', { project_id: pid, correlation_id: input.correlation_id });
    if (!cola || cola.status !== 200) {
      return this._abortar(pid, ciclo, 'cola.siguiente no respondió');
    }
    if (cola.data && cola.data.vacia) {
      this._aplicarTransicion(pid, ciclo, 'cola_vacia');
      this._publicarEvento('ciclo.cola_vacia', { project_id: pid });
      this._enviarAviso(pid, 'cola_vacia', { project_id: pid, correlation_id: input.correlation_id });
      return { status: 200, data: { project_id: pid, estado: 'COLA_VACIA', pieza: null } };
    }
    const pieza = cola.data.item;
    ciclo.pieza = pieza;

    // 2. Obtener gcode (3.1): cúpula primero, slicer si no está cacheado.
    const gcode = await this._obtenerGcode(pid, pieza, input.correlation_id);
    if (!gcode) {
      return this._abortar(pid, ciclo, 'no se pudo obtener gcode (sin .3mf o slicer falló)');
    }
    ciclo.gcode = gcode;
    this._aplicarTransicion(pid, ciclo, 'gcode_ok');

    // 3. Subir gcode a la impresora.
    const subida = await this._rpc('adaptador-impresora.subir_gcode.request', {
      project_id: pid, gcode: gcode.contenido, correlation_id: input.correlation_id
    });
    if (!subida || subida.status !== 200 || subida.data?.ok !== true) {
      return this._abortar(pid, ciclo, 'no se pudo subir el gcode a la impresora');
    }
    this._aplicarTransicion(pid, ciclo, 'subida_ok');

    // 4. Iniciar la impresión.
    const inicio = await this._rpc('adaptador-impresora.iniciar_impresion.request', {
      project_id: pid, correlation_id: input.correlation_id
    });
    if (!inicio || inicio.status !== 200 || inicio.data?.ok !== true) {
      return this._abortar(pid, ciclo, 'no se pudo iniciar la impresión');
    }
    // Ya en IMPRIMIENDO (subida_ok). El inicio confirmado no cambia de estado.

    // 5. Abrir el stream de observación (push).
    const obs = await this._rpc('adaptador-impresora.observar_estado.request', {
      project_id: pid, correlation_id: input.correlation_id
    });
    if (!obs || obs.status !== 200) {
      // El stream no abre: no bloquea el ciclo (la impresora ya imprime), pero se avisa.
      this.logger?.warn(`${this.name}.reflejo.stream_no_abierto`, { project_id: pid });
    }

    this._publicarEvento('ciclo.iniciado', {
      project_id: pid, item_id: pieza.id, modelo_id: pieza.modelo_id,
      nombre: pieza.nombre, material: pieza.material
    });
    return { status: 200, data: { project_id: pid, estado: 'IMPRIMIENDO', pieza } };
  }

  // _obtenerGcode (3.1) — enrutamiento cúpula (reutilizar) vs slicer (slicear).
  // Devuelve el gcode { contenido, ... } o null si no se pudo obtener.
  async _obtenerGcode(pid, pieza, correlation_id) {
    const modeloId = pieza.modelo_id;
    const material = pieza.material || 'desconocido';

    // 1. Cúpula: ¿ya hay gcode cacheado por (modelo, material)?
    const cupula = await this._rpc('cupula.buscar.request', {
      project_id: pid, modelo_id: modeloId, material, correlation_id
    });
    if (cupula && cupula.status === 200 && cupula.data?.encontrado && cupula.data.gcode) {
      return cupula.data.gcode;
    }

    // 2. No cacheado → slicer. Necesita el .3mf del modelo.
    const catalogo = await this._rpc('catalogo.obtener.request', {
      project_id: pid, id: modeloId, correlation_id
    });
    const modelo = (catalogo && catalogo.status === 200 && catalogo.data?.modelo) || null;
    const archivo3mf = (modelo && modelo.archivo3mf) || null;
    if (!archivo3mf) {
      // Invariante 7: el ciclo no avanza sin gcode. Sin .3mf → error.
      this._publicarEvento('ciclo.abortado', {
        project_id: pid, motivo: 'sin_archivo_3mf', modelo_id: modeloId
      });
      return null;
    }

    const slice = await this._rpc('adaptador-slicing.slicear.request', {
      project_id: pid, modelo_id: modeloId, archivo3mf, perfil: pieza.perfil || 'desconocido', correlation_id
    });
    if (!slice || slice.status !== 200 || !slice.data?.gcode) {
      this._publicarEvento('ciclo.abortado', {
        project_id: pid, motivo: 'slicer_fallo', modelo_id: modeloId
      });
      return null;
    }

    // 3. Guardar en la cúpula para reutilizar sin reslicear (invariante 3).
    const gcode = {
      clave: `${modeloId}::${material}`,
      modelo_id: modeloId, material, contenido: slice.data.gcode,
      perfil: slice.data.perfil || 'desconocido'
    };
    await this._rpc('cupula.almacenar.request', {
      project_id: pid, modelo_id: modeloId, material, gcode: slice.data.gcode,
      perfil: slice.data.perfil || 'desconocido', correlation_id
    });
    return gcode;
  }

  // _vigilarProgreso (3.3) — observa el stream interpretado, emite progreso + filamento.usado.
  _vigilarProgreso(pid, ciclo, estado) {
    const pieza = ciclo.pieza;
    if (!pieza) return;
    if (estado.progress != null) {
      this._publicarEvento('progreso.actualizado', {
        project_id: pid, item_id: pieza.id, modelo_id: pieza.modelo_id,
        progress: estado.progress, current_layer: estado.current_layer ?? null,
        total_layer: estado.total_layer ?? null
      });
    }
    // La impresora reporta filament_used en mm → gestion-filamento decrementa el rollo activo.
    if (estado.filament_used_mm != null && estado.filament_used_mm > 0) {
      this._publicarEvento('filamento.usado', {
        project_id: pid, item_id: pieza.id, modelo_id: pieza.modelo_id,
        filament_used: estado.filament_used_mm
      });
    }
  }

  // _detectarFin (3.4) — state === completado → impresion.completada.
  _detectarFin(pid, ciclo, estado) {
    if (estado.estado === 'completado') {
      this._publicarEvento('impresion.completada', {
        project_id: pid, item_id: ciclo.pieza?.id, modelo_id: ciclo.pieza?.modelo_id,
        modelo_nombre: ciclo.pieza?.nombre, material: ciclo.pieza?.material,
        filamento_usado: estado.filament_used_mm ?? null, tiempo: estado.total_duration ?? null,
        resultado: 'completada'
      });
    }
  }

  // _detectarError (3.5) — state === fallo → impresion.error (error_desconocido si sin message).
  _detectarError(pid, ciclo, estado) {
    if (estado.estado === 'fallo') {
      this._publicarEvento('impresion.error', {
        project_id: pid, item_id: ciclo.pieza?.id, modelo_id: ciclo.pieza?.modelo_id,
        modelo_nombre: ciclo.pieza?.nombre, material: ciclo.pieza?.material,
        error: estado.error || 'error_desconocido'
      });
    }
  }

  // _detectarFaltaFilamento (3.6) — filament_detected === false → filamento.falta.
  _detectarFaltaFilamento(pid, ciclo, estado) {
    if (estado.filament_detected === false) {
      this._publicarEvento('filamento.falta', {
        project_id: pid, item_id: ciclo.pieza?.id, modelo_id: ciclo.pieza?.modelo_id,
        modelo_nombre: ciclo.pieza?.nombre, material: ciclo.pieza?.material
      });
    }
  }

  // _aplicarTransicion — la máquina de estados del ciclo (DUEÑO). Lanza si es ilegal.
  _aplicarTransicion(pid, ciclo, evento) {
    const actual = ciclo.estado;
    let nuevo = null;

    switch (evento) {
      case 'ciclo.iniciar':
        if (actual === 'IDLE' || actual === 'COLA_VACIA' || actual === 'ERROR') nuevo = 'OBTENIENDO_GCODE';
        break;
      case 'gcode_ok':
        if (actual === 'OBTENIENDO_GCODE') nuevo = 'SUBIENDO_GCODE';
        break;
      case 'subida_ok':
        if (actual === 'SUBIENDO_GCODE') nuevo = 'IMPRIMIENDO';
        break;
      case 'impresion.completada':
        if (actual === 'IMPRIMIENDO') nuevo = 'ESPERANDO_RETIRADA';
        break;
      case 'impresion.error':
        if (actual === 'IMPRIMIENDO') nuevo = 'ERROR';
        break;
      case 'filamento.falta':
        if (actual === 'IMPRIMIENDO') nuevo = 'PAUSADO_FALTA_FILAMENTO';
        break;
      case 'cola_vacia':
        if (actual === 'OBTENIENDO_GCODE') nuevo = 'COLA_VACIA';
        break;
      case 'confirmacion:pieza_retirada':
        if (actual === 'ESPERANDO_RETIRADA') nuevo = 'IDLE';
        break;
      case 'confirmacion:filamento_cambiado':
        if (actual === 'PAUSADO_FALTA_FILAMENTO') nuevo = 'IMPRIMIENDO';
        break;
      case 'confirmacion:reanudar_ciclo':
        if (actual === 'ERROR') nuevo = 'IDLE';
        break;
      default:
        break;
    }

    if (!nuevo) {
      throw new Error(`transición ilegal: ${actual} --${evento}--> ?`);
    }
    ciclo.estado = nuevo;
    this.metrics?.increment(`${this.name}.reflejo.transicion`, { de: actual, a: nuevo, evento });
    return nuevo;
  }

  // _encadenarSiguiente — tras retirar la pieza, encadena la siguiente automáticamente.
  async _encadenarSiguiente(pid, correlation_id) {
    const ciclo = this._ciclos.get(pid);
    if (!ciclo) return;
    // El ciclo ya está en IDLE (transición pieza_retirada). Re-inicia con la siguiente.
    const r = await this._iniciar({ project_id: pid, correlation_id });
    if (r && r.status === 200 && r.data?.estado === 'COLA_VACIA') {
      // No hay más piezas: ciclo completado, impresora ociosa con causa.
      this._publicarEvento('ciclo.completado', { project_id: pid });
    }
    return r;
  }

  // =============================================================
  // Utilidades
  // =============================================================

  // _abortar — pasa el ciclo a ERROR y emite ciclo.abortado (par de fallo canónico).
  _abortar(pid, ciclo, motivo) {
    ciclo.estado = 'ERROR';
    ciclo.error = motivo;
    this._publicarEvento('ciclo.abortado', { project_id: pid, motivo, estado: 'ERROR' });
    this._enviarAviso(pid, 'fallo', { project_id: pid, detalle: motivo });
    return this._errorResponse(500, 'CICLO_ABORTADO', motivo, { estado: 'ERROR' });
  }

  // _enviarAviso — pide un aviso al adaptador-avisos (best-effort, no bloquea el ciclo).
  async _enviarAviso(pid, tipo, extra) {
    if (!this.eventBus?.publish) return;
    await this._rpc('adaptador-avisos.enviar.request', {
      project_id: pid, tipo, ...extra
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(evento, { ...data, timestamp: nowISO() });
    }
  }
}

module.exports = CicloImpresionReflejo;
