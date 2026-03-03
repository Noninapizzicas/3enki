<script lang="ts">
  /**
   * Página Facturas (scoped a proyecto)
   *
   * URL: /[project_id]/facturas
   * Ej:  /noninapizzicas/facturas
   *
   * Misma base que carta-digital y menu-generator (chat, work-bar, system-bar).
   * La work-bar muestra el módulo facturas filtrado por ruta /facturas.
   * El panel flotante se abre desde ahí.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/facturas',
      title: 'Facturas',
      description: 'Procesamiento y gestión de facturas del proyecto: subida, OCR, datos estructurados, exportación.',
      instructions: `El usuario está en la gestión de facturas para el proyecto "${project_id}". Puede usar el panel de la barra superior o pedirte las cosas por el chat.

Cuando el usuario dice "factura", "subir factura", "mis facturas" se refiere a las facturas del proyecto activo.
Cuando menciona "procesar", "OCR", "extraer datos" se refiere al pipeline de procesamiento.

Tools disponibles para esta página:
- facturas.procesar: procesa un archivo de factura (PDF/imagen) y extrae datos via OCR + IA
- facturas.listar: lista facturas del proyecto con filtros opcionales
- facturas.estadisticas: obtiene estadísticas de facturas del proyecto`,
      state: {
        projectId: project_id
      }
    });
  });

  onDestroy(() => {
    clearPageContext();
  });
</script>

<LazyShell />
