<script lang="ts">
  /**
   * AislamientoNegocioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'aislamiento-negocio' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './aislamiento-negocio.blueprint.json';

  export let panelId = '';
</script>

<div data-aislamiento-negocio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="aislamiento-negocio" titulo="📦 Aislamiento de negocio — generado del blueprint" />
</div>
