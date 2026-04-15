<script lang="ts">
  /**
   * Pagina Carta Digital (scoped a proyecto)
   *
   * URL: /[project_id]/carta-digital
   *
   * Backoffice de la carta pública. Configura branding, compone la carta
   * final (datos + marketing + ofertas), genera PWA.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/carta-digital',
      title: 'Carta Digital',
      description: 'Backoffice de la carta pública: branding, composición, ofertas, generación de PWA.',
      instructions: `Proyecto "${project_id}". Aquí se configura y genera la carta pública que verá el cliente final.

CARTA-DIGITAL NO MODIFICA DATOS DE CARTA. Para cambiar productos, precios o ingredientes → carta-manager (tools carta.*).

Tools de este módulo:
- cartadigital.get_config: ver configuración de branding
- cartadigital.update_config: actualizar (WhatsApp, nombre negocio, colores, features)
- cartadigital.get_carta_publica: obtener la carta compuesta (si existe en caché)

Agentes especializados disponibles via agent.execute.request:
- cartadigital-composer: compone carta final uniendo datos + marketing + config
- cartadigital-pwa-builder: genera paquete PWA (HTML + SW + manifest)
- cartadigital-ofertas: gestiona ofertas y combos (crea, sugiere, valida)
- cartadigital-reviewer: revisa completitud antes de publicar

Si el usuario pide:
- "Configura los colores" / "cambia el WhatsApp" → cartadigital.update_config
- "Genera la PWA" / "exporta la carta" → dispara cartadigital-pwa-builder
- "Crea una oferta" / "haz un combo" → dispara cartadigital-ofertas
- "¿Está todo listo para publicar?" → dispara cartadigital-reviewer
- "Cambia el precio de X" / "añade producto" → DERIVAR a carta-manager (carta.update_product, carta.update_prices, etc.)`,
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
