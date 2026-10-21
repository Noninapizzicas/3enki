<script lang="ts">
  /**
   * InterfazDinamicoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'interfaz' y lo entrega al componente dinámico.
   * Este fichero es lo ÚNICO específico por módulo: <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from '$lib/modules/interfaz/interfaz.blueprint.json';

  export let panelId = '';
</script>

<BlueprintForm {blueprint} moduleId="interfaz" titulo="🧬 Radar (auto) — generado del blueprint" />
