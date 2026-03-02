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

Cuando el usuario dice "la carta", "mi carta digital" o similar, se refiere a la carta digital del proyecto activo.
Cuando menciona "configurar", "tema", "colores", "WhatsApp" se refiere a la configuración de la carta digital.

Tools disponibles para esta página:
- menu.list_cartas: lista cartas generadas (para seleccionar cuál usar en la carta digital)
- menu.get_carta: obtiene carta por ID
- menu.enrich_products: enriquecer productos con descripciones, emojis, tags
- menu.set_product_image: asignar imagen a producto
- menu.set_category_image: asignar imagen/icono a categoría
- menu.update_product: actualizar producto
- menu.update_prices: ajustar precios
- menu.search_products: buscar productos
- menu.stats: estadísticas de carta`,
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
