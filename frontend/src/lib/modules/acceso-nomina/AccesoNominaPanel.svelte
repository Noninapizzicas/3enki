<script lang="ts">
  /**
   * AccesoNominaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'acceso-nomina' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './acceso-nomina.blueprint.json';

  export let panelId = '';
</script>

<div data-acceso-nomina-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="acceso-nomina" titulo="👤 Acceso a nómina — generado del blueprint" />
</div>
