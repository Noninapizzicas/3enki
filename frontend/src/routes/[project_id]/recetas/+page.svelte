<script lang="ts">
  /**
   * Pagina Recetas (scoped a proyecto)
   *
   * URL: /[project_id]/recetas
   *
   * El contexto de la página se deriva en el backend a partir de la URL:
   * chat.ts envía page=/recetas → prompt-engine resuelve al módulo recetas
   * y usa su prompt.json + tools como contexto.
   */
  import { LazyShell } from '$lib/components/layout';
</script>

<LazyShell />
