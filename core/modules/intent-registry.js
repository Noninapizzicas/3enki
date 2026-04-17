/**
 * Intent Registry
 *
 * Construido al arrancar leyendo el campo "intents" de cada module.json.
 * Mapea keywords → { módulo, acción, tool/agente }.
 *
 * El Conversation Router consulta este registry para decidir si un mensaje
 * tiene alta confianza (actuar directo) o baja confianza (pasar al LLM).
 *
 * Scoring:
 *   score >= 10  → HIGH   — actuar directamente
 *   score >= 5   → MEDIUM — actuar pero con menor certeza
 *   score < 5    → LOW    — pasar al LLM para clasificar
 */

class IntentRegistry {
  constructor(logger) {
    this.logger = logger || null;
    // Array plano de todos los intents registrados
    // { module, keywords[], action, tool?, agent?, multi_turn?, description }
    this.intents = [];
  }

  // ==========================================
  // Registration
  // ==========================================

  register(moduleName, intents) {
    if (!Array.isArray(intents) || intents.length === 0) return;

    for (const intent of intents) {
      if (!intent.keywords || !intent.action) {
        if (this.logger) {
          this.logger.warn('intent-registry.intent.invalid', {
            module: moduleName,
            reason: 'missing keywords or action'
          });
        }
        continue;
      }

      this.intents.push({
        module: moduleName,
        keywords: intent.keywords.map(k => k.toLowerCase()),
        action: intent.action,           // 'tool_call' | 'agent'
        tool: intent.tool || null,
        agent: intent.agent || null,
        multi_turn: intent.multi_turn || false,
        description: intent.description || ''
      });
    }

    if (this.logger) {
      this.logger.info('intent-registry.registered', {
        module: moduleName,
        count: intents.length
      });
    }
  }

  unregister(moduleName) {
    const before = this.intents.length;
    this.intents = this.intents.filter(i => i.module !== moduleName);
    const removed = before - this.intents.length;

    if (this.logger && removed > 0) {
      this.logger.info('intent-registry.unregistered', {
        module: moduleName,
        count: removed
      });
    }
  }

  // ==========================================
  // Matching
  // ==========================================

  /**
   * Busca el intent más probable para un mensaje.
   *
   * @param {string} message - Mensaje del usuario (texto libre)
   * @returns {{ intent, confidence, level } | null}
   *   intent     — el objeto intent completo
   *   confidence — score numérico
   *   level      — 'high' | 'medium' | 'low'
   */
  match(message) {
    if (!message || typeof message !== 'string') return null;

    const normalized = message.toLowerCase().trim();
    const matches = [];

    for (const intent of this.intents) {
      const score = this._score(normalized, intent.keywords);
      if (score > 0) {
        matches.push({ intent, confidence: score });
      }
    }

    if (matches.length === 0) return null;

    // Mejor match
    matches.sort((a, b) => b.confidence - a.confidence);
    const best = matches[0];

    return {
      intent: best.intent,
      confidence: best.confidence,
      level: best.confidence >= 10 ? 'high' : best.confidence >= 5 ? 'medium' : 'low'
    };
  }

  /**
   * Devuelve todos los matches ordenados por confianza.
   * Útil para debug y para el LLM cuando necesita contexto de candidatos.
   *
   * @param {string} message
   * @returns {Array<{ intent, confidence, level }>}
   */
  matchAll(message) {
    if (!message || typeof message !== 'string') return [];

    const normalized = message.toLowerCase().trim();
    const matches = [];

    for (const intent of this.intents) {
      const score = this._score(normalized, intent.keywords);
      if (score > 0) {
        matches.push({
          intent,
          confidence: score,
          level: score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low'
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Scoring: suma de longitudes de keywords encontradas.
   * Keywords más largas y específicas puntúan más que keywords cortas.
   *
   * @param {string} message - Mensaje normalizado (lowercase)
   * @param {string[]} keywords - Keywords del intent (lowercase)
   * @returns {number} Score >= 0
   */
  _score(message, keywords) {
    let score = 0;
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        // Keyword más larga = más específica = más puntos
        score += keyword.length;
      }
    }
    return score;
  }

  // ==========================================
  // Consulta
  // ==========================================

  getAll() {
    return [...this.intents];
  }

  getByModule(moduleName) {
    return this.intents.filter(i => i.module === moduleName);
  }

  getStats() {
    const byModule = {};
    for (const intent of this.intents) {
      byModule[intent.module] = (byModule[intent.module] || 0) + 1;
    }
    return {
      total: this.intents.length,
      by_module: byModule
    };
  }
}

module.exports = IntentRegistry;
