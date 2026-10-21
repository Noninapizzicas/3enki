<script lang="ts">
  /**
   * CatalogoCuentasPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'catalogo-cuentas' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './catalogo-cuentas.blueprint.json';

  export let panelId = '';
</script>

<div data-catalogo-cuentas-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="📒 Catálogo de cuentas — generado del blueprint" />
</div>
