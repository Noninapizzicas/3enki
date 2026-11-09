'use strict';
/**
 * puerta-admision — P03 · REFLEJO puro (P1–P3, I1, I2, I6, I7).
 *
 * La función `ContextoDeAdmision → DecisionDeAdmision` en 5 pasos — sobre,
 * proyecto/hilo, sujeto, acto+estado (política como DATO), llave. No consulta
 * almacenes: TODO lo que necesita viene hidratado por valor en el contexto, y
 * por eso la decisión es reproducible (misma ctx ⇒ misma decisión, I6).
 *
 * Invariantes:
 *   P1  decidir() es una función: misma ctx ⇒ misma decisión, siempre.
 *   P2  toda decisión lleva `base` (siempre) y `motivo` (si rechaza) → I6.
 *   P3  la puerta NO emite hechos ni escribe: el rastro lo pone el coordinador.
 *   I1  un participante DESCONOCIDO nunca entra.
 *   I2  el proyecto del hilo debe ser el del sobre (nunca se crean aquí).
 *   I7  LEER ≠ ESCRIBIR: una llave por acto pedido, no una llave «de todo».
 *
 * Contrato:
 *   conversacion.admitir.request { request_id, veredicto, proyecto, conversacion,
 *                                  participante, acto, politica, llaves[], ahora }
 *     → conversacion.admitir.response { request_id, status, data: DecisionDeAdmision }
 *     → conversacion.admitir.failed   (sólo ctx malformado: error de dominio, nunca timeout)
 *
 * DecisionDeAdmision:
 *   { decision: 'ABRIR', actos: [...], llaves: [...], base }
 *   { decision: 'RECHAZAR', motivo: 'MOTIVO_*', detalle?, base }
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const POR_DECLARAR = 'POR_DECLARAR';
const NO_RESUELVE = 'NO_RESUELVE';
const NINGUNA = 'NINGUNA';
const DESCONOCIDO = 'DESCONOCIDO';

const MOTIVOS = {
  SOBRE_INCOMPLETO: 'MOTIVO_SOBRE_INCOMPLETO',
  PROYECTO_NO_RESUELVE: 'MOTIVO_PROYECTO_NO_RESUELVE',
  CONVERSACION_NO_EXISTE: 'MOTIVO_CONVERSACION_NO_EXISTE',
  FUERA_DE_AMBITO: 'MOTIVO_FUERA_DE_AMBITO',
  PARTICIPANTE_DESCONOCIDO: 'MOTIVO_PARTICIPANTE_DESCONOCIDO',
  POLITICA_NO_DECLARADA: 'MOTIVO_POLITICA_NO_DECLARADA',
  ESTADO_NO_ADMITE: 'MOTIVO_ESTADO_NO_ADMITE',
  SIN_LLAVE: 'MOTIVO_SIN_LLAVE',
  LLAVE_NO_CUBRE_ACTO: 'MOTIVO_LLAVE_NO_CUBRE_ACTO'
};

class PuertaAdmision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerta-admision';
    this.version = 'reflejo-0.1.0';
  }

  // ───────────────────────────────────────────────────────────────────────
  // Handler RPC
  // ───────────────────────────────────────────────────────────────────────

  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'conversacion.admitir.response', (d) => this._decidir(d));
  }

  // ───────────────────────────────────────────────────────────────────────
  // La decisión (5 pasos, en el orden del diseño — el primero que corta manda)
  // ───────────────────────────────────────────────────────────────────────

  async _decidir(ctx = {}) {
    if (!ctx || typeof ctx !== 'object' || !ctx.veredicto || typeof ctx.veredicto !== 'object') {
      await this._publicarEvento('conversacion.admitir.failed', {
        motivo: 'CONTEXTO_SIN_VEREDICTO',
        detalle: 'el clasificador (P13) siempre pasa antes: ctx.veredicto es precondición'
      });
      return this._errorResponse(400, 'INVALID_INPUT', 'ctx.veredicto requerido (el clasificador pasa antes)', {
        kind: 'domain',
        field: 'veredicto'
      });
    }

    const base = this._base(ctx);

    // 1 · el sobre
    if (ctx.veredicto.estado !== 'COMPLETO') {
      return this._rechazar(MOTIVOS.SOBRE_INCOMPLETO, base, { faltantes: ctx.veredicto.faltantes || [] });
    }

    // 2 · el proyecto y el hilo existen (aquí NUNCA se crean)
    if (!ctx.proyecto || ctx.proyecto === NO_RESUELVE) {
      return this._rechazar(MOTIVOS.PROYECTO_NO_RESUELVE, base);
    }
    if (!ctx.conversacion || ctx.conversacion === NINGUNA) {
      return this._rechazar(MOTIVOS.CONVERSACION_NO_EXISTE, base);
    }
    if (ctx.conversacion.proyecto !== ctx.proyecto.idCanonico) {
      return this._rechazar(MOTIVOS.FUERA_DE_AMBITO, base, {
        proyecto_hilo: ctx.conversacion.proyecto,
        proyecto_sobre: ctx.proyecto.idCanonico
      }); // I2
    }

    // 3 · el sujeto
    if (!ctx.participante || ctx.participante === DESCONOCIDO || !ctx.participante.id) {
      return this._rechazar(MOTIVOS.PARTICIPANTE_DESCONOCIDO, base); // I1
    }

    // 4 · el acto y el estado del hilo (la política es DATO)
    const actos = this._actos_pedidos(ctx.acto, ctx.politica);
    if (actos === POR_DECLARAR) {
      return this._rechazar(MOTIVOS.POLITICA_NO_DECLARADA, base, { acto: ctx.acto || null }); // O12
    }
    const permite = this._permite(ctx.politica, actos, ctx.conversacion.estado);
    if (permite !== true) {
      return this._rechazar(MOTIVOS.ESTADO_NO_ADMITE, base, {
        acto: ctx.acto || null,
        estado: ctx.conversacion.estado || null,
        actos
      });
    }

    // 5 · la llave (una por acto; LEER ≠ ESCRIBIR)
    const cobertura = this._primera_llave(actos, ctx.llaves || [], ctx.conversacion.id, ctx.ahora);
    if (cobertura.falta) {
      return this._rechazar(cobertura.falta.motivo, base, { acto: cobertura.falta.acto });
    }

    return {
      status: 200,
      data: {
        decision: 'ABRIR',
        actos,
        llaves: cobertura.usadas,
        base
      }
    };
  }

  /**
   * Qué actos pide esta entrada según la política declarada.
   * @returns {string[]|'POR_DECLARAR'} `POR_DECLARAR` si la entrada no está declarada.
   */
  _actos_pedidos(acto, politica) {
    if (!politica || politica === POR_DECLARAR || !politica.actosPorEntrada) return POR_DECLARAR;
    const declarados = politica.actosPorEntrada[acto];
    if (!Array.isArray(declarados)) return POR_DECLARAR;
    return [...new Set(declarados)];
  }

  /** ¿la política admite estos actos en este estado del hilo? La ausencia se declara, no se inventa. */
  _permite(politica, actos, estado) {
    if (!politica || politica === POR_DECLARAR || !politica.actosPorEstado) return POR_DECLARAR;
    const permitidos = politica.actosPorEstado[estado];
    if (!Array.isArray(permitidos)) return false;
    return actos.every((a) => permitidos.includes(a));
  }

  /**
   * Una llave por acto. Devuelve las usadas y, si falta cobertura, por qué.
   * @returns {{usadas: object[], falta: {motivo: string, acto?: string}|null}}
   */
  _primera_llave(actos, llaves, conversacion, ahora) {
    if (!llaves.length) return { usadas: [], falta: { motivo: MOTIVOS.SIN_LLAVE } };
    const usadas = [];
    for (const acto of actos) {
      const llave = llaves.find((l) => this._cubre(l, acto, conversacion, ahora));
      if (!llave) {
        // Con llaves presentes pero ninguna que cubra ESTE acto: I7 en el asiento.
        return { usadas: [], falta: { motivo: MOTIVOS.LLAVE_NO_CUBRE_ACTO, acto } };
      }
      if (!usadas.some((u) => u.id === llave.id)) usadas.push({ id: llave.id, actos: [...(llave.actos || [])] });
    }
    return { usadas, falta: null };
  }

  /** Implementación local de `Llave.cubre()` — 5 líneas, duplicación aceptada entre islas. */
  _cubre(llave, acto, conversacion, ahora) {
    if (!llave) return false;
    if (llave.revocadaEn && llave.revocadaEn !== 'NINGUNO') return false;
    if (llave.conversacion !== conversacion) return false;
    if (!Array.isArray(llave.actos) || !llave.actos.includes(acto)) return false;
    if (llave.caducaEn && llave.caducaEn !== POR_DECLARAR) {
      // Sin `ahora` declarado no se puede verificar la caducidad: no cubre.
      if (!ahora) return false;
      if (String(ahora) > String(llave.caducaEn)) return false;
    }
    return true;
  }

  /** Con qué se decidió — SIEMPRE viaja en la decisión (P2/I6). */
  _base(ctx) {
    return {
      veredicto: ctx.veredicto?.estado || null,
      faltantes: ctx.veredicto?.faltantes || [],
      proyecto: ctx.proyecto && ctx.proyecto !== NO_RESUELVE ? (ctx.proyecto.idCanonico || null) : (ctx.proyecto || null),
      conversacion: ctx.conversacion && ctx.conversacion !== NINGUNA ? (ctx.conversacion.id || null) : (ctx.conversacion || null),
      participante: ctx.participante && ctx.participante !== DESCONOCIDO ? (ctx.participante.id || null) : (ctx.participante || null),
      estado: ctx.conversacion?.estado || null,
      acto: ctx.acto || null,
      ahora: ctx.ahora || null
    };
  }

  _rechazar(motivo, base, detalle) {
    return {
      status: 200,
      data: {
        decision: 'RECHAZAR',
        motivo,
        ...(detalle ? { detalle } : {}),
        base
      }
    };
  }
}

module.exports = PuertaAdmision;
