<script lang="ts">
  /**
   * Página Carta Marketing (scoped a proyecto)
   *
   * URL: /[project_id]/carta-marketing
   *
   * Backoffice del equipo de marketing. Muestra el perfil de marca y la
   * actividad del sistema. La configuración se hace principalmente via chat
   * con el agente marketing-onboarding.
   */
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  onMount(() => {
    setPageContext({
      route: '/carta-marketing',
      title: 'Carta Marketing',
      description: 'Perfil de marca del proyecto y actividad del equipo de marketing silencioso.',
      instructions: `Proyecto "${project_id}". Aquí el usuario gestiona el perfil de marca del proyecto — el que usan los agentes de marketing para enriquecer cartas automáticamente.

Agentes disponibles (vía agent.execute.request):
- marketing-onboarding: Entrevista conversacional para construir perfil. Si el usuario nunca ha configurado el perfil, lánzalo para que haga preguntas simples ("¿cómo se llama el sitio?", "¿quién viene?", etc.)
- marketing-copywriter: Escribe descripciones. Ya se dispara automáticamente al cambiar carta.
- marketing-strategist: Ingeniería de menú. Ya se dispara automáticamente.
- marketing-brand-keeper: Revisa coherencia. Ya se dispara automáticamente.

Tools disponibles:
- marketing.get_perfil: ver perfil actual
- marketing.update_perfil: actualizar campos (nombre, tono, idioma, publico, valores, colores, prohibido, referencia_visual)
- marketing.completar_onboarding: marcar onboarding como completo
- marketing.actividad: ver stats

Si el usuario pide algo como "configura el marketing" o "quiero personalizar la marca", dispara marketing-onboarding. Si pide ajustar algo puntual, usa marketing.update_perfil directamente.`,
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
