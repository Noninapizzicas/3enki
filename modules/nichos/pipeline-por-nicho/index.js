/**
 * nichos/pipeline-por-nicho — CUSTODIO / ORQUESTADOR (L1, hoja del plan · último).
 *
 * LA MÁQUINA DE ESTADOS semilla→caja por nicho. Es el DUEÑO del estado de cada
 * nicho (un único escritor del agregado Nicho): consume eventos de dominio ajenos
 * (semilla capturada, normalizada, sondeada, estudiada, veredicto, camino,
 * solución ensamblada, modelo cobro, paquete, gate, cobro) y aplica las
 * transiciones. Ningún otro módulo muta el estado del nicho.
 *
 * ESTADOS (seccion 4 del plan):
 *   SEMILLA → BUSCADO → VALIDANDO → VALIDADO → CONSTRUIDO → OPERANDO → COBRANDO
 *   → EN_CAJA | SANGRA ; más CORTADO (corte DURO determinista C6) y
 *   OPERANDO_EN_ESPERA (gate RECHAZA → re-pregunta).
 *
 * REGLA DE ILEGALIDAD (determinista): las transiciones se validan contra la
 * MÁQUINA. Una transición no declarada (p.ej. saltar de VALIDANDO a CONSTRUIDO
 * sin pasar por VALIDADO, o NO_VIABLE → CONSTRUIDO) se RECHAZA con par de fallo
 * `nichos.pipeline.avanzar.failed`. Estado ilegal imposible.
 *
 * PosPersistencia per-proyecto (patrón custodio): restaura la máquina en
 * project.activated y vuelca en onUnload. Orquesta la etapa según el estado y
 * publica nichos.pipeline.avanzado / ciclo_iniciado / ciclo_completado
 * (+ nichos.pipeline.avanzar.failed). El scheduler (REUTILIZAR) dispara el ciclo.
 *
 * Ver hoja L1 + seccion 3.2 + seccion 4 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Estados de la máquina (nombres canónicos, ASCII).
const ESTADOS = {
  SEMILLA: 'SEMILLA',
  BUSCADO: 'BUSCADO',
  VALIDANDO: 'VALIDANDO',
  VALIDADO: 'VALIDADO',
  CONSTRUIDO: 'CONSTRUIDO',
  OPERANDO: 'OPERANDO',
  OPERANDO_EN_ESPERA: 'OPERANDO_EN_ESPERA',
  COBRANDO: 'COBRANDO',
  EN_CAJA: 'EN_CAJA',
  SANGRA: 'SANGRA',
  CORTADO: 'CORTADO'
};
const TERMINALES = new Set([ESTADOS.EN_CAJA, ESTADOS.SANGRA, ESTADOS.CORTADO]);

// Tabla de transiciones: estado_origen -> [ [tipo_evento, predicado] , estado_destino ]
// La máquina NO permite salto de etapa. C6 NO_VIABLE → CORTADO es el corte DURO.
const TRANSICIONES = {
  [ESTADOS.SEMILLA]: [
    ['semilla.capturada', () => true, ESTADOS.BUSCADO],
    ['semilla.normalizada', () => true, ESTADOS.BUSCADO]
  ],
  [ESTADOS.BUSCADO]: [
    ['territorio.sondeado', () => true, ESTADOS.VALIDANDO],
    ['candidato.encontrado', () => true, ESTADOS.VALIDANDO],
    ['semilla.normalizada', () => true, ESTADOS.BUSCADO]
  ],
  [ESTADOS.VALIDANDO]: [
    ['estudio.medido', () => true, ESTADOS.VALIDANDO],               // permanece en el embudo C
    ['veredicto.emitido', (e) => e.veredicto !== 'NO_VIABLE', ESTADOS.VALIDADO],
    ['veredicto.emitido', (e) => e.veredicto === 'NO_VIABLE', ESTADOS.CORTADO], // corte DURO C6
    ['corte.aplicado', () => true, ESTADOS.CORTADO]
  ],
  [ESTADOS.VALIDADO]: [
    ['camino.decidido', () => true, ESTADOS.CONSTRUIDO],             // C4 decide ENCONTRAR|CONSTRUIR
    ['corte.aplicado', () => true, ESTADOS.CORTADO]
  ],
  [ESTADOS.CONSTRUIDO]: [
    ['solucion.construida', () => true, ESTADOS.OPERANDO]            // D1 ensamblador
  ],
  [ESTADOS.OPERANDO]: [
    ['gate.aprobado', () => true, ESTADOS.COBRANDO],                  // E2 gate APRUEBA
    ['gate.rechazado', () => true, ESTADOS.OPERANDO_EN_ESPERA],      // E2 RECHAZA → re-pregunta
    ['gate.solicitado', (e) => e.decision === 'APRUEBA', ESTADOS.COBRANDO],
    ['gate.solicitado', (e) => e.decision !== 'APRUEBA', ESTADOS.OPERANDO_EN_ESPERA]
  ],
  [ESTADOS.OPERANDO_EN_ESPERA]: [
    ['gate.aprobado', () => true, ESTADOS.COBRANDO],
    ['gate.solicitado', (e) => e.decision === 'APRUEBA', ESTADOS.COBRANDO],
    ['gate.solicitado', (e) => e.decision !== 'APRUEBA', ESTADOS.OPERANDO_EN_ESPERA]
  ],
  [ESTADOS.COBRANDO]: [
    ['cobro.ejecutado', (e) => e.tipo !== 'COMPROMETIDO', ESTADOS.EN_CAJA], // E3 EFECTIVO → EN_CAJA
    ['cobro.ejecutado', (e) => e.tipo === 'COMPROMETIDO', ESTADOS.COBRANDO],
    ['cobro_registrado', () => true, ESTADOS.EN_CAJA],
    // F3: resultado real del nicho — SANGRA → no llega a caja con control
    ['salud.actualizada', (e) => e.resultado === 'SANGRA', ESTADOS.SANGRA],
    ['salud.actualizada', (e) => e.resultado === 'COBRO', ESTADOS.EN_CAJA],
    ['salud.actualizada', (e) => e.resultado === 'NEUTRO', ESTADOS.COBRANDO]
  ]
};

function nichoVacio(project_id, nicho_id, origen) {
  return {
    project_id,
    nicho: nicho_id || origen?.nicho || origen?.nicho_id || null,
    estado: ESTADOS.SEMILLA,
    etapa_actual: 'SEMILLA',
    historial: [],
    creado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString()
  };
}

// Normaliza el tipo de evento desde el nombre del evento de dominio completo.
function tipoDeEvento(evento) {
  if (!evento) return null;
  let e = String(evento);
  // quita el prefijo nichos. y cualquier sufijo .failed
  if (e.startsWith('nichos.')) e = e.slice('nichos.'.length);
  e = e.replace(/\.failed$/, '');
  return e;
}

class PipelinePorNicho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pipeline-por-nicho';
    this.version = 'reflejo-0.1.0';
    // máquina de estados: project_id -> Map(nicho -> estado)
    this._nichos = new Map();   // project_id -> Map(nicho_id -> objeto estado)
    this.project_id = null;

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'pipeline-por-nicho.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => ({
        project_id: pid,
        nichos: Object.fromEntries([...this._mapaDe(pid).entries()])
      }),
      hidratar: (pid, data) => {
        if (data && data.nichos) {
          for (const [id, st] of Object.entries(data.nichos)) this._mapaDe(pid).set(id, st);
        }
      }
    });
  }

  _mapaDe(pid) {
    if (!this._nichos.has(pid)) this._nichos.set(pid, new Map());
    return this._nichos.get(pid);
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la máquina del proyecto activado (PosPersistencia).
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    return this._persist.restaurar(this.project_id);
  }

  // ── RPC: registrar una semilla nueva (crea el nicho en SEMILLA) ──
  onRegistrarSemillaRequest(e) {
    return this._atender(e, 'registrar-semilla', 'nichos.pipeline.registrar_semilla.response', (d) => {
      const res = this._registrarSemilla(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.pipeline.ciclo_iniciado', {
          project_id: res.data.project_id,
          nicho: res.data.nicho,
          estado: res.data.estado,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.pipeline.avanzar.failed', res);
      }
      return res;
    });
  }

  // ── RPC: avanzar manualmente la máquina con un evento (test / orquestación) ──
  onAvanzarRequest(e) {
    return this._atender(e, 'avanzar', 'nichos.pipeline.avanzar.response', (d) => {
      const res = this._avanzar(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.pipeline.avanzado', res.data);
      } else {
        this.eventBus?.publish('nichos.pipeline.avanzar.failed', res);
      }
      return res;
    });
  }

  // ── Consumidores fire-and-forget de los eventos de dominio ajenos ──
  // Todos delegan al mismo orquestador _aplicarEvento (único punto de transición).
  onSemillaCapturada(e) { return this._consumir(e, 'nichos.semilla.capturada'); }
  onSemillaNormalizada(e) { return this._consumir(e, 'nichos.semilla.normalizada'); }
  onTerritorioSondeado(e) { return this._consumir(e, 'nichos.territorio.sondeado'); }
  onCandidatoEncontrado(e) { return this._consumir(e, 'nichos.candidato.encontrado'); }
  onEstudioMedido(e) { return this._consumir(e, 'nichos.estudio.medido'); }
  onVeredictoEmitido(e) { return this._consumir(e, 'nichos.veredicto.emitido'); }
  onCorteAplicado(e) { return this._consumir(e, 'nichos.corte.aplicado'); }
  onCaminoDecidido(e) { return this._consumir(e, 'nichos.camino.decidido'); }
  onSolucionConstruida(e) { return this._consumir(e, 'nichos.solucion.construida'); }
  onModeloCobroPropuesto(e) { return this._consumir(e, 'nichos.modelo_cobro.propuesto'); }
  onCobroEjecutado(e) { return this._consumir(e, 'nichos.cobro.ejecutado'); }
  onCobroRegistrado(e) { return this._consumir(e, 'nichos.cobro_registrado'); }
  onSaludActualizada(e) { return this._consumir(e, 'nichos.salud.actualizada'); }

  // Consumidor genérico: extrae proyecto+nicho, normaliza el tipo de evento,
  // aplica la transición y publica el pulso avanzado / par de fallo.
  _consumir(e, nombreEvento) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    const tipo = tipoDeEvento(nombreEvento);
    const res = this._transicion(pid, d.nicho || d.nicho_id, tipo, d);
    if (res.status === 200) {
      this._persist.marcarDirty(pid);
      this.eventBus?.publish('nichos.pipeline.avanzado', res.data);
    } else {
      this.eventBus?.publish('nichos.pipeline.avanzar.failed', res);
    }
    return res;
  }

  // ── proyección: registrar una semilla (crea en SEMILLA o reusa) ──
  _registrarSemilla(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const nicho_id = input.nicho || input.nicho_id;
    if (!nicho_id) return this._invalid('nicho');

    const mapa = this._mapaDe(pid);
    let st = mapa.get(nicho_id);
    if (!st) {
      st = nichoVacio(pid, nicho_id, input.origen);
      mapa.set(nicho_id, st);
      this._persist.marcarDirty(pid);
    }
    return { status: 200, data: { project_id: pid, nicho: nicho_id, estado: st.estado, reusado: true } };
  }

  // ── proyección pura de la MÁQUINA: aplica un evento → transición validada ──
  _avanzar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const nicho_id = input.nicho || input.nicho_id;
    if (!nicho_id) return this._invalid('nicho');
    const tipo = tipoDeEvento(input.tipo_evento || input.evento);
    if (!tipo) return this._invalid('tipo_evento');

    const res = this._transicion(pid, nicho_id, tipo, input.payload || input.evento_data);
    if (res.status === 200) this._persist.marcarDirty(pid);
    return res;
  }

  // Aplica el evento a la máquina del nicho y devuelve la transición (o rechazo).
  _transicion(pid, nicho_id, tipo, payload = {}) {
    const mapa = this._mapaDe(pid);
    const st = mapa.get(nicho_id);
    if (!st) {
      // Eventos tempranos auto-crean el nicho en SEMILLA, luego aplican.
      if (tipo === 'semilla.capturada' || tipo === 'semilla.normalizada') {
        const nuevo = nichoVacio(pid, nicho_id, payload);
        mapa.set(nicho_id, nuevo);
        return this._aplicarTransicion(pid, nuevo, tipo, payload);
      }
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'nicho no registrado en la máquina; registra la semilla', { nicho: nicho_id });
    }
    return this._aplicarTransicion(pid, st, tipo, payload);
  }

  _aplicarTransicion(pid, st, tipo, payload) {
    const reglas = TRANSICIONES[st.estado];
    if (!reglas) {
      // Estado terminal: no hay más transiciones (EN_CAJA/SANGRA/CORTADO).
      return this._errorResponse(409, 'CONFLICT_STATE', `el nicho ya esta en estado terminal ${st.estado}`, { estado: st.estado });
    }

    // Busca UNA regla que matchee: tipo + predicado.
    for (const [t, pred, destino] of reglas) {
      if (t !== tipo) continue;
      const payloadOk = pred(payload);
      // Para veredicto/gate/cobro, refina el predicado con datos del payload.
      const condExtra = this._condicionExtra(t, payload);
      if (payloadOk && condExtra) {
        const anterior = st.estado;
        st.estado = destino;
        st.etapa_actual = destino;
        st.actualizado_en = new Date().toISOString();
        st.historial.push({ de: anterior, a: destino, evento: tipo, en: new Date().toISOString() });
        this._persist.marcarDirty(pid);
        const data = {
          project_id: pid,
          nicho: st.nicho,
          estado: anterior,
          nuevo_estado: destino,
          evento: tipo,
          transicion_valida: true,
          ciclo_completado: TERMINALES.has(destino)
        };
        if (TERMINALES.has(destino)) {
          this.eventBus?.publish('nichos.pipeline.ciclo_completado', data);
        }
        return { status: 200, data };
      }
    }

    // No hay transición válida desde este estado con este evento → par de fallo.
    return this._errorResponse(422, 'PRECONDITION_FAILED',
      `transicion ilegal: ${st.estado} --(${tipo})--> no es valida (estado ilegal imposible)`,
      { estado: st.estado, evento: tipo, nicho: st.nicho });
  }

  // Condición extra según el tipo de evento (refina el predicado con el payload).
  _condicionExtra(t, p) {
    switch (t) {
      case 'veredicto.emitido':
        // C6 corte DURO: NO_VIABLE → CORTADO; VIABLE/PUENTE → VALIDADO.
        return p && (p.veredicto === 'NO_VIABLE' || p.veredicto === 'VIABLE' || p.veredicto === 'PUENTE');
      case 'gate.solicitado':
      case 'gate.aprobado':
      case 'gate.rechazado':
        // gate APRUEBA → COBRANDO; RECHAZA → OPERANDO_EN_ESPERA.
        return true;
      case 'cobro.ejecutado':
        // E3 EFECTIVO → EN_CAJA; COMPROMETIDO → permanece COBRANDO.
        return p && (p.tipo === 'EFECTIVO' || p.tipo === 'COMPROMETIDO');
      case 'salud.sangra':
        return p && (p.resultado === 'SANGRA');
      default:
        return true;
    }
  }

  // ── orquestación de etapa: qué RPC disparar en cada estado (para scheduler) ──
  _orquestarEtapa(nicho_id) {
    const st = this._mapaDe(this.project_id).get(nicho_id);
    if (!st) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'nicho no en máquina', { nicho: nicho_id });
    // Qué etapa toca según el estado (los consumidores de dominio la ejecutan).
    const guia = {
      [ESTADOS.SEMILLA]: 'normalizacion-semilla.normalizar',
      [ESTADOS.BUSCADO]: 'sondeo-territorio.sondear',
      [ESTADOS.VALIDANDO]: 'veredicto-viabilidad.evaluar',
      [ESTADOS.VALIDADO]: 'camino-encontrar-construir.decidir',
      [ESTADOS.CONSTRUIDO]: 'ensamblador-solucion.construir',
      [ESTADOS.OPERANDO]: 'gate-decision-operar.solicitar',
      [ESTADOS.OPERANDO_EN_ESPERA]: 'gate-decision-operar.solicitar',
      [ESTADOS.COBRANDO]: 'motor-cobro.ejecutar',
      [ESTADOS.EN_CAJA]: 'CICLO_COMPLETADO',
      [ESTADOS.SANGRA]: 'CICLO_COMPLETADO',
      [ESTADOS.CORTADO]: 'CICLO_COMPLETADO'
    };
    return { status: 200, data: { project_id: this.project_id, nicho: st.nicho, estado: st.estado, etapa_siguiente: guia[st.estado] } };
  }

  // ── proyección de lectura ──
  _ver(nicho_id, project_id) {
    const pid = project_id || this.project_id;
    const st = pid ? this._mapaDe(pid).get(nicho_id) : null;
    if (!st) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'nicho no en máquina', { nicho: nicho_id });
    return { status: 200, data: { project_id: pid, nicho: st.nicho, estado: st.estado, etapa_actual: st.etapa_actual, historial: st.historial } };
  }

  // ── Tools ──
  toolAvanzar(params) { return this._avanzar(params); }
  toolRegistrarSemilla(params) { return this._registrarSemilla(params); }
  toolOrquestarEtapa(nicho_id) { return this._orquestarEtapa(nicho_id); }
  toolVer(nicho_id, project_id) { return this._ver(nicho_id, project_id); }
}

module.exports = PipelinePorNicho;
