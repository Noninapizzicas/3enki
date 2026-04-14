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
      description: 'Generar cartas de restaurante desde cualquier input y gestionarlas.',
      instructions: `Proyecto "${project_id}". Dos módulos:

GENERAR (menu-generator) — SIEMPRE pedir nombre antes de generar:
- menu.generate: genera carta desde texto o archivo (PDF/foto). REQUIERE nombre.
  Si es archivo → extrae texto con Google Vision OCR automáticamente.
  Si es texto → estructura directamente con IA.

GESTIONAR (carta-manager):
- carta.save / carta.get / carta.list / carta.delete
- carta.add_product / carta.remove_product / carta.update_product
- carta.add_category / carta.update_prices
- carta.search / carta.stats
- carta.versions / carta.restore

TARIFAS:
- tarifas.set_canal / tarifas.get / tarifas.preview / tarifas.set_precio_fijo`,
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
