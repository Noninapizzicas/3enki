<script lang="ts">
  /**
   * Página Dispositivos — Gestión IoT con chat/IA
   *
   * URL: /{project_id}/dispositivos
   *
   * Usa LazyShell (como menu-generator) para tener chat + paneles flotantes.
   * El panel de Dispositivos aparece en la work-bar y se abre automáticamente.
   * La IA tiene contexto completo de las tools disponibles para IoT.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/dispositivos',
      title: 'Dispositivos',
      description: 'Gestión de dispositivos IoT: fleet, shadow state, firmware OTA, gateways MQTT, y health monitoring.',
      instructions: `El usuario está gestionando dispositivos IoT para el proyecto "${project_id}". Puede usar el panel de Dispositivos en la barra lateral o pedirte cosas por el chat.

Cuando diga "registra un dispositivo", "añade un sensor", etc., usa devices.register.
Cuando diga "actualiza el firmware", "haz OTA", etc., usa firmware.trigger-ota.
Cuando pregunte "qué dispositivos hay", "cuántos están online", usa devices.list o devices.stats.
Cuando diga "mira el shadow", "qué tiene reportado", usa shadow.get-full.

Tools disponibles para esta página:
- devices.list: lista todos los dispositivos registrados
- devices.register: registra un nuevo dispositivo (device_id, name, type, capabilities, protocol)
- devices.unregister: elimina un dispositivo
- devices.stats: estadísticas de la flota (por tipo, protocolo, estado)
- shadow.get-full: obtiene el shadow completo de un dispositivo
- shadow.set-desired: escribe estado desired en el shadow
- firmware.list: catálogo de firmwares disponibles
- firmware.register: registra un nuevo firmware en el catálogo
- firmware.trigger-ota: dispara actualización OTA a un dispositivo
- firmware.status: estado de OTAs pendientes y log
- firmware.rollback: rollback de firmware a versión anterior
- firmware.cleanup-otas: limpia OTAs pendientes estancadas
- gateways.list: lista gateways activos
- gateways.restart: reinicia un gateway
- gateways.discover: descubre dispositivos en un gateway
- health.dashboard: resumen de salud de la flota
- health.alerts: alertas activas`,
      state: {
        projectId: project_id
      }
    });
  });

  onDestroy(() => {
    clearPageContext();
  });
</script>

<svelte:head>
  <title>Dispositivos</title>
</svelte:head>

<LazyShell />
