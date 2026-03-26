<script lang="ts">
  /**
   * Pagina Carta Design (scoped a proyecto)
   *
   * URL: /[project_id]/carta-design
   *
   * Estudio de diseño profesional de cartas impresas.
   * El LLM genera HTML+CSS completo, este módulo provee las tools
   * y la galería de diseños/perfiles.
   *
   * Consumidor READ-ONLY de datos de carta — diseña pero no modifica productos.
   */
  import { onMount, onDestroy, getContext } from 'svelte';
  import { page } from '$app/stores';
  import { LazyShell } from '$lib/components/layout';
  import { setPageContext, clearPageContext } from '$lib/stores/page-context';

  $: project_id = $page.params.project_id;

  const projectStore = getContext<any>('project');

  onMount(() => {
    setPageContext({
      route: '/carta-design',
      title: 'Carta Design',
      description: 'Estudio de diseño profesional de cartas impresas con HTML5+CSS.',
      instructions: `El usuario está en el estudio de diseño de cartas para el proyecto "${project_id}".
Este módulo es un CONSUMIDOR READ-ONLY — diseña la carta visualmente pero NO modifica productos, precios ni ingredientes.
Si el usuario quiere cambiar datos de productos → derivar a menu-generator.

FLUJO DE TRABAJO:
1. Llamar design.load_carta para cargar datos de la carta activa
2. Consultar design.profiles para ver estilos disponibles
3. Generar HTML5+CSS COMPLETO aplicando marketing y diseño profesional
4. Llamar design.save para guardar y abrir preview en el navegador

Tools de diseño (este módulo):
- design.load_carta: carga carta + hints de layout (productos, precios, layout sugerido)
- design.profiles: lista perfiles de estilo (built-in + custom)
- design.save: guarda HTML y abre preview automáticamente
- design.save_profile: guarda perfil de estilo reutilizable
- design.delete_profile: elimina perfil custom
- design.gallery: lista diseños previos de una carta

Para cambiar productos/precios/ingredientes → menu-generator:
- menu.update_product, menu.add_product, menu.update_prices, etc.

IMPORTANTE: Aplicar psicología de ventas, jerarquía visual, marketing gastronómico.
Fondos, gradients, texturas CSS, Google Fonts — todo se imprime con print-color-adjust: exact.`,
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
