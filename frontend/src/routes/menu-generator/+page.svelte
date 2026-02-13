<script lang="ts">
  /**
   * Pagina Menu Generator
   *
   * Misma base que la pagina principal (chat, work-bar, system-bar).
   * La work-bar muestra los modulos de zona work-bar (menu-generator).
   * Los paneles flotantes se abren desde ahi.
   *
   * Page Context: inyecta contexto de página para que el chat sepa
   * qué está haciendo el usuario (pipeline OCR, cartas generadas, etc.)
   */
  import { onMount, onDestroy } from 'svelte';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  onMount(() => {
    setPageContext({
      route: '/menu-generator',
      title: 'Menu Generator',
      description: 'Pipeline de creación de cartas de restaurante: PDF→Imagen→OCR→Generar carta estructurada con IA.',
      instructions: `El usuario está en el pipeline de generación de cartas. Puede usar los paneles de la barra lateral o pedirte las cosas por el chat.

Cuando el usuario dice "genera con eso", "usa el texto que acabo de escanear" o similar, usa el valor de ocrText del estado.
Cuando menciona "la carta", "esa carta" o similar, se refiere a la activeCarta del estado (si existe).

Tools disponibles para esta página:
- menu.generate: genera carta desde texto
- menu.list_cartas: lista cartas generadas
- menu.get_carta: obtiene carta por ID
- menu.update_prices: ajusta precios
- menu.add_product / menu.remove_product: añadir/quitar productos
- menu.add_category: añadir categoría
- menu.update_product: actualizar producto
- menu.search_products: buscar productos
- menu.stats: estadísticas de carta`,
      state: {}
    });
  });

  onDestroy(() => {
    clearPageContext();
  });
</script>

<LazyShell />
