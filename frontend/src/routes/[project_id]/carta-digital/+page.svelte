<script lang="ts">
  /**
   * Pagina Carta Digital (scoped a proyecto)
   *
   * URL: /[project_id]/carta-digital
   * Ej:  /peppone/carta-digital
   *
   * Misma base que menu-generator (chat, work-bar, system-bar).
   * La work-bar muestra los modulos de zona work-bar filtrados por ruta /carta-digital.
   * Los paneles flotantes se abren desde ahi.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/carta-digital',
      title: 'Carta Digital',
      description: 'Gestión de carta digital del restaurante: configuración, preview, exportación y estadísticas.',
      instructions: `El usuario está en la gestión de carta digital para el proyecto "${project_id}". Puede usar los paneles de la barra superior o pedirte las cosas por el chat.

Carta digital es un CONSUMIDOR de datos — muestra la carta pero NO modifica productos, precios ni ingredientes.
Si el usuario quiere cambiar datos de productos → derivar al módulo menu-generator.

Cuando el usuario dice "la carta", "mi carta digital" se refiere a la carta digital del proyecto activo.
Cuando menciona "configurar", "tema", "colores", "WhatsApp" se refiere a la configuración visual de la carta digital (eso SÍ es de este módulo).

Tools disponibles para esta página:
- carta-digital.config: ver configuración actual (branding, WhatsApp, tema)
- carta-digital.update-config: actualizar configuración visual (colores, nombre, WhatsApp)
- carta-digital.carta-completa: ver carta completa enriquecida
- carta-digital.ofertas: gestionar ofertas/combos (PROPIO de carta-digital)
- carta-digital.create-oferta / update-oferta / delete-oferta: CRUD ofertas
- carta-digital.resenas: ver reseñas de clientes
- carta-digital.stats: estadísticas de uso (sesiones, pedidos)
- carta-digital.funnel: análisis de conversión
- carta-digital.export-static: exportar como web estática (GitHub Pages, Netlify)

Para cambiar productos/precios/ingredientes → usar menu-generator:
- menu.update_product, menu.add_product, menu.update_prices, etc.`,
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
