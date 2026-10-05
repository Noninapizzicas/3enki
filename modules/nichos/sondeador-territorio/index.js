'use strict';

/**
 * nichos/sondeador-territorio — MICRO-AGENTE del vertical NICHOS.
 *
 * Sondea un territorio a partir de una semilla normalizada:
 *   1. Consulta reglas de exclusion.
 *   2. Consulta limites del perfil.
 *   3. Consume fuentes externas.
 *   4. Filtra duplicados contra exclusiones.
 *   5. Emite nichos.candidato.detectado por cada candidato valido.
 *   6. Emite nichos.sondeo.completado o nichos.sondeo.failed.
 *
 * Sin estado persistido — micro-agente puro.
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class SondeadorTerritorio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sondeador-territorio';
    this.version = '0.1.0';
  }

  // -- RPC HANDLER --
  onSondearRequest(e) {
    return this._atender(e, 'sondear', 'nichos.territorio.sondear.response', d => this._sondear(d));
  }

  // =============================================================
  // PROYECCION: _sondear
  // =============================================================
  async _sondear(input) {
    if (!input.semilla_normalizada) return this._invalid('semilla_normalizada');

    const projectId = input.project_id;
    const correlationId = input.correlation_id;
    const semilla = input.semilla_normalizada;
    const territorio = semilla.territorio || semilla.nombre || String(semilla);
    const id_nicho = semilla.id_nicho || `sondeo-${Date.now()}`;
    const ts = nowISO();

    try {
      // 1. Consultar reglas de exclusion.
      const exclusiones = await this._consultarExclusiones(projectId);

      // 2. Consultar limites del perfil.
      const limites = await this._consultarLimites(projectId);
      const maxCandidatos = (limites && limites.max_candidatos_por_semilla !== 'ABIERTO')
        ? limites.max_candidatos_por_semilla
        : 50;

      // 3. Consumir fuentes externas.
      const datosCrudos = await this._consumirFuentes(projectId, semilla, territorio);

      if (!datosCrudos || datosCrudos.length === 0) {
        this.eventBus?.publish('nichos.sondeo.failed', {
          id_nicho,
          razon_codigo: 'SIN_DATOS',
          detalle: 'las fuentes no devolvieron datos para este territorio',
          timestamp: ts
        });
        return {
          status: 200,
          data: { candidatos: [], solicitud_decision: null }
        };
      }

      // 4. Filtrar contra exclusiones (dedupe).
      const filtrados = this._dedupeContraExclusion(datosCrudos, exclusiones);

      // 5. Limitar al tope del perfil.
      const candidatos = filtrados.slice(0, maxCandidatos);

      // 6. Emitir pulso por cada candidato detectado.
      for (const c of candidatos) {
        this.eventBus?.publish('nichos.candidato.detectado', {
          id_nicho: c.id_nicho || `${id_nicho}-${candidatos.indexOf(c)}`,
          titulo: c.titulo || c.nombre || territorio,
          territorio,
          senal: c.senal || null,
          evidencia: c.evidencia || [],
          timestamp: ts
        });
      }

      // PULSO: sondeo completado.
      // Lleva `candidatos` + `correlation_id` porque el orquestador
      // (onSondeoCompletado) los exige para disparar el batch de validacion.
      // Sin ellos, la cadena moría aquí (sondeo OK, validacion nunca arrancaba).
      this.eventBus?.publish('nichos.sondeo.completado', {
        id_nicho,
        candidatos_total: candidatos.length,
        candidatos,
        correlation_id: correlationId || null,
        project_id: projectId || null,
        timestamp: ts
      });

      // Si hay candidatos que requieren decision (limites alcanzados).
      if (filtrados.length > maxCandidatos) {
        return {
          status: 200,
          data: {
            candidatos,
            solicitud_decision: {
              tipo: 'limite_candidatos_alcanzado',
              total_disponibles: filtrados.length,
              limite_aplicado: maxCandidatos
            }
          }
        };
      }

      return {
        status: 200,
        data: { candidatos }
      };

    } catch (err) {
      this.eventBus?.publish('nichos.sondeo.failed', {
        id_nicho,
        razon_codigo: 'ERROR_SONDEO',
        detalle: err.message || 'error durante el sondeo del territorio',
        timestamp: ts
      });
      return this._errorResponse(500, 'SONDEO_ERROR', err.message || 'error durante el sondeo');
    }
  }

  // =============================================================
  // PROYECCION: _dedupeContraExclusion
  // =============================================================
  _dedupeContraExclusion(datos, exclusiones) {
    if (!exclusiones || exclusiones.length === 0) return datos;

    const exclusionSet = new Set(
      exclusiones.map(e => (e.patron || e.nombre || e).toString().toLowerCase())
    );

    return datos.filter(d => {
      const clave = (d.titulo || d.nombre || '').toLowerCase();
      // Filtrar si coincide exactamente con alguna exclusion.
      if (exclusionSet.has(clave)) return false;
      // Filtrar si contiene alguna exclusion como subcadena.
      for (const ex of exclusionSet) {
        if (clave.includes(ex)) return false;
      }
      return true;
    });
  }

  // =============================================================
  // Consultas al bus
  // =============================================================
  async _consultarExclusiones(projectId) {
    const resp = await this._rpc('nichos.reglas.exclusion.consultar.request', {
      project_id: projectId
    }, { timeout_ms: 5000 });
    return (resp && resp.data && Array.isArray(resp.data.exclusiones))
      ? resp.data.exclusiones
      : [];
  }

  async _consultarLimites(projectId) {
    const resp = await this._rpc('nichos.perfil.limite.leer.request', {
      project_id: projectId
    }, { timeout_ms: 5000 });
    return (resp && resp.data && resp.data.perfil_limite && resp.data.perfil_limite.limites)
      ? resp.data.perfil_limite.limites
      : null;
  }

  async _consumirFuentes(projectId, semilla, territorio) {
    const resp = await this._rpc('nichos.fuente.consumir.request', {
      project_id: projectId,
      semilla,
      territorio
    }, { timeout_ms: 20000 });
    return (resp && resp.data && Array.isArray(resp.data.resultados))
      ? resp.data.resultados
      : [];
  }
}

module.exports = SondeadorTerritorio;
