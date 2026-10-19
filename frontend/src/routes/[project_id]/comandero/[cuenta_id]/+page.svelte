<script lang="ts">
  /**
   * Página Comandero — Pantalla de pedido para una cuenta específica
   *
   * Scoped por proyecto: /{project_id}/comandero/{cuenta_id}
   *
   * NOTA: El URL param project_id puede ser un alias corto (ej: "a").
   * Para operaciones de datos usamos activeProjectId (UUID real del store global).
   * El param del URL se usa solo para navegación.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { activeProjectId } from '$lib/stores/projects';
  import { ComanderoScreen } from '$lib/components/comandero';

  // URL param — puede ser alias corto, se usa para rutas
  $: urlProjectId = $page.params.project_id;
  $: cuenta_id = $page.params.cuenta_id;
  $: initialView = $page.url.searchParams.get('view') || undefined;
  // ?new=1 lo pone CuentasScreen tras crear una cuenta via TipoButton
  // → ComanderoScreen abre el modo edit de nombre + voz automaticamente
  $: isNew = $page.url.searchParams.get('new') === '1';

  // Para datos, usar el UUID real del store global
  $: projectId = $activeProjectId || urlProjectId;

  function handleNavigate(path: string) {
    // Si es pedido llevadoo y quiere volver a la lista, ir a /llevadoo
    if (path === '/comandero' && cuenta_id?.startsWith('llevadoo_')) {
      goto(`/${urlProjectId}/llevadoo`);
    } else if (path.startsWith('/comandero')) {
      goto(`/${urlProjectId}${path}`);
    } else {
      goto(path);
    }
  }

  function handleOpenPanel(panel: string, data?: any) {
    console.log('[Comandero] Open panel:', panel, data);
  }
</script>

<svelte:head>
  <title>Comandero</title>
</svelte:head>

<ComanderoScreen
  {cuenta_id}
  {projectId}
  {initialView}
  {isNew}
  onNavigate={handleNavigate}
  onOpenPanel={handleOpenPanel}
/>
