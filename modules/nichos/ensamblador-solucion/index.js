'use strict';

/**
 * nichos/ensamblador-solucion — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * El mas complejo del bloque D: ensambla una solucion a partir de un
 * veredicto y un camino. Consulta capacidades disponibles en el catalogo,
 * encarga las faltantes, alza puente humano ante bloqueos, y usa LLM
 * (llm.complete.request) para fuzzy matching de requisitos vs capacidades.
 *
 * RPC: nichos.solucion.ensamblar
 *   req: { id_nicho, veredicto, camino }
 *   resp: { solucion | puente_humano_aviso | solicitud_decision }
 *
 * PULSOs:
 *   nichos.construccion.iniciada       { id_proyecto }
 *   nichos.construccion.completada     { id_proyecto, capacidades_creadas[], capacidades_pendientes[] }
 *   nichos.construccion.failed         { id_proyecto, razon_codigo, detalle }
 *
 * Sin estado persistido — micro-agente puro.
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_FUZZY_MATCH = [
  'Eres un analista tecnico de capacidades de software.',
  'Se te da una lista de requisitos de una solucion y una lista de capacidades disponibles.',
  'Cruza requisitos contra capacidades y responde SOLO con un JSON:',
  '{',
  '  "cubiertas": [{"requisito":"<req>","capacidad":"<cap>","confianza":<0.0-1.0>}],',
  '  "faltantes": ["<requisito_sin_capacidad>"],',
  '  "ambiguas": [{"requisito":"<req>","candidatas":["<cap1>","<cap2>"],"razon":"<por_que_ambiguo>"}]',
  '}',
  'Sin explicacion adicional. Solo el JSON.'
].join('\n');

class EnsambladorSolucion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ensamblador-solucion';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject }
  }

  onLoad(context) {
    const r = super.onLoad(context);
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    return r;
  }

  // ── RPC HANDLER ──
  onEnsamblarRequest(e) {
    return this._atender(e, 'ensamblar', 'nichos.solucion.ensamblar.response', d => this._ensamblar(d));
  }

  // ── PROYECCION PRINCIPAL: _ensamblar (monta solucion) ──
  async _ensamblar(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');
    if (!input.veredicto) return this._invalid('veredicto');
    if (!input.camino) return this._invalid('camino');

    const projectId = input.project_id || input.id_proyecto;

    // 1. Emitir pulso de inicio
    this.eventBus?.publish('nichos.construccion.iniciada', {
      id_proyecto: projectId,
      timestamp: nowISO()
    });

    try {
      // 2. Consultar capacidades disponibles
      const catalogoResp = await this._rpc('nichos.catalogo.capacidad.disponibles.request', {
        project_id: projectId
      }, { timeout_ms: 8000 });

      const disponibles = (catalogoResp && catalogoResp.status === 200)
        ? (catalogoResp.data?.capacidades || [])
        : [];

      // 3. Detectar capacidades faltantes via LLM fuzzy match
      const requisitos = this._extraerRequisitos(input.camino);
      const cruce = await this._detectarCapacidadesFaltantes(requisitos, disponibles, projectId);

      const capacidades_creadas = cruce.cubiertas.map(c => c.capacidad);
      const faltantes = cruce.faltantes || [];
      const ambiguas = cruce.ambiguas || [];

      // 4. Si hay ambiguas que no se resuelven, solicitar decision
      if (ambiguas.length > 0 && faltantes.length === 0) {
        return {
          status: 200,
          data: {
            solicitud_decision: {
              tipo: 'CAPACIDADES_AMBIGUAS',
              ambiguas,
              mensaje: 'hay capacidades con match parcial — se necesita decision'
            }
          }
        };
      }

      // 5. Si faltan capacidades, intentar encargar
      const capacidades_pendientes = [];
      if (faltantes.length > 0) {
        const encargoResp = await this._rpc('nichos.catalogo.capacidad.encargar.request', {
          project_id: projectId,
          capacidades: faltantes
        }, { timeout_ms: 10000 });

        if (encargoResp && encargoResp.status === 200) {
          const encargadas = encargoResp.data?.encargadas || [];
          const bloqueadas = encargoResp.data?.bloqueadas || [];

          capacidades_pendientes.push(...encargadas);

          // 6. Si hay bloqueadas, alzar puente humano
          if (bloqueadas.length > 0) {
            await this._alzarPuenteHumano(projectId, bloqueadas);

            this.eventBus?.publish('nichos.construccion.failed', {
              id_proyecto: projectId,
              razon_codigo: 'CAPACIDADES_BLOQUEADAS',
              detalle: `capacidades bloqueadas: ${bloqueadas.join(', ')}`,
              timestamp: nowISO()
            });

            return {
              status: 200,
              data: {
                puente_humano_aviso: {
                  tipo: 'CAPACIDADES_BLOQUEADAS',
                  bloqueadas,
                  mensaje: 'se alzo puente humano — capacidades requieren intervencion'
                }
              }
            };
          }
        } else {
          // Encargo fallo completamente — alzar puente humano
          await this._alzarPuenteHumano(projectId, faltantes);

          this.eventBus?.publish('nichos.construccion.failed', {
            id_proyecto: projectId,
            razon_codigo: 'ENCARGO_FALLIDO',
            detalle: 'no se pudieron encargar capacidades faltantes',
            timestamp: nowISO()
          });

          return {
            status: 200,
            data: {
              puente_humano_aviso: {
                tipo: 'ENCARGO_FALLIDO',
                faltantes,
                mensaje: 'se alzo puente humano — el encargo de capacidades fallo'
              }
            }
          };
        }
      }

      // 7. Emitir pulso de completado
      this.eventBus?.publish('nichos.construccion.completada', {
        id_proyecto: projectId,
        capacidades_creadas,
        capacidades_pendientes,
        timestamp: nowISO()
      });

      return {
        status: 200,
        data: {
          solucion: {
            id_nicho: input.id_nicho,
            veredicto: input.veredicto,
            camino: input.camino,
            capacidades_creadas,
            capacidades_pendientes
          }
        }
      };
    } catch (err) {
      this.eventBus?.publish('nichos.construccion.failed', {
        id_proyecto: projectId,
        razon_codigo: 'ERROR_INTERNO',
        detalle: err.message || 'error al ensamblar solucion',
        timestamp: nowISO()
      });
      return this._errorResponse(
        500,
        'UNKNOWN_ERROR',
        err.message || 'error al ensamblar solucion',
        {}
      );
    }
  }

  // ── PROYECCION: _detectarCapacidadesFaltantes (cruza requisitos vs catalogo) ──
  async _detectarCapacidadesFaltantes(requisitos, disponibles, projectId) {
    if (requisitos.length === 0) {
      return { cubiertas: [], faltantes: [], ambiguas: [] };
    }

    // Usar LLM para fuzzy matching
    const texto = [
      `Requisitos de la solucion: ${JSON.stringify(requisitos)}`,
      `Capacidades disponibles: ${JSON.stringify(disponibles.map(c => c.nombre || c.id || c))}`
    ].join('\n');

    try {
      return await this._pedirAlLLM(texto, projectId);
    } catch (_err) {
      // Fallback sin LLM: match exacto por nombre
      const nombresDisponibles = new Set(disponibles.map(c =>
        (c.nombre || c.id || String(c)).toLowerCase()
      ));
      const cubiertas = [];
      const faltantes = [];
      for (const req of requisitos) {
        if (nombresDisponibles.has(req.toLowerCase())) {
          cubiertas.push({ requisito: req, capacidad: req, confianza: 1.0 });
        } else {
          faltantes.push(req);
        }
      }
      return { cubiertas, faltantes, ambiguas: [] };
    }
  }

  // ── HELPERS ──

  _extraerRequisitos(camino) {
    if (Array.isArray(camino)) return camino;
    if (typeof camino === 'object' && camino.requisitos) return camino.requisitos;
    if (typeof camino === 'object' && camino.pasos) {
      return camino.pasos.map(p => p.capacidad || p.nombre || String(p));
    }
    if (typeof camino === 'string') return [camino];
    return [];
  }

  async _alzarPuenteHumano(projectId, motivo) {
    return this._rpc('nichos.puente.humano.alzar.request', {
      project_id: projectId,
      origen: this.name,
      tipo: 'CAPACIDADES_BLOQUEADAS',
      detalle: Array.isArray(motivo) ? motivo : [motivo],
      timestamp: nowISO()
    }, { timeout_ms: 5000 });
  }

  // =============================================================
  // LLM — fuzzy matching via ai-gateway
  // =============================================================
  _pedirAlLLM(texto, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `ensam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        reject(new Error('timeout esperando respuesta del LLM'));
      }, 30000);

      this._pendientes.set(correlationId, {
        resolve: (resultado) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(resultado);
        },
        reject: (err) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          reject(err);
        }
      });

      this.eventBus?.publish('llm.complete.request', {
        request_id: correlationId,
        project_id: projectId,
        messages: [
          { role: 'system', content: PROMPT_FUZZY_MATCH },
          { role: 'user', content: texto }
        ],
        options: {
          temperature: 0.2,
          max_tokens: 1000
        }
      });
    });
  }

  _onLLMResponse(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.request_id;
    if (!correlationId) return;

    const pendiente = this._pendientes.get(correlationId);
    if (!pendiente) return;

    if (d.error) {
      pendiente.reject(new Error(d.error.message || 'error del LLM'));
      return;
    }

    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      pendiente.resolve({
        cubiertas: Array.isArray(parsed.cubiertas) ? parsed.cubiertas : [],
        faltantes: Array.isArray(parsed.faltantes) ? parsed.faltantes : [],
        ambiguas: Array.isArray(parsed.ambiguas) ? parsed.ambiguas : []
      });
    } catch (_parseErr) {
      pendiente.reject(new Error('LLM no devolvio JSON valido para fuzzy match'));
    }
  }
}

module.exports = EnsambladorSolucion;
