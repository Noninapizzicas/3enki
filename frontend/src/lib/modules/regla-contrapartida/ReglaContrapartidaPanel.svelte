<script lang="ts">
  /**
   * ReglaContrapartidaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'regla-contrapartida' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './regla-contrapartida.blueprint.json';

  export let panelId = '';
</script>

<div data-regla-contrapartida-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="regla-contrapartida" titulo="📥 Reglas de contrapartida — generado del blueprint" />
</div>
