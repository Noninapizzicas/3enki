<script lang="ts">
  /**
   * /staff — Panel de personal
   *
   * Módulo desactivado en producción hasta activación explícita.
   * Ver modules/staff-manager en config.json → disabled.
   */
  import { StaffScreen } from '$lib/components/staff';
</script>

<svelte:head>
  <title>Personal</title>
</svelte:head>

<StaffScreen />
