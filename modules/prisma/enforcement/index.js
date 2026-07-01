/**
 * prisma/enforcement — REFLEJO JS: el EFECTOR del BOSS (CEREBRO≠ENFORCEMENT).
 *
 * El BOSS calcula el PLAN (qué órganos necesita el comercio) y lo señala en
 * boss.plan.actualizado. Este módulo lo CONSUME y lo APLICA: por cada órgano
 * necesario, enciende su interruptor en el panel central (organo-<id>), que el
 * dueño del órgano reacciona en caliente. Cierra el lazo CEREBRO→acción.
 *
 * Postura (v0.1, deliberada):
 *   - ADDITIVO: enciende lo que el comercio necesita (edge-triggered por proyecto;
 *     idempotente — interruptores solo emite cambiado en divergencia).
 *   - NO APAGA solo: un órgano que dejó de ser necesario recibe TESTIGO
 *     (boss.organo.innecesario), nunca un apagado automático — la voluntad de
 *     apagar es humana (como la apoptosis de la homeostasis: canta, no mata).
 *   - SIN FALLO MUDO: registra el interruptor de cada órgano al vuelo (incluso los
 *     de arquetipos custom) → nunca hay un órgano necesario sin canal de encendido.
 *
 * Nota multi-proyecto: el interruptor es GLOBAL (panel central único). "necesario
 * por este comercio" ⊆ "capacidad disponible en este Enki"; re-afirmar true es
 * barato y seguro. El estado APLICADO se lleva por proyecto (para el diff/testigo).
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { ORGANOS_SEMILLA, KNOWN_ORGANOS, interruptorDe, metaDe, diffPlan } = require('../../_shared/organos-recetario');

const nowISO = () => new Date().toISOString();
const GRUPO = 'prisma-organos';

class PrismaEnforcementReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'enforcement';
    this.version = 'reflejo-0.1.0';
    this.aplicadosPorProyecto = new Map();   // project_id → Set<organo> aplicado
    this.registrados = new Set();            // órganos cuyo interruptor ya anunciamos
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._registrarOrganos(ORGANOS_SEMILLA);
  }

  onEstadoRequest(e) { return this._atender(e, 'estado', 'enforcement.estado.response', d => this._estado(d)); }

  // interruptores (re)cargó y pide registro → re-anunciamos (cura la carrera de arranque).
  onSolicitarRegistro() { this._registrarOrganos([...this.registrados].length ? [...this.registrados] : ORGANOS_SEMILLA); }

  // ── consumo del plan: el corazón ──
  onPlanActualizado(event) {
    const d = (event && (event.data || event.payload || event)) || {};
    const project_id = d.project_id;
    if (!project_id) return;
    const deseados = Array.isArray(d.organos) ? d.organos : [];
    return this._aplicar(project_id, deseados);
  }

  // ── plano PURO: qué encender / qué sobra, dado lo ya aplicado a este proyecto ──
  _plan(project_id, deseados) {
    const aplicados = [...(this.aplicadosPorProyecto.get(project_id) || new Set())];
    return diffPlan(deseados, aplicados);
  }

  _aplicar(project_id, deseados) {
    const { encender, innecesarios } = this._plan(project_id, deseados);

    for (const organo of encender) {
      this._registrarOrganos([organo]);   // asegura el canal (custom incluidos) — sin fallo mudo
      const id = interruptorDe(organo);
      this.eventBus?.publish('interruptor.set', { id, enabled: true, motivo: `boss:${project_id}` });
      this.eventBus?.publish('boss.organo.encendido', { project_id, organo, interruptor: id, estado: metaDe(organo).estado, timestamp: nowISO() });
      this.metrics?.increment?.('enforcement.organo.encendido.total', { organo });
    }
    for (const organo of innecesarios) {
      // NO se apaga: solo testigo. La voluntad de apagar es humana.
      this.eventBus?.publish('boss.organo.innecesario', { project_id, organo, interruptor: interruptorDe(organo), timestamp: nowISO() });
      this.metrics?.increment?.('enforcement.organo.innecesario.total', { organo });
    }

    this.aplicadosPorProyecto.set(project_id, new Set(deseados));
    return { encendidos: encender, innecesarios };
  }

  // registra el interruptor de cada órgano en el panel central (idempotente).
  _registrarOrganos(organos) {
    for (const organo of organos) {
      const id = interruptorDe(organo);
      const meta = metaDe(organo);
      try {
        this.eventBus?.publish('interruptor.registrar', {
          id, grupo: GRUPO, default: false,
          label: `Órgano · ${organo}`,
          descripcion: `Capacidad "${organo}" que el BOSS enciende cuando el comercio la necesita. ${meta.nota} (estado: ${meta.estado}).`
        });
      } catch (_) { /* best-effort */ }
      this.registrados.add(organo);
    }
  }

  _estado(input) {
    if (!input.project_id) return this._invalid('project_id');
    const aplicados = [...(this.aplicadosPorProyecto.get(input.project_id) || new Set())].sort();
    return {
      status: 200,
      data: {
        project_id: input.project_id,
        aplicados,
        organos_conocidos: Object.keys(KNOWN_ORGANOS),
        registrados: [...this.registrados].sort()
      }
    };
  }
}

module.exports = PrismaEnforcementReflejo;
