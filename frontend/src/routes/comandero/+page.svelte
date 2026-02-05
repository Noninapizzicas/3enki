<script lang="ts">
  /**
   * Página Comandero — Pantalla de cuentas activas
   *
   * Standalone: sin LazyShell, sin AppShell, sin chat.
   * La puerta de entrada al flujo de trabajo operativo.
   */
  import { goto } from '$app/navigation';
  import { CuentasScreen } from '$lib/components/comandero';

  function handleNavigate(path: string) {
    goto(path);
  }
</script>

<svelte:head>
  <title>Comandero</title>
</svelte:head>

<CuentasScreen onNavigate={handleNavigate} />
