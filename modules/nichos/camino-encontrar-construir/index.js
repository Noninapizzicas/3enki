'use strict';

/**
 * nichos/camino-encontrar-construir — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Decide el camino ENCONTRAR o CONSTRUIR para un nicho viable. Cruza informe
 * y veredicto con el catalogo de capacidades disponibles. Si existen
 * capacidades que encajan → ENCONTRAR. Si no → CONSTRUIR. Si ambiguo →
 * solicitud de decision al dueno.
 *
 * Sin estado persistido — micro-agente puro (request → catalogo → decision).
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const TIPOS_CAMINO = ['ENCONTRAR', 'CONSTRUIR'];

class CaminoEncontrarConstruir extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'camino-encontrar-construir';
    this.version = '0.1.0';
    this._pendientes = new Map();
  }

  onLoad() {
    this.eventBus?.subscribe('nichos.catalogo.capacidad.disponibles.response', (e) => this._onCatalogoResponse(e));
    return super.onLoad ? super.onLoad() : undefined;
  }

  // ── RPC HANDLER ──
  onDecidirRequest(e) {
    return this._atender(e, 'decidir', 'nichos.camino.decidir.response', d => this._decidir(d));
  }

  // ── PROYECCION: _decidir (cruza informe/veredicto con catalogo) ──
  async _decidir(input) {
    if (!input.informe) return this._invalid('informe');
    if (!input.veredicto) return this._invalid('veredicto');

    const projectId = input.project_id;
    const idNicho = input.informe.id_nicho || input.id_nicho || 'sin-id';

    try {
      // 1. Consultar catalogo de capacidades disponibles
      const capacidades = await this._consultarCatalogo(input.informe, projectId);

      // 2. Decidir camino
      const hayCapacidades = Array.isArray(capacidades) && capacidades.length > 0;
      const cobertura = hayCapacidades
        ? this._evaluarCobertura(capacidades, input.informe)
        : { nivel: 'NINGUNA', detalle: 'sin capacidades en catalogo' };

      if (cobertura.nivel === 'TOTAL' || cobertura.nivel === 'ALTA') {
        // Capacidades existentes cubren la necesidad → ENCONTRAR
        this.eventBus?.publish('nichos.camino.decidido', {
          id_nicho: idNicho,
          tipo: 'ENCONTRAR',
          timestamp: nowISO()
        });
        return {
          status: 200,
          data: {
            camino: {
              tipo: 'ENCONTRAR',
              capacidades_encontradas: capacidades,
              cobertura: cobertura.nivel
            }
          }
        };
      }

      if (cobertura.nivel === 'NINGUNA') {
        // Sin capacidades → CONSTRUIR
        this.eventBus?.publish('nichos.camino.decidido', {
          id_nicho: idNicho,
          tipo: 'CONSTRUIR',
          timestamp: nowISO()
        });
        return {
          status: 200,
          data: {
            camino: {
              tipo: 'CONSTRUIR',
              razon: cobertura.detalle
            }
          }
        };
      }

      // Cobertura PARCIAL → solicitud de decision al dueno
      this.eventBus?.publish('nichos.decision.solicitud.abierta', {
        id_nicho: idNicho,
        razon: `Cobertura parcial (${cobertura.nivel}): ${cobertura.detalle}`,
        opciones: TIPOS_CAMINO,
        timestamp: nowISO()
      });

      return {
        status: 200,
        data: {
          solicitud_decision: {
            razon: `Cobertura parcial: ${cobertura.detalle}`,
            opciones: TIPOS_CAMINO,
            capacidades_parciales: capacidades
          }
        }
      };
    } catch (err) {
      return this._errorResponse(502, 'ERROR_CAMINO', err.message || 'error al decidir camino', {});
    }
  }

  // ── Evaluar cobertura de capacidades contra informe ──
  _evaluarCobertura(capacidades, informe) {
    if (!capacidades || capacidades.length === 0) {
      return { nivel: 'NINGUNA', detalle: 'sin capacidades en catalogo' };
    }

    const totalRequeridas = informe.requisitos?.length || 1;
    const cubiertas = capacidades.filter(c => c.activa !== false).length;
    const ratio = cubiertas / totalRequeridas;

    if (ratio >= 0.8) return { nivel: 'TOTAL', detalle: `${cubiertas}/${totalRequeridas} requisitos cubiertos` };
    if (ratio >= 0.4) return { nivel: 'PARCIAL', detalle: `${cubiertas}/${totalRequeridas} requisitos cubiertos` };
    return { nivel: 'NINGUNA', detalle: `${cubiertas}/${totalRequeridas} requisitos cubiertos — insuficiente` };
  }

  // =============================================================
  // BUS — consultar catalogo de capacidades
  // =============================================================
  _consultarCatalogo(informe, projectId) {
    return new Promise((resolve) => {
      const correlationId = `cec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        resolve([]); // sin respuesta → asumir sin capacidades
      }, 15000);

      this._pendientes.set(correlationId, {
        resolve: (data) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(data);
        }
      });

      this.eventBus?.publish('nichos.catalogo.capacidad.disponibles.request', {
        request_id: correlationId,
        project_id: projectId,
        criterios: {
          dominio: informe.dominio || informe.id_nicho || null,
          demanda: informe.demanda_1er_orden || null
        }
      });
    });
  }

  _onCatalogoResponse(e) {
    const d = (e && (e.data || e)) || {};
    const pendiente = this._pendientes.get(d.request_id);
    if (!pendiente) return;
    pendiente.resolve(d.data?.capacidades || d.data || []);
  }
}

module.exports = CaminoEncontrarConstruir;
