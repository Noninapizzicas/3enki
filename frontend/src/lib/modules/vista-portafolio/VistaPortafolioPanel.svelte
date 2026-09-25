<script lang="ts">
  /**
   * VistaPortafolioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'vista-portafolio' (con su sección `ui`
   * declarada por F6½) y lo entrega al componente dinámico. Lo ÚNICO específico
   * por módulo: <BlueprintForm blueprint moduleId />.
   * moduleId = el DOMINIO MQTT real (ui_handlers del module.json), con guion.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './vista-portafolio.blueprint.json';

  export let panelId = '';
</script>

<div data-vista-portafolio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="vista-portafolio" titulo="📊 Portafolio de nichos — generado del blueprint" />
</div>
