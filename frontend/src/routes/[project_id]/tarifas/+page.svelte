<script lang="ts">
  /**
   * Pagina Tarifas (scoped a proyecto)
   *
   * URL: /[project_id]/tarifas
   *
   * El contexto de la página se deriva en el backend a partir de la URL:
   * chat.ts envía page=/tarifas → prompt-engine resuelve al módulo tarifas
   * y usa sus tools como contexto.
   */
  import { LazyShell } from '$lib/components/layout';
</script>

<LazyShell />
