'use strict';

/**
 * nichos/estudio-demanda — REFLEJO JS (MICRO-AGENTE del vertical NICHOS).
 *
 * Estudia la demanda de primer orden de un candidato a nicho. Consulta fuentes
 * externas por bus (nichos.fuente.consumir.request), pre-chequea limites
 * (nichos.fuente.limites.puede.consumir.request) y usa ai-gateway
 * (llm.complete.request) para sintetizar el informe.
 *
 * Sin estado persistido — micro-agente puro (request → fuentes + LLM → response).
 * Patron: ModuloHibridoReflejo.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const PROMPT_SISTEMA = [
  'Eres un analista de demanda de mercado para nichos de negocio.',
  'Recibes datos de fuentes externas sobre un candidato a nicho y debes sintetizar un informe.',
  '',
  'Tu informe DEBE contener exactamente estos campos en JSON:',
  '{',
  '  "demanda_1er_orden": "<descripcion concisa de la demanda primaria detectada>",',
  '  "disposicion_a_pagar": "<alta|media|baja|desconocida — con justificacion breve>"',
  '}',
  '',
  'Basa tu analisis SOLO en los datos proporcionados. Si los datos son insuficientes,',
  'indica "desconocida" en disposicion_a_pagar y describe lo que se pudo inferir.',
  'Responde SOLO con el JSON, sin texto adicional.'
].join('\n');

class EstudioDemanda extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estudio-demanda';
    this.version = '0.1.0';
    this._pendientes = new Map(); // correlation_id → { resolve, reject, context }
  }
  async onLoad(context) {
    // OJO: this.eventBus lo asigna super.onLoad. Suscribir ANTES deja
    // this.eventBus undefined y el optional-chaining traga las suscripciones
    // EN SILENCIO → el modulo pedia al LLM/fuentes y nunca oia la respuesta
    // (→ timeout de 60s y nichos.estudio.demanda.failed).
    await super.onLoad(context);
    this.eventBus?.subscribe('llm.complete.response', (e) => this._onLLMResponse(e));
    this.eventBus?.subscribe('nichos.fuente.consumir.response', (e) => this._onFuenteResponse(e));
    this.eventBus?.subscribe('nichos.fuente.limites.puede.consumir.response', (e) => this._onLimitesResponse(e));
  }

  // ── RPC HANDLER ──
  onEstudiarRequest(e) {
    return this._atender(e, 'estudiar', 'nichos.demanda.estudiar.response', d => this._estudiar(d));
  }

  // ── PROYECCION: _estudiar (ensambla informe) ──
  async _estudiar(input) {
    if (!input.candidato) return this._invalid('candidato');

    const projectId = input.project_id;
    const idNicho = input.candidato.id || input.candidato.nombre || 'sin-id';
    const correlacion = input.correlacion || input.request_id;
    const fuentesUsadas = [];
    let costeTotal = 0;

    try {
      // 1. Pre-check limites
      const puedeConsumir = await this._preguntarLimites(projectId);
      if (!puedeConsumir.permitido) {
        this.eventBus?.publish('nichos.estudio.demanda.failed', {
          id_nicho: idNicho,
          razon_codigo: 'LIMITE_ALCANZADO',
          detalle: puedeConsumir.razon || 'limites de fuentes alcanzados',
          timestamp: nowISO()
        });
        return this._errorResponse(429, 'LIMITE_ALCANZADO', puedeConsumir.razon || 'limites de fuentes alcanzados', {});
      }

      // 2. Consumir fuentes
      const datosFuentes = await this._consumirFuentes(input.candidato, projectId);
      for (const f of datosFuentes) {
        fuentesUsadas.push(f.fuente);
        costeTotal += f.coste || 0;
      }

      // 3. Pedir al LLM que sintetice
      // El consumidor de fuentes devuelve el dato homogeneo en `contenido`
      // (y a veces `resumen`/`titulo`), no en `datos`. Leer solo `datos`
      // mandaba al LLM 10 fuentes como "sin datos" → informe ciego.
      const textoFuentes = datosFuentes.map(f =>
        `[Fuente: ${f.fuente || f.origen || 'fuente'}] ${f.url ? `(${f.url})` : ''}\n${f.datos || f.contenido || f.resumen || f.titulo || 'sin datos'}`
      ).join('\n\n');

      const analisis = await this._pedirAlLLM(input.candidato, textoFuentes, projectId);

      // 4. Agregar coste
      const informe = {
        demanda_1er_orden: analisis.demanda_1er_orden || 'no determinada',
        disposicion_a_pagar: analisis.disposicion_a_pagar || 'desconocida',
        fuentes_usadas: fuentesUsadas,
        coste: this._coste(costeTotal)
      };

      this.eventBus?.publish('nichos.estudio.demanda.completado', {
        id_nicho: idNicho,
        demanda_1er_orden: informe.demanda_1er_orden,
        disposicion_a_pagar: informe.disposicion_a_pagar,
        fuentes_usadas: informe.fuentes_usadas,
        coste: informe.coste,
        timestamp: nowISO()
      });

      return { status: 200, data: { informe } };
    } catch (err) {
      this.eventBus?.publish('nichos.estudio.demanda.failed', {
        id_nicho: idNicho,
        razon_codigo: 'ERROR_ESTUDIO',
        detalle: err.message || 'error al estudiar demanda',
        timestamp: nowISO()
      });
      return this._errorResponse(502, 'ERROR_ESTUDIO', err.message || 'error al estudiar demanda', {});
    }
  }

  // ── PROYECCION: _coste (agrega coste imputable) ──
  _coste(total) {
    return {
      total: Math.round(total * 10000) / 10000,
      moneda: 'EUR',
      timestamp: nowISO()
    };
  }

  // =============================================================
  // BUS — pre-check de limites
  // =============================================================
  _preguntarLimites(projectId) {
    return new Promise((resolve) => {
      const correlationId = `edl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        resolve({ permitido: true }); // degradacion honesta: sin respuesta → permitir
      }, 10000);

      this._pendientes.set(correlationId, {
        tipo: 'limites',
        resolve: (data) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(data);
        }
      });

      this.eventBus?.publish('nichos.fuente.limites.puede.consumir.request', {
        request_id: correlationId,
        project_id: projectId
      });
    });
  }

  _onLimitesResponse(e) {
    const d = (e && (e.data || e)) || {};
    const pendiente = this._pendientes.get(d.request_id);
    if (!pendiente || pendiente.tipo !== 'limites') return;
    pendiente.resolve({
      permitido: d.data?.permitido !== false,
      razon: d.data?.razon || null
    });
  }

  // =============================================================
  // BUS — consumir fuentes
  // =============================================================
  _consumirFuentes(candidato, projectId) {
    return new Promise((resolve) => {
      const correlationId = `edf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        resolve([]); // sin respuesta → continuar sin datos de fuente
      }, 30000);

      this._pendientes.set(correlationId, {
        tipo: 'fuente',
        resolve: (data) => {
          clearTimeout(timeout);
          this._pendientes.delete(correlationId);
          resolve(Array.isArray(data) ? data : [data]);
        }
      });

      this.eventBus?.publish('nichos.fuente.consumir.request', {
        request_id: correlationId,
        project_id: projectId,
        query: candidato.nombre || candidato.descripcion || JSON.stringify(candidato),
        candidato
      });
    });
  }

  _onFuenteResponse(e) {
    const d = (e && (e.data || e)) || {};
    const pendiente = this._pendientes.get(d.request_id);
    if (!pendiente || pendiente.tipo !== 'fuente') return;
    pendiente.resolve(d.data?.resultados || d.data || []);
  }

  // =============================================================
  // LLM — pide sintesis via ai-gateway
  // =============================================================
  _pedirAlLLM(candidato, textoFuentes, projectId) {
    return new Promise((resolve, reject) => {
      const correlationId = `eda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this._pendientes.delete(correlationId);
        reject(new Error('timeout esperando respuesta del LLM'));
      }, 60000);

      this._pendientes.set(correlationId, {
        tipo: 'llm',
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

      const userContent = [
        `Candidato a nicho: ${candidato.nombre || JSON.stringify(candidato)}`,
        '',
        'Datos de fuentes:',
        textoFuentes || '(sin datos de fuentes externas disponibles)'
      ].join('\n');

      this.eventBus?.publish('llm.complete.request', {
        request_id: correlationId,
        project_id: projectId,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: userContent }
        ],
        options: {
          temperature: 0.2,
          max_tokens: 500
        }
      });
    });
  }

  _onLLMResponse(e) {
    const d = (e && (e.data || e)) || {};
    const correlationId = d.request_id;
    if (!correlationId) return;

    const pendiente = this._pendientes.get(correlationId);
    if (!pendiente || pendiente.tipo !== 'llm') return;

    if (d.error) {
      pendiente.reject(new Error(d.error.message || 'error del LLM'));
      return;
    }

    const contenido = (d.content || d.text || '').trim();
    try {
      const parsed = JSON.parse(contenido);
      pendiente.resolve({
        demanda_1er_orden: parsed.demanda_1er_orden || 'no determinada',
        disposicion_a_pagar: parsed.disposicion_a_pagar || 'desconocida'
      });
    } catch (_parseErr) {
      pendiente.resolve({
        demanda_1er_orden: contenido || 'no determinada',
        disposicion_a_pagar: 'desconocida'
      });
    }
  }
}

module.exports = EstudioDemanda;
