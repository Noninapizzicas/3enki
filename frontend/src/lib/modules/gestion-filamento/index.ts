/**
 * Módulo Gestion-Filamento — panel ESPECÍFICO del STOCK de filamento del taller 3D
 * (F7, prisma-universal). CASO ESPECIAL: NO existía panel previo (el módulo llegó
 * solo a F6/F6½). Este índice exporta el UIModule con un componente artesanal
 * (GestionFilamentoPanel.svelte) y su store MQTT (stores/filamento.ts), CREANDO
 * el panel desde CERO con pestañas trabajador + jefe.
 *
 * DUALIDAD DE ROLES (esquemas F6 + blueprint F6½):
 *   - listar (rol TRABAJADOR, lectura que también alimenta al jefe): la cinta del
 *     stock del taller (tipo, color, longitud restante, badge activo, badge bajo).
 *     El trabajador/operador es un LECTOR casi puro: vigila el stock para operar
 *     la impresora y preparar material/repuesto, SIN gestos de escritura.
 *   - registrar (rol JEFE): la ÚNICA escritura del custodio — alta de rollo con
 *     tipo, color, longitud inicial + toggle 'activo'. Solo el jefe lo expone.
 *   - decrementar (rol sistema/automatizado): lo dispara la IMPRESORA por evento
 *     filamento.usado contra el rollo activo. NO es gesto de panel; el panel solo
 *     se refresca con filamento.decrementado/filamento.bajo.
 *   - 'activar rollo' (marcar activo) es [ABIERTO]: hoy solo se fija como toggle de
 *     registrar; NO se inventa un RPC dedicado (no hay onMarcarActivo en index.js).
 *
 * NOTA F7: el module.json de gestion-filamento NO tenía ui_handlers (sus handlers
 * viven en subscribes como filamento.registrar.request/listar.request). Se declaran
 * en este F7 (domain 'gestion-filamento') para que mqttRequest('gestion-filamento', …)
 * llegue a los handlers reales (onRegistrarRequest/onListarRequest) vía
 * ui/request/gestion-filamento/<accion>.
 * Autodescubierto por el loader (import.meta.glob de manifest.json + index.ts).
 */

import type { UIModule } from '$lib/ui-core';
import GestionFilamentoPanel from './GestionFilamentoPanel.svelte';

export const gestionFilamentoModule: UIModule = {
  manifest: {
    id: 'gestion-filamento',
    name: 'Stock de filamento',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'gestion-filamento-btn',
      icon: '🧵',
      label: 'Filamento',
      action: { type: 'panel', panelId: 'gestion-filamento-panel' },
      order: 8
    },
    panels: [{
      id: 'gestion-filamento-panel',
      title: 'Stock de filamento',
      size: 'lg'
    }]
  },
  PanelComponent: GestionFilamentoPanel
};

export default gestionFilamentoModule;

export { default as GestionFilamentoPanel } from './GestionFilamentoPanel.svelte';
