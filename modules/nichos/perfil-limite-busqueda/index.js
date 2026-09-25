/**
 * nichos/perfil-limite-busqueda — CUSTODIO CON PERSISTENCIA (B3, hoja del plan).
 *
 * Guarda los LIMITES DECLARABLES del dueño para la BUSQUEDA de nichos: alcance,
 * exclusiones de partida, profundidad de barrido, limites de territorio/candidatos
 * y las reglas fijas que el dueño decide. Es el STORE de configuracion de limites
 * de busqueda POR PROYECTO que el buscador consume.
 *
 * CUSTODIO (patrón real, distinto del reflejo stateless): un solo escritor — el
 * DUEÑO — via el guard de rol en _declarar. La lectura (_leer) no muta. La
 * escritura (_declarar) valida y guarda. Persiste por proyecto con PosPersistencia
 * (storage /prisma/nichos/perfil-limite-busqueda.json), restaura en
 * project.activated y vuelca en onUnload. Emisor/par de fallo en errores.
 *
 * Ver arquitectura/decisiones/propuestas/prisma.md y hoja B3 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor — el DUEÑO. El buscador y el resto son solo lectores.
const ROL_DUENYO = 'DUEÑO';

// Shape base de los límites declarables. El dueño puede declarar todo o un subset;
// cada campo se valida y normaliza sobre este molde.
function limitesVacios() {
  return {
    esquema: 'nichos-limites-busqueda-v1',
    alcance: null,                 // { geografia, mercado } — ámbito de la búsqueda
    exclusions_base: [],           // [String] — qué NO buscar de partida
    profundidad: null,             // 1|2|3 — profundidad de barrido por territorio
    max_territorios: null,         // { number } — tope de territorios por corrida
    max_candidatos: null,          // { number } — tope de candidatos por territorio
    limite_consulta_fuente: null, // { number } — cuota de consultas por fuente
    reglas: [],                    // [{ tipo, valor, motivo }] — reglas fijas del dueño
    updated_at: null,
    declarado_por: null
  };
}

const PROFUNDIDADES = new Set([1, 2, 3]);
const TIPOS_REGLA = new Set(['producto', 'audiencia', 'territorio', 'fuente', 'profundidad']);

// Normalizador de un número entero positivo (o null si no trae valor).
function numPos(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

class PerfilLimiteBusqueda extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-limite-busqueda';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> objeto de límites (un solo estado por proyecto)
    this._limites = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-limite-busqueda.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const l = this._limites.get(pid);
        return l ? { project_id: pid, limites: l } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.limites) this._limites.set(pid, data.limites);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el perfil del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.limite.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.limite.declarar.response', async (d) => {
      const res = await this._declarar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.limite.declarado', {
          project_id: res.data.project_id,
          limites: res.data.limites,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.limite.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyección de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let l = this._limites.get(pid);
    if (!l) {
      l = limitesVacios();
      this._limites.set(pid, l);
      this._persist.marcarDirty(pid);
    }
    return l;
  }

  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const l = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, limites: l } };
  }

  // ── proyección de escritura (el único escritor: DUEÑO) ──
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el DUEÑO puede declarar límites.
    if (input.rol !== ROL_DUENYO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUEÑO puede declarar los límites de búsqueda', {
        rol_esperado: ROL_DUENYO, rol_recibido: input.rol
      });
    }

    const limite = input.limites;
    if (!limite || typeof limite !== 'object') {
      return this._invalid('limites');
    }

    const actual = limitesVacios();
    const previo = this._limites.get(pid) || limitesVacios();

    // Merge conservador sobre el molde; valida y normaliza cada campo declarable.
    if (limite.alcance && typeof limite.alcance === 'object') {
      actual.alcance = {
        geografia: limite.alcance.geografia != null ? String(limite.alcance.geografia).trim() || null : (previo.alcance && previo.alcance.geografia) || null,
        mercado: limite.alcance.mercado != null ? String(limite.alcance.mercado).trim() || null : (previo.alcance && previo.alcance.mercado) || null
      };
      if (!actual.alcance.geografia && !actual.alcance.mercado) return this._invalid('limites.alcance');
    } else if (previo.alcance) {
      actual.alcance = previo.alcance;
    }

    if (Array.isArray(limite.exclusions_base)) {
      actual.exclusions_base = limite.exclusions_base
        .map(x => (x && String(x).trim()) ? String(x).trim() : null)
        .filter(Boolean);
    } else if (Array.isArray(previo.exclusions_base)) {
      actual.exclusions_base = previo.exclusions_base;
    }

    const prof = numPos(limite.profundidad);
    if (limite.profundidad != null && limite.profundidad !== '') {
      if (!PROFUNDIDADES.has(prof)) return this._invalid('limites.profundidad');
      actual.profundidad = prof;
    } else if (previo.profundidad != null) {
      actual.profundidad = previo.profundidad;
    }

    actual.max_territorios = numPos(limite.max_territorios) ?? previo.max_territorios;
    actual.max_candidatos = numPos(limite.max_candidatos) ?? previo.max_candidatos;
    actual.limite_consulta_fuente = numPos(limite.limite_consulta_fuente) ?? previo.limite_consulta_fuente;

    if (Array.isArray(limite.reglas)) {
      const reglas = [];
      for (const r of limite.reglas) {
        const tipo = r && TIPOS_REGLA.has(r.tipo) ? r.tipo : null;
        const valor = r && r.valor != null && String(r.valor).trim() ? String(r.valor).trim() : null;
        if (!tipo || !valor) continue; // descarta regla malformada, no rompe la declaración
        reglas.push({ tipo, valor, motivo: (r.motivo && String(r.motivo).trim()) ? String(r.motivo).trim() : `límite fijo de ${tipo}` });
      }
      actual.reglas = reglas;
    } else if (Array.isArray(previo.reglas)) {
      actual.reglas = previo.reglas;
    }

    actual.updated_at = new Date().toISOString();
    actual.declarado_por = ROL_DUENYO;

    this._limites.set(pid, actual);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, limites: actual, declarado: true } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = PerfilLimiteBusqueda;
