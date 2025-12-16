<script lang="ts">
  /**
   * Página principal - Sistema de UI modular con lazy loading
   *
   * Bootstrap mínimo:
   * - Core (MQTT)
   * - Shell UI
   * - Definiciones de módulos (sin cargar)
   *
   * Módulos se cargan bajo demanda al navegar.
   */
  import { LazyShell } from '$lib/components/layout';
</script>

<LazyShell />
