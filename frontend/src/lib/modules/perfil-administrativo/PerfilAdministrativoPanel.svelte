<script lang="ts">
  /**
   * PerfilAdministrativoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'perfil-administrativo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './perfil-administrativo.blueprint.json';

  export let panelId = '';
</script>

<div data-perfil-administrativo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="perfil-administrativo" titulo="🧾 Perfil administrativo — generado del blueprint" />
</div>
