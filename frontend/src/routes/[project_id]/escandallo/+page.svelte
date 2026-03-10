<script lang="ts">
  /**
   * Pagina Escandallo (scoped a proyecto)
   *
   * URL: /[project_id]/escandallo
   *
   * Mismo patrón que menu-generator y carta-digital:
   * LazyShell + work-bar + chat con page context.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/escandallo',
      title: 'Escandallo',
      description: 'Análisis de costes y escandallo de recetas. Desglose de costes, food cost, márgenes y optimización.',
      instructions: `El usuario está en la sección de escandallo para el proyecto "${project_id}". Analiza costes de recetas y ayuda a optimizar precios.

CONTEXTO: Sistema de planificación de negocio. Los costes actuales son estimaciones de mercado (por alto). Los precios de compra reales se añadirán con facturas.

IMPORTANTE: El food cost ideal en hostelería es 28-33%. Por encima de 35% hay que optimizar.

Tools disponibles:
- escandallo.receta: escandallo detallado de una receta (con desglose, porcentajes, food cost si se da precio de venta)
- escandallo.global: resumen de costes de todas las recetas del proyecto
- escandallo.comparar_precios: compara precios de mercado vs compra real
- escandallo.simular_precio: simula diferentes precios de venta y su impacto en margen
- escandallo.ingrediente_impacto: analiza impacto de un ingrediente (en cuántas recetas, qué pasa si sube)
- escandallo.optimizar: sugiere optimizaciones de coste
- escandallo.ficha_tecnica: genera ficha técnica profesional de una receta

Flujo típico:
1. "Dame el escandallo global" → visión general de costes
2. "Escandallo de la carbonara a 12€" → detalle con food cost y margen
3. "Simula precios de 10, 12 y 15€ para la carbonara" → comparativa de márgenes
4. "Qué pasa si sube el queso un 20%?" → análisis de impacto
5. "Optimiza costes" → sugerencias automáticas`,
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
