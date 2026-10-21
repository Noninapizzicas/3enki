/**
 * filamento — CUSTODIO single-writer del stock de bobinas del taller 3D (pieza 3).
 *
 * Guarda las bobinas de filamento por proyecto: gramos_total, gramos_restantes,
 * material, color, enUso. Es el único escritor del store bobinas (por proyecto,
 * vía PosPersistencia).
 *
 * Operaciones del plano (plan-construccion.md 6.3): _registrarBobina, _descontar
 * (SOLO con gramo MEDIDO del historial; CERO estimación), _cambiarBobina, _restaDe,
 * _evaluarUmbral (resta < umbral → material.bajo: avisa, NO decide).
 *
 * CERO juicio: el umbral de reposición es decisión del dueño (ABIERTO). Este
 * custodio solo avisa cuando se cruza; no encarga reposición por sí solo.
 *
 * v0.1.0: FASE 4 TANDA 2.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const MATERIALES = Object.freeze(['PETG']);
const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class FilamentoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'filamento';
    this.version = 'reflejo-0.1.0';
    this.bobinas = new Map(); // `${project_id}:${id}` → bobina

    this._persist = new PosPersistencia({
      modulo: this, file: 'filamento.json', dir: '/3d/filamento',
      snapshot: (pid) => ({
        project_id: pid,
        bobinas: [...this.bobinas.values()].filter(b => b.project_id === pid)
      }),
      hidratar: (pid, data) => {
        if (!data) return;
        for (const b of (data.bobinas || [])) {
          if (b && b.id) this.bobinas.set(_key(pid, b.id), b);
        }
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onRegistrarRequest(e) { return this._atender(e, 'registrar', 'filamento.registrar.response', d => this._registrarBobina(d)); }
  onDescontarRequest(e) { return this._atender(e, 'descontar', 'filamento.descontar.response', d => this._descontar(d)); }
  onCambiarRequest(e)  { return this._atender(e, 'cambiar', 'filamento.cambiar.response', d => this._cambiarBobina(d)); }
  onEvaluarRequest(e)  { return this._atender(e, 'evaluar', 'filamento.evaluar.response', d => this._evaluarUmbral(d)); }

  // ── PROYECCIONES (dominio) ──

  // _registrarBobina: alta de una bobina nueva. gramos_total obligatorio. Si no se
  // indica gramos_restantes, se asume igual al total (bobina llena, honesto).
  async _registrarBobina(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (input.gramos_total == null) return this._invalid('gramos_total');

    const id = input.id || `bob_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const bobina = {
      id, project_id: input.project_id,
      material: input.material || input.material_nombre || 'PETG',
      color: input.color ? String(input.color) : null,
      gramos_total: Number(input.gramos_total),
      gramos_restantes: input.gramos_restantes != null ? Number(input.gramos_restantes) : Number(input.gramos_total),
      enUso: input.enUso === true,
      umbralRepos: input.umbral_repos != null ? Number(input.umbral_repos) : null, // decisión del dueño [ABIERTO]
      registrado_en: nowISO()
    };
    this.bobinas.set(_key(input.project_id, id), bobina);
    this._persist.marcarDirty(input.project_id);

    this._publicarEvento('material.actualizado', {
      bobina_id: id, project_id: input.project_id, accion: 'registrada', material: bobina.material,
      gramos_restantes: bobina.gramos_restantes,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 201, data: { bobina } };
  }

  // _descontar: decrementa el stock SOLO con dato MEDIDO (gramo del historial/registro
  // de la impresión real). CERO estimación: si no viene gramo_medido → fallo (nunca
  // conjetura). Localiza la bobina (enUso, o por id/material). Tras descontar, si el
  // dueño fijó umbral y cruza → emite material.bajo (avisa, NO decide).
  async _descontar(input) {
    if (!input.project_id) return this._invalid('project_id');
    // CERO estimación: exige gramo MEDIDO de la impresión (regla M11).
    const gramo = input.gramos_medido != null ? Number(input.gramos_medido) : Number(input.gramos || NaN);
    if (gramo == null || Number.isNaN(gramo) || gramo <= 0) {
      this._publicarEvento('filamento.descontar.failed', {
        project_id: input.project_id, motivo: 'sin_gramo_medido',
        correlation_id: input.correlation_id, timestamp: nowISO()
      });
      return this._errorResponse(400, 'INVALID_INPUT', 'gramos_medido (dato MEDIDO del historial) requerido', { campo: 'gramos_medido' });
    }

    const bobina = this._findBobina(input);
    if (!bobina) {
      this._publicarEvento('filamento.descontar.failed', {
        project_id: input.project_id, motivo: 'bobina_no_encontrada',
        correlation_id: input.correlation_id, timestamp: nowISO()
      });
      return this._errorResponse(404, 'NOT_FOUND', 'bobina no encontrada (para descontar)');
    }

    const key = _key(input.project_id, bobina.id);
    const restantes = this._round(bobina.gramos_restantes - gramo);
    const actualizado = { ...bobina, gramos_restantes: Math.max(0, restantes), actualizado_en: nowISO() };
    this.bobinas.set(key, actualizado);
    this._persist.marcarDirty(input.project_id);

    this._publicarEvento('material.actualizado', {
      bobina_id: actualizado.id, project_id: input.project_id, accion: 'descontada',
      material: actualizado.material, gramos_restantes: actualizado.gramos_restantes, gramos_descontados: gramo,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });

    // umbral → avisa (NO decide)
    const umbral = actualizado.umbralRepos;
    if (umbral != null && actualizado.gramos_restantes < umbral) {
      this._publicarEvento('material.bajo', {
        bobina_id: actualizado.id, project_id: input.project_id,
        material: actualizado.material, gramos_restantes: actualizado.gramos_restantes, umbral,
        correlation_id: input.correlation_id, timestamp: nowISO()
      });
    }
    return { status: 200, data: { bobina: actualizado, gramos_descontados: gramo, bajo_umbral: umbral != null && actualizado.gramos_restantes < umbral } };
  }

  // _cambiarBobina: pone enUso una bobina distinta (o rellena gramos de una misma).
  // Emite material.actualizado. CERO reposición automática: el dueño declara el gramo.
  async _cambiarBobina(input) {
    if (!input.project_id) return this._invalid('project_id');
    const bobina = this._findBobina(input);
    if (!bobina) return this._errorResponse(404, 'NOT_FOUND', 'bobina no encontrada (para cambiar)');

    const key = _key(input.project_id, bobina.id);
    const actualizado = {
      ...bobina,
      enUso: input.en_uso !== undefined ? input.en_uso === true : true,
      gramos_restantes: input.gramos_restantes != null ? Number(input.gramos_restantes) : bobina.gramos_restantes,
      actualizado_en: nowISO()
    };
    this.bobinas.set(key, actualizado);
    this._persist.marcarDirty(input.project_id);

    this._publicarEvento('material.actualizado', {
      bobina_id: actualizado.id, project_id: input.project_id, accion: 'cambio_bobina',
      material: actualizado.material, gramos_restantes: actualizado.gramos_restantes, en_uso: actualizado.enUso,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 200, data: { bobina: actualizado } };
  }

  // _evaluarUmbral: revisa las bobinas del proyecto contra su umbral de reposición
  // (decisión del dueño, ABIERTO). Para cada cruce emite material.bajo (avisa) y lo
  // reporta; NO decide ni encarga. Sin umbral fijado → no evalúa (no inventa).
  async _evaluarUmbral(input) {
    if (!input.project_id) return this._invalid('project_id');
    const de = [...this.bobinas.values()].filter(b => b.project_id === input.project_id);
    const bajas = [];
    for (const b of de) {
      const umbral = b.umbralRepos;
      if (umbral == null) continue; // sin decisión del dueño, no hay umbral a evaluar
      if (b.gramos_restantes < umbral) {
        bajas.push({ bobina_id: b.id, material: b.material, gramos_restantes: b.gramos_restantes, umbral });
        this._publicarEvento('material.bajo', {
          bobina_id: b.id, project_id: input.project_id, material: b.material,
          gramos_restantes: b.gramos_restantes, umbral,
          correlation_id: input.correlation_id, timestamp: nowISO()
        });
      }
    }
    return { status: 200, data: { evaluadas: de.length, bajas } };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _findBobina(input) {
    const id = input.bobina_id || input.id;
    if (id) {
      const b = this.bobinas.get(_key(input.project_id, id));
      if (b) return b;
    }
    // por material si no hay id (todas las de ese material, preferimos la enUso)
    if (input.material || input.bobina_material) {
      const mat = input.material || input.bobina_material;
      const de = [...this.bobinas.values()].filter(b => b.project_id === input.project_id && b.material === mat);
      return de.find(b => b.enUso) || de[0] || null;
    }
    return [...this.bobinas.values()].find(b => b.project_id === input.project_id && b.enUso) || null;
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = FilamentoReflejo;
