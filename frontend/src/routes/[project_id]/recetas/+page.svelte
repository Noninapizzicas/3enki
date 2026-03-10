<script lang="ts">
  /**
   * Pagina Recetas (scoped a proyecto)
   *
   * URL: /[project_id]/recetas
   * Ej:  /pixel-bosch/recetas
   *
   * Misma base que la pagina principal (chat, work-bar, system-bar).
   * La work-bar muestra los modulos de zona work-bar (recetas).
   * Los paneles flotantes se abren desde ahi.
   *
   * Page Context: inyecta contexto de página para que el chat sepa
   * qué está haciendo el usuario (recetas, ingredientes, escandallo).
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
      route: '/recetas',
      title: 'Recetas',
      description: 'Gestión de recetas con ingredientes, cantidades y precios de mercado. Base para escandallo y estudio de viabilidad.',
      instructions: `El usuario está en la sección de recetas para el proyecto "${project_id}". Puede usar los paneles o el chat para gestionar recetas.

CONTEXTO: Este es un sistema de planificación de negocio nuevo. Las recetas se crean con precios de mercado estimados (internet, supermercados). Los precios de compra reales se añadirán después cuando se enlace con facturas.

IMPORTANTE: Al estimar precios de ingredientes, SIEMPRE estima por ALTO. Es preferible pasarse que quedarse corto.

Tools disponibles para esta página:
- recetas.crear: crea receta nueva con ingredientes, cantidades y precios
- recetas.investigar: investiga una receta (no la guarda, la propone al usuario)
- recetas.listar: lista recetas del proyecto
- recetas.obtener: obtiene receta completa por ID
- recetas.actualizar: modifica receta existente
- recetas.eliminar: elimina receta
- recetas.buscar: busca por nombre/ingrediente/categoría
- recetas.ingredientes: ver catálogo de ingredientes del proyecto
- recetas.precio_mercado: actualizar precio de mercado de un ingrediente
- recetas.duplicar: duplicar receta para hacer variante
- recetas.escandallo: calcular desglose de costes de una receta
- recetas.resumen: resumen global de todas las recetas

Flujo típico:
1. Usuario pide investigar una receta → usa recetas.investigar
2. El usuario confirma → usa recetas.crear con los datos propuestos
3. Repetir hasta tener las recetas necesarias
4. Usuario pide ver costes → usa recetas.escandallo o recetas.resumen`,
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
