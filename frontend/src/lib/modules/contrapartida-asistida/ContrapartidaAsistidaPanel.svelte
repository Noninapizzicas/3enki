<script lang="ts">
  /**
   * ContrapartidaAsistidaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'contrapartida-asistida' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './contrapartida-asistida.blueprint.json';

  export let panelId = '';
</script>

<div data-contrapartida-asistida-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contrapartida-asistida" titulo="⚙️ Contrapartida asistida — generado del blueprint" />
</div>
