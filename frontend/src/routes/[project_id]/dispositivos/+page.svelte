<script lang="ts">
  /**
   * Página Dispositivos — Dashboard IoT fullscreen
   *
   * Scoped por proyecto: /{project_id}/dispositivos
   * Standalone (como cocina) — sin LazyShell.
   * 5 tabs: Fleet, Shadow, Firmware, Gateways, Health
   */
  import DispositivosScreen from '$lib/components/dispositivos/DispositivosScreen.svelte';
</script>

<svelte:head>
  <title>Dispositivos</title>
</svelte:head>

<DispositivosScreen />
