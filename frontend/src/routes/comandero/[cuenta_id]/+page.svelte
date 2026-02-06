<script lang="ts">
  /**
   * Página Comandero — Pantalla de pedido para una cuenta específica
   *
   * Standalone: sin LazyShell, sin AppShell, sin chat.
   * Ruta: /comandero/[cuenta_id]
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ComanderoScreen } from '$lib/components/comandero';

  $: cuenta_id = $page.params.cuenta_id;

  function handleNavigate(path: string) {
    goto(path);
  }

  function handleOpenPanel(panel: string, data?: any) {
    // TODO: Implementar flotantes (Variaciones, Cobro, etc.)
    console.log('[Comandero] Open panel:', panel, data);
  }
</script>

<svelte:head>
  <title>Comandero</title>
</svelte:head>

<ComanderoScreen
  {cuenta_id}
  onNavigate={handleNavigate}
  onOpenPanel={handleOpenPanel}
/>
