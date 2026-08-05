// ============================================================================
// agente-progreso.ts — STORE de la VENTANA DEL AGENTE (ruta fuera / panel dentro)
//
// Se suscribe a los eventos canónicos del agente (agent-flow):
//   agent.execute.request   → abre la ejecución (status: running)
//   agent.execute.progress  → acumula la ruta del agente (pasos + tools)
//   agent.execute.response  → cierra (status: done)
//   agent.execute.failed    → cierra (status: failed)
//
// Patrón gemelo de chat.ts: MQTT directo vía $lib/ui-core. Un solo store
// alimenta DOS contenedores: la RUTA (página /[project_id]/agentes/[request_id])
// y el PANEL (openPanel dentro del chat). El usuario sigue su camino mientras
// el agente trabaja; la ventana se actualiza sola por push MQTT.
// ============================================================================

import { writable, get } from 'svelte/store';
import { subscribe } from '$lib/ui-core';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AgentePaso {
  step: string;          // started | thinking | tool_call | finalizing
  message?: string;      // texto legible del paso
  tool_invoked?: string; // tool que invocó
  iteration?: number;
  ts: string;
}

export interface AgenteEjecucion {
  request_id: string;
  agent_name: string;
  task?: string;
  project_id?: string;
  conversation_id?: string;
  status: 'running' | 'done' | 'failed';
  pasos: AgentePaso[];
  tools_llamadas: string[];
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  resultado?: string;
  error?: { code: string; message: string };
}

// ── Store ────────────────────────────────────────────────────────────────────

// ejecuciones activas por request_id (historial de la sesión del navegador)
export const ejecuciones = writable<Map<string, AgenteEjecucion>>(new Map());
// request_id de la ejecución "activa" (la última que se abrió)
export const ejecucionActivaId = writable<string | null>(null);

function nuevaEjecucion(data: any): AgenteEjecucion {
  return {
    request_id: data.request_id,
    agent_name: data.agent_name || 'agente',
    task: data.task || data.context?.task || undefined,
    project_id: data.project_id || data.context?.project_id || undefined,
    conversation_id: data.conversation_id || undefined,
    status: 'running',
    pasos: [],
    tools_llamadas: [],
    started_at: new Date().toISOString()
  };
}

function mutar(request_id: string, fn: (e: AgenteEjecucion) => void) {
  ejecuciones.update(map => {
    const e = map.get(request_id);
    if (!e) return map;
    fn(e);
    return new Map(map); // inmutabilidad para reactividad svelte
  });
}

// ── API pública ──────────────────────────────────────────────────────────────

export function getEjecucion(request_id: string): AgenteEjecucion | undefined {
  return get(ejecuciones).get(request_id);
}

export function abrirEjecucion(request_id: string): void {
  ejecucionActivaId.set(request_id);
}

// ── Suscripción MQTT (inicializar al montar la app o la página) ─────────────
// Topics REALES del frontend (el puente backend publica en conversation/{id}/…):
//   conversation/+/agent_progress → la ruta del agente en vivo
//   conversation/+/agent_status   → working/idle (el que el chat ya escucha)

export function initAgenteProgreso(): () => void {
  const unsubs: Array<() => void> = [];

  function convIdDeTopic(topic: string): string | null {
    const parts = topic.split('/');
    return parts.length >= 2 ? parts[1] : null;
  }

  // agent_progress → acumula pasos (la RUTA del agente en vivo)
  unsubs.push(subscribe('conversation/+/agent_progress', (topic, payload) => {
    const data = payload as any;
    if (!data?.request_id) return;
    ejecuciones.update(map => {
      const m = new Map(map);
      if (!m.has(data.request_id)) {
        m.set(data.request_id, {
          request_id: data.request_id,
          agent_name: data.agent_name || 'agente',
          project_id: data.project_id,
          conversation_id: convIdDeTopic(topic) || undefined,
          status: 'running',
          pasos: [],
          tools_llamadas: [],
          started_at: new Date().toISOString()
        });
      }
      return m;
    });
    mutar(data.request_id, e => {
      const paso: AgentePaso = {
        step: data.step || 'thinking',
        message: data.message,
        tool_invoked: data.tool_invoked,
        iteration: data.iteration,
        ts: new Date().toISOString()
      };
      e.pasos.push(paso);
      if (data.tool_invoked) e.tools_llamadas.push(data.tool_invoked);
    });
  }));

  // agent_status → cierre (done/failed) cuando el puente lo marca idle
  unsubs.push(subscribe('conversation/+/agent_status', (topic, payload) => {
    const data = payload as any;
    if (data?.status !== 'idle') return;
    // Cerrar la ejecución activa de esa conversación
    const convId = convIdDeTopic(topic);
    ejecuciones.update(map => {
      const m = new Map(map);
      for (const [rid, e] of m) {
        if ((e.conversation_id === convId || !e.conversation_id) && e.status === 'running') {
          e.status = data.error ? 'failed' : 'done';
          e.ended_at = new Date().toISOString();
          if (data.error) e.error = data.error;
        }
      }
      return m;
    });
  }));

  return () => unsubs.forEach(u => u());
}
