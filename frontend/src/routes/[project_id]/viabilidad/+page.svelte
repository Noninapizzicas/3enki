<script lang="ts">
  /**
   * Pagina Viabilidad (scoped a proyecto)
   *
   * URL: /[project_id]/viabilidad
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
      route: '/viabilidad',
      title: 'Viabilidad',
      description: 'Estudio de viabilidad de negocio: punto de equilibrio, proyecciones, escenarios y rentabilidad.',
      instructions: `El usuario está en la sección de viabilidad para el proyecto "${project_id}". Ayuda a evaluar si el negocio es rentable.

CONTEXTO: Negocio nuevo que se monta desde cero. Usa datos de las recetas (costes) para calcular viabilidad.

Tools disponibles:
- viabilidad.estudio: estudio completo de viabilidad (necesita gastos fijos mensuales como mínimo)
- viabilidad.punto_equilibrio: cuántos comensales/día necesitas para cubrir gastos
- viabilidad.escenario: calcula un escenario concreto
- viabilidad.comparar_escenarios: compara varios escenarios lado a lado
- viabilidad.proyeccion: proyección financiera a 3/6/12 meses
- viabilidad.guardar_config: guarda datos del negocio para reutilizar

Flujo típico:
1. "Gastos fijos: 3000€/mes, local, suministros, personal. Ticket medio 15€. 40 comensales al día"
   → guarda config y genera estudio
2. "¿Cuánto necesito vender para no perder?" → punto de equilibrio
3. "Compara 30, 50 y 70 comensales al día" → escenarios
4. "Proyección a 12 meses empezando con 20 comensales y llegando a 60" → proyección
5. "Inversión inicial 50.000€, ¿cuándo la recupero?" → ROI

IMPORTANTE: Sé realista y honesto. Si los números no salen, dilo claro.`,
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
