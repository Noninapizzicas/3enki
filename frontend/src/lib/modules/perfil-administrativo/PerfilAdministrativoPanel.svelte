<script lang="ts">
  /**
   * PerfilAdministrativoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'perfil-administrativo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './perfil-administrativo.blueprint.json';

  export let panelId = '';
</script>

<div data-perfil-administrativo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🏛️ Perfil administrativo — generado del blueprint" />
</div>
