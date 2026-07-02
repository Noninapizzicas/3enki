'use strict';

/**
 * planificador — REFLEJO JS (mitad determinista del planificador de proyecto).
 *
 * Gemelo goal-driven del conserje-cantera: el conserje ofrece 1 skill por lo que
 * TOCASTE (reactivo); planificador ensambla el SET por lo que QUIERES (proactivo).
 * Declaras un proyecto → el blueprint (LLM) lo DESCOMPONE en capacidades, busca en la
 * cantera (cosecha.buscar) y elige; este reflejo pone las dos mitades deterministas:
 *
 *   VALIDAR  (_validar)   el FRENO computable de completitud — la mitad-LEY:
 *       · no_silent_drops : cada capacidad tiene entrada (skill o hueco); ninguna se cae callada.
 *       · no_alucinadas   : cada skill elegida EXISTE en el catálogo (contra cosecha.listar).
 *       · cobertura       : |capacidades con skill válido| / |capacidades|.
 *     (La otra mitad del freno —¿la DESCOMPOSICIÓN fue completa?— es irreducible: la juzga
 *      el crítico LLM del blueprint. El reflejo no puede; el LLM no es de fiar para "existe".)
 *
 *   GUARDAR  (_ensamblar) promueve el set elegido (cosecha.promover ×N) — modo ensamblar.
 *
 * INVARIANTE (P0): el plan nace FÉRTIL — nombra los huecos, no los esconde. Un hueco es
 * el siguiente paso (qué cosechar), jamás una mentira de cobertura.
 * Ver arquitectura/decisiones/propuestas/planificador.md.
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class PlanificadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'planificador';
    this.version = '0.1.0';
  }

  onValidarRequest(e)   { return this._atender(e, 'validar',   'planificador.validar.response',   d => this._validar(d)); }
  onEnsamblarRequest(e) { return this._atender(e, 'ensamblar', 'planificador.ensamblar.response', d => this._ensamblar(d)); }

  // ── VALIDAR: el freno computable de completitud. No juzga si el proyecto está bien
  // descompuesto (eso es fuzzy, lo hace el crítico LLM); juzga la INTEGRIDAD del set:
  // nada se cae callado, ninguna skill es inventada, y cuánto se cubre de verdad. ──
  async _validar({ proyecto, capacidades = [], elegidas = [] } = {}) {
    if (!proyecto || typeof proyecto !== 'string') return this._invalid('proyecto');
    if (!Array.isArray(capacidades) || capacidades.length === 0) return this._invalid('capacidades');
    if (!Array.isArray(elegidas)) return this._invalid('elegidas');

    // catálogo de nombres válidos (para cazar alucinadas). Reutiliza la cantera.
    const cat = await this._rpc('cosecha.listar.request', {});
    const validos = new Set(
      (cat && cat.data && Array.isArray(cat.data.skills) ? cat.data.skills : []).map(s => s.nombre)
    );

    const porCap = new Map();
    for (const e of elegidas) if (e && e.capacidad) porCap.set(String(e.capacidad), e);

    const drops = [];        // capacidad sin entrada en elegidas → se cayó callada
    const alucinadas = [];   // skill elegida que NO existe en el catálogo
    const huecos = [];       // capacidad sin skill → hueco honesto (señal de qué cosechar)
    let cubiertas = 0;

    for (const cap of capacidades) {
      const e = porCap.get(String(cap));
      if (!e) { drops.push(cap); continue; }
      const nombre = e.skill || null;
      if (!nombre) { huecos.push(cap); continue; }
      if (!validos.has(nombre)) { alucinadas.push({ capacidad: cap, skill: nombre }); continue; }
      cubiertas++;
    }

    const total = capacidades.length;
    const cobertura = total ? Math.round((cubiertas / total) * 100) / 100 : 0;
    const valido = drops.length === 0 && alucinadas.length === 0;   // huecos NO invalidan: son honestos
    return { status: 200, data: { valido, cobertura, cubiertas, total, huecos, drops, alucinadas } };
  }

  // ── GUARDAR: ensambla el set — promueve cada skill elegida (cosecha.promover). El
  // dominio/tarea los resuelve promover desde el HOGAR de cada skill; aquí solo el nombre. ──
  async _ensamblar({ skills = [] } = {}) {
    if (!Array.isArray(skills) || skills.length === 0) return this._invalid('skills');
    const promovidas = [];
    const fallidas = [];
    for (const s of skills) {
      const nombre = typeof s === 'string' ? s : (s && s.nombre);
      if (!nombre) { fallidas.push({ nombre: null, motivo: 'sin nombre' }); continue; }
      const payload = { nombre };
      if (s && s.dominio) payload.dominio = s.dominio;
      if (s && s.tarea) payload.tarea = s.tarea;
      const r = await this._rpc('cosecha.promover.request', payload);
      if (r && r.status === 200) promovidas.push(nombre);
      else fallidas.push({ nombre, motivo: (r && r.error && r.error.code) || 'sin respuesta' });
    }
    return { status: 200, data: { promovidas, fallidas, total: skills.length } };
  }
}

module.exports = PlanificadorReflejo;
