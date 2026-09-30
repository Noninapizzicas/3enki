<script lang="ts">
  /**
   * ObligacionSeguridadSocialPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'obligacion-seguridad-social' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './obligacion-seguridad-social.blueprint.json';

  export let panelId = '';
</script>

<div data-obligacion-seguridad-social-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="obligacion-seguridad-social" titulo="👤 Obligación Seguridad Social — generado del blueprint" />
</div>
