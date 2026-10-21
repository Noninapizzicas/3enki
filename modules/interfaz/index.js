/**
 * interfaz — PUENTE entre el dueño (chat Hermes) y el dominio del radar (HOJA 6).
 *
 * Contrato (plan-construccion.md HOJA 6): la superficie de dominio del dueño.
 *   listar             → vista de candidatos con estado (vía banco.listar.request)
 *   ver                → ficha completa transparente (M11, vía evaluador.ficha.request)
 *   confirmar_veredicto→ la voz del dueño (M11): emite interfaz.veredicto_confirmado,
 *                        el banco aplica (sella PASA o revierte a RECHAZADO)
 *   anadir_manual      → candidato a mano (fuente 'manual') → banco.anadir.request
 *   corregir_ficha     → M10: el dueño aporta el dato que faltaba → banco.corregir_ficha.request
 *                        (EN_OBSERVACION → EN_EVALUACION) + re-evaluación inmediata
 *
 * FORMA: HÍBRIDO — el reflejo hace los 5 RPC deterministas (este fichero); el cajón
 * del blueprint (interfaz.blueprint.json) interpreta la intención libre del chat
 * (interfaz.intencion.request, anti-colisión: solo en el blueprint) y delega aquí.
 * Sin estado propio: no persiste, no registra interruptor (cero egress externo).
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const CONFIRMACIONES = Object.freeze(['PASA', 'NO_PASA']);

class InterfazReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'interfaz';
    this.version = 'reflejo-0.1.0';
  }

  // ── Handlers RPC ──
  onListarRequest(e)           { return this._atender(e, 'listar', 'interfaz.listar.response', (d) => this._listar(d)); }
  onVerRequest(e)              { return this._atender(e, 'ver', 'interfaz.ver.response', (d) => this._ver(d)); }
  onConfirmarVeredictoRequest(e) { return this._atender(e, 'confirmar_veredicto', 'interfaz.confirmar_veredicto.response', (d) => this._confirmarVeredicto(d)); }
  onAnadirManualRequest(e)     { return this._atender(e, 'anadir_manual', 'interfaz.anadir_manual.response', (d) => this._anadirManual(d)); }
  onCorregirFichaRequest(e)    { return this._atender(e, 'corregir_ficha', 'interfaz.corregir_ficha.response', (d) => this._corregirFicha(d)); }

  // ── PROYECCIONES (puente → RPC del dominio) ──

  // _listar: vista de candidatos con estado (el dueño ve el tablero).
  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const r = await this._rpc('banco.listar.request', { project_id: input.project_id, estado: input.estado });
    if (!r) return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE', 'banco no respondió a banco.listar.request');
    if (r.status !== 200) return this._traducirError(r, 'banco.listar.request');
    return { status: 200, data: { candidatos: r.data.candidatos, total: r.data.total } };
  }

  // _ver: ficha completa vía evaluador.ficha.request (M11 — el dueño ve TODO).
  async _ver(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.candidatoId) return this._invalid('candidatoId');
    const r = await this._rpc('evaluador.ficha.request', { project_id: input.project_id, candidatoId: input.candidatoId });
    if (!r) return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE', 'evaluador no respondió a evaluador.ficha.request');
    if (r.status !== 200) return this._traducirError(r, 'evaluador.ficha.request');
    return { status: 200, data: { candidato: r.data.candidato, detallePorCriterio: r.data.detallePorCriterio } };
  }

  // _confirmarVeredicto (M11): la decisión final es del dueño. Emite el evento de
  // dominio; el banco (único escritor del estado) aplica la transición. Todo fallo
  // de validación emite el par canónico interfaz.confirmar_veredicto.failed.
  async _confirmarVeredicto(input) {
    const err = this._validarConfirmacion(input);
    if (err) {
      this._emitirConfirmacionFailed(input, err.error.code, err.error.message, err.error.details);
      return err;
    }

    const payload = { project_id: input.project_id, candidatoId: input.candidatoId, confirmacion: input.confirmacion };
    this._publicarEvento('interfaz.veredicto_confirmado', payload);
    return { status: 200, data: { confirmado: true, candidatoId: input.candidatoId, confirmacion: input.confirmacion, aplicado_por: 'banco' } };
  }

  // Guarda de la confirmación (M11): project_id, candidatoId y confirmacion ∈ {PASA, NO_PASA}.
  _validarConfirmacion(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.candidatoId) return this._invalid('candidatoId');
    if (!input.confirmacion) return this._invalid('confirmacion');
    if (!CONFIRMACIONES.includes(input.confirmacion)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'confirmacion debe ser PASA o NO_PASA', { field: 'confirmacion' });
    }
    return null;
  }

  // Par de fallo canónico del flujo confirmar (contrato §5.2).
  _emitirConfirmacionFailed(input, code, message, details) {
    this._publicarEvento('interfaz.confirmar_veredicto.failed', {
      project_id: input.project_id,
      candidatoId: input.candidatoId,
      code,
      message,
      details
    });
  }

  // _anadirManual: candidato a mano del dueño (fuente 'manual') → banco.anadir.request.
  async _anadirManual(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.titulo) return this._invalid('titulo');
    const url = input.url
      || `manual://${String(input.titulo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const r = await this._rpc('banco.anadir.request', {
      project_id: input.project_id,
      titulo: input.titulo,
      fuente: input.fuente || 'manual',
      url,
      sector: input.sector,
      ficha: input.ficha
    });
    if (!r) return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE', 'banco no respondió a banco.anadir.request');
    if (r.status !== 201 && r.status !== 200) return this._traducirError(r, 'banco.anadir.request');

    const candidato = (r.data.añadidos && r.data.añadidos[0]) || null;
    if (!candidato) {
      return this._errorResponse(409, 'CONFLICT_STATE', 'candidato_ya_existente_o_incompleto', {
        añadidos: r.data.añadidos, duplicados: r.data.duplicados
      });
    }
    this._publicarEvento('interfaz.candidato_manual_anadido', { project_id: input.project_id, candidato });
    return { status: 201, data: { candidato } };
  }

  // _corregirFicha (M10): el dueño aporta el dato que faltaba. El banco aplica la
  // transición (EN_OBSERVACION → EN_EVALUACION) y se re-evalúa de inmediato.
  async _corregirFicha(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.candidatoId) return this._invalid('candidatoId');
    if (!input.ficha || typeof input.ficha !== 'object') return this._invalid('ficha');

    const r = await this._rpc('banco.corregir_ficha.request', {
      project_id: input.project_id, id: input.candidatoId, ficha: input.ficha
    });
    if (!r) return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE', 'banco no respondió a banco.corregir_ficha.request');
    if (r.status !== 200) return this._traducirError(r, 'banco.corregir_ficha.request');

    // Re-evaluación inmediata: el evaluador emite el veredicto, el banco lo aplica.
    const ev = await this._rpc('evaluador.evaluar.request', { project_id: input.project_id, candidatoId: input.candidatoId });
    if (!ev || ev.status !== 200) {
      return {
        status: 200,
        data: {
          candidato: r.data.candidato,
          re_evaluacion: { pendiente: true, motivo: 'evaluador no respondió; se re-evaluará en el próximo ciclo' }
        }
      };
    }
    return {
      status: 200,
      data: {
        candidato: r.data.candidato,
        veredicto: ev.data.veredicto,
        detalle: ev.data.detalle,
        criterios_faltantes: ev.data.criterios_faltantes || []
      }
    };
  }

  // Traducción del error canónico de las dependencias (banco/evaluador comparten el
  // esquema {status, error:{code,message,details}}).
  _traducirError(r, origen) {
    const err = (r && r.error) || {};
    return this._errorResponse(r.status || 502, err.code || 'UPSTREAM_ERROR', err.message || `${origen} falló`, err.details);
  }

  _publicarEvento(evento, payload) {
    this.eventBus?.publish(evento, payload);
  }
}

module.exports = InterfazReflejo;