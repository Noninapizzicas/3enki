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

Tools de generación y gestión de datos:
- menu.generate: genera carta desde texto (OCR, lista, JSON)
- menu.save_carta: guarda carta completa a disco desde JSON
- menu.list_cartas: lista cartas generadas
- menu.get_carta: obtiene carta por ID

Tools de edición de productos:
- menu.add_product: añadir producto a carta
- menu.remove_product: quitar producto de carta
- menu.update_product: actualizar nombre, precio, ingredientes, categoría
- menu.update_prices: ajustar precios (porcentaje, por categoría, individuales)
- menu.add_category: añadir categoría
- menu.update_ingredient_prices: actualizar precios extra de ingredientes

Tools de enriquecimiento:
- menu.enrich_products: descripciones, emojis, tags con IA
- menu.set_product_image: asignar imagen a producto
- menu.set_category_image: asignar imagen/icono a categoría

Tools de consulta:
- menu.search_products: buscar productos por nombre o ingrediente
- menu.stats: estadísticas de carta

Control de versiones:
- menu.list_versions: historial de versiones (max 50)
- menu.restore_version: restaurar versión anterior

Exportación:
- menu.export_to_pos: sincronizar con POS
- carta.render: renderizar HTML imprimible con plantilla

Tarifas por canal de venta (módulo tarifas):
- tarifas.set_canal: configurar multiplicador y/o recargo por canal (mesa, llevar, telefono, whatsapp, glovo, llevadoo)
- tarifas.set_categoria: excepción de tarifa para una categoría en canal(es) (ej: bebidas sin recargo en delivery)
- tarifas.get: ver configuración actual de tarifas
- tarifas.preview: previsualizar precios de un producto o categoría en todos los canales
- tarifas.set_precio_fijo: marcar productos como precio fijo (exentos de tarifas de canal — ideal para bebidas, menús, ofertas)`,
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
