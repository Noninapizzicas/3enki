<script lang="ts">
  /**
   * MotorPropuestaPanel — wrapper del contrato del sistema.
   * El único prop es panelId (el contrato UIModule). Delega en el widget.
   */
  import MotorPropuestaWidget from './MotorPropuestaWidget.svelte';

  export let panelId: string;
</script>

<div data-motor-propuesta-panel={panelId}>
  <MotorPropuestaWidget {panelId} />
</div>
