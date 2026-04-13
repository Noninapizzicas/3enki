<script lang="ts">
  /**
   * Pagina Menu Generator (scoped a proyecto)
   *
   * URL: /[project_id]/menu-generator
   * Ej:  /peppone/menu-generator
   *
   * Misma base que la pagina principal (chat, work-bar, system-bar).
   * La work-bar muestra los modulos de zona work-bar (menu-generator).
   * Los paneles flotantes se abren desde ahi.
   *
   * Page Context: inyecta contexto de página para que el chat sepa
   * qué está haciendo el usuario (pipeline OCR, cartas generadas, etc.)
   * Incluye el project_id para que las tools sepan a qué proyecto aplica.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  // Contexto del proyecto inyectado por [project_id]/+layout.svelte
  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/menu-generator',
      title: 'Menu Generator',
      description: 'Pipeline de creación de cartas de restaurante: PDF→Imagen→OCR→Generar carta estructurada con IA.',
      instructions: `El usuario está en menu-generator para el proyecto "${project_id}". Este es el módulo DUEÑO de los datos de carta — aquí se crean, modifican y gestionan productos, precios, ingredientes y categorías.

Cuando el usuario dice "genera con eso", "usa el texto que acabo de escanear" o similar, usa el valor de ocrText del estado.
Cuando menciona "la carta", "esa carta" o similar, se refiere a la activeCarta del estado (si existe).

Tools CRUD (menu-generator — datos de carta):
- menu.save_carta: guarda carta completa a disco
- menu.list_cartas: lista cartas generadas
- menu.get_carta: obtiene carta por ID
- menu.delete_carta: elimina carta (guarda versión antes)
- menu.add_product: añadir producto a carta
- menu.remove_product: quitar producto de carta
- menu.update_product: actualizar nombre, precio, ingredientes, categoría
- menu.update_prices: ajustar precios (porcentaje, por categoría, individuales)
- menu.add_category: añadir categoría
- menu.search_products: buscar productos por nombre o ingrediente
- menu.stats: estadísticas de carta
- menu.list_versions: historial de versiones (max 50)
- menu.restore_version: restaurar versión anterior

Agentes especializados (via agent-manager pipelines):
- menu-extractor: extrae texto de PDF/foto via OCR (pipeline step 1)
- menu-structurer: estructura texto en carta JSON con IA (pipeline step 2)
- menu-enricher: enriquece con descripciones, emojis, tags (pipeline step 3)
- menu-validator: valida calidad y coherencia (pipeline step 4)

Tarifas por canal de venta (módulo tarifas):
- tarifas.set_canal: configurar multiplicador y/o recargo por canal
- tarifas.set_categoria: excepción de tarifa para una categoría
- tarifas.get: ver configuración actual de tarifas
- tarifas.preview: previsualizar precios en todos los canales
- tarifas.set_precio_fijo: marcar productos como precio fijo`,
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
