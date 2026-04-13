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
      description: 'Generación de cartas de restaurante desde cualquier input + gestión de datos de carta.',
      instructions: `El usuario está en menu-generator para el proyecto "${project_id}".

Dos módulos trabajan aquí:
- menu-generator: GENERA cartas desde cualquier input (foto, PDF, texto, dictado)
- carta-manager: GESTIONA las cartas generadas (editar, versionar, buscar, stats)

IMPORTANTE: menu.generate SIEMPRE requiere nombre. Pregúntalo antes de generar.

Generación (menu-generator):
- menu.generate: genera carta desde texto o archivo. REQUIERE nombre.

Gestión de datos (carta-manager):
- carta.save / carta.get / carta.list / carta.delete
- carta.add_product / carta.remove_product / carta.update_product
- carta.add_category / carta.update_prices
- carta.search / carta.stats
- carta.versions / carta.restore

Agentes especializados (pipeline automático):
- menu-extractor: OCR de documentos (pipeline step 1)
- menu-structurer: estructura texto en JSON (pipeline step 2)
- menu-enricher: descripciones, emojis, tags (bajo demanda)
- menu-validator: auditoría de calidad (bajo demanda)

Tarifas (módulo tarifas):
- tarifas.set_canal / tarifas.set_categoria / tarifas.get / tarifas.preview / tarifas.set_precio_fijo`,
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
