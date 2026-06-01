<script lang="ts">
  /**
   * IngredientesPanel — router interno del modulo ingredientes (Postura B:
   * UI solo lectura, mutaciones via chat). Patron hermano: RecetasPanel /
   * ViabilidadPanel (activeView local).
   *
   * Vistas:
   *   - browser: catalogo + buscador + bulk precios
   *   - detail:  datos de un ingrediente + actualizar precio (prefill chat)
   */

  import { onMount } from 'svelte';
  import IngredientesBrowser from './IngredientesBrowser.svelte';
  import IngredienteDetail from './IngredienteDetail.svelte';
  import { loadIngredientes } from '$lib/stores/recetas';

  export let panelId: string = '';

  let activeView: 'browser' | 'detail' = 'browser';
  let selectedNombre: string | null = null;

  onMount(() => {
    loadIngredientes();
  });

  function handleSelect(nombre: string) {
    selectedNombre = nombre;
    activeView = 'detail';
  }

  function handleBack() {
    activeView = 'browser';
  }
</script>

<div class="panel-container">
  {#if activeView === 'browser'}
    <IngredientesBrowser onSelectIngrediente={handleSelect} />
  {:else if activeView === 'detail'}
    <IngredienteDetail {selectedNombre} onBack={handleBack} />
  {/if}
</div>

<style>
  .panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 13px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    overflow: hidden;
  }
</style>
