<script lang="ts">
  /**
   * Pagina Ingredientes (scoped a proyecto)
   *
   * URL: /[project_id]/ingredientes
   *
   * El contexto de la página se deriva en el backend a partir de la URL:
   * chat.ts envía page=/ingredientes → prompt-engine resuelve al módulo
   * ingredientes y usa su contexto.
   */
  import { LazyShell } from '$lib/components/layout';
</script>

<LazyShell />
