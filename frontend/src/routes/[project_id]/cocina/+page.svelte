<script lang="ts">
  /**
   * Página Cocina — Display de cocina en tiempo real
   *
   * Scoped por proyecto: /{project_id}/cocina
   * Diseñada para fullscreen en tablet/ESP32-P4
   */
  import { CocinaScreen } from '$lib/components/cocina';
</script>

<svelte:head>
  <title>Cocina</title>
</svelte:head>

<CocinaScreen />
