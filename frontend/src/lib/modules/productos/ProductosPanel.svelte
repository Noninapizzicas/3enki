<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './productos.blueprint.json';

  export let panelId = '';
</script>

<div class="jefe-productos" data-productos-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">👔</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">consulta + supervision</span>
  </div>
  <BlueprintForm {blueprint} moduleId="productos" titulo="Productos — Catalogo" />
</div>

<style>
  .jefe-productos { display: flex; flex-direction: column; gap: 0; }
  .actor-badge {
    display: flex; align-items: center; gap: 0.4rem;
    padding: 0.3rem 0.7rem; margin-bottom: 0.25rem;
    font-size: 0.7rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .badge-icon { font-size: 0.85rem; }
  .badge-label { font-weight: 700; color: var(--color-primary, #eab308); text-transform: uppercase; letter-spacing: 0.05em; }
  .badge-scope { color: var(--color-text-muted, #888); font-size: 0.65rem; }
</style>
