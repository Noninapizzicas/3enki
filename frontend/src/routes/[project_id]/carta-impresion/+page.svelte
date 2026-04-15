<script lang="ts">
  /**
   * Página Carta Impresión (scoped a proyecto)
   *
   * URL: /[project_id]/carta-impresion
   *
   * Gestión de versiones imprimibles de las cartas. Ver preview, regenerar,
   * imprimir. Los agentes architect + builder hacen el trabajo creativo.
   */
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  onMount(() => {
    setPageContext({
      route: '/carta-impresion',
      title: 'Carta Impresión',
      description: 'Versiones imprimibles de las cartas. Los agentes deciden layout y generan HTML print-ready.',
      instructions: `Proyecto "${project_id}". Aquí el usuario gestiona las cartas imprimibles.

Agentes disponibles (se lanzan automáticamente al cambiar carta):
- impresion-architect: Analiza la carta y decide layout óptimo (caras, columnas, formato) con criterio adaptado a los datos y perfil de marca
- impresion-builder: Genera el HTML+CSS print-ready según el guión del architect

Tools disponibles:
- impresion.get: obtener el HTML generado
- impresion.generar: forzar regeneración (dispara architect → builder)
- impresion.save_html: usado por el builder para guardar

El usuario puede pedir:
- "Regenera la carta X para imprimir" → dispara impresion.generar
- "Quiero ver cómo quedó la carta impresa" → busca con impresion.get
- "No me gusta el formato, hazla en 2 columnas" → llama al architect con instrucciones específicas
- "Necesito una imagen de fondo para la carta" → el builder puede sugerir un prompt

Las cartas se regeneran automáticamente cuando cambian (debounce 5s) — no hace falta disparar manualmente salvo que se quiera un formato distinto.`,
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
