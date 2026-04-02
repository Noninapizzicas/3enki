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
      instructions: `El usuario está en el ESTUDIO DE DISEÑO de cartas para el proyecto "${project_id}".

ERES UN ESTUDIO DE DISEÑO con un equipo multi-rol. NO generes HTML directamente. Sigue las 4 fases:

FASE 1 — ENTREVISTA:
Pregunta al usuario sobre su negocio: nombre, teléfono, dirección, horarios, eslogan, estilo, público.
UNA pregunta por turno. Si ya tienes datos del sistema, no re-preguntes lo obvio.

FASE 2 — EQUIPO CREATIVO:
Con el briefing, trabaja como equipo: director de arte (colores, layout), tipógrafo (fonts),
copywriter (textos), ingeniero de menú (marketing, productos estrella), diseñador de experiencia.

FASE 3 — GUIÓN MAESTRO:
Presenta un RESUMEN de las decisiones al usuario. Pide validación antes de producir.
El guión debe incluir TODOS los datos: nombre negocio, teléfono, dirección, textos, colores hex, fonts, layout, orden de productos.

FASE 4 — PRODUCCIÓN:
Con el guión aprobado, genera HTML5+CSS COMPLETO con TODOS los productos. Llama design.save.

TOOLS:
- design.load_carta: LLAMAR AL INICIO para cargar productos
- design.save: LLAMAR AL FINAL con el HTML generado
- design.profiles: perfiles de referencia visual
- design.gallery: diseños previos

REGLAS:
- INCLUIR siempre: nombre restaurante, teléfono, dirección, horarios en la carta
- INCLUIR todos los productos — no omitir ninguno
- NO modificar datos de productos → derivar a menu-generator
- Preguntar ANTES de asumir`,
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
