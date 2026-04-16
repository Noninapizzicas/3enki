<script lang="ts">
  /**
   * RecipeInvestigationResult - Mostrar resultados de investigación de receta
   *
   * Muestra:
   * - Receta encontrada o plantilla para generar
   * - Ingredientes y costes
   * - Viabilidad
   * - Botones para editar, guardar o cancelar
   *
   * Props:
   * - data: Resultado de handleInvestigarReceta
   */

  import Button from '$lib/components/base/Button.svelte';
  import { createEventDispatcher } from 'svelte';

  interface InvestigationResult {
    investigacion_id: string;
    status: 'receta_encontrada' | 'needs_generation';
    confianza: 'alta' | 'media' | 'baja';
    nombre_buscado: string;
    receta: {
      nombre: string;
      descripcion?: string;
      ingredientes?: any[];
      porciones?: number;
      elaboracion?: string[];
      estado?: string;
    };
    costes?: {
      coste_total: number;
      coste_porcion: number;
      detalles?: any[];
    };
    viabilidad?: {
      estado: string;
      razon: string;
      confianza_alta: boolean;
    };
    flags?: string[];
  }

  export let data: InvestigationResult;

  const dispatch = createEventDispatcher<{
    save: { receta: any };
    edit: { receta: any };
    cancel: void;
  }>();

  let isEditing = false;
  let editedReceta = { ...data.receta };

  function handleSave() {
    dispatch('save', { receta: editedReceta });
  }

  function handleEdit() {
    isEditing = !isEditing;
  }

  function handleCancel() {
    isEditing = false;
    editedReceta = { ...data.receta };
    dispatch('cancel');
  }

  // Determinar icono de confianza
  function getConfidenceIcon(confidence: string): string {
    switch (confidence) {
      case 'alta':
        return '✅';
      case 'media':
        return '⚠️';
      case 'baja':
        return '❓';
      default:
        return '❓';
    }
  }

  // Determinar color de status
  function getStatusColor(status: string): string {
    return status === 'receta_encontrada' ? '#28a745' : '#ffc107';
  }
</script>

<div class="investigation-result">
  <!-- Header -->
  <div class="header">
    <div class="title-section">
      <h3>🔍 Investigación de Receta</h3>
      <div class="badge-group">
        <span class="badge status" style="background-color: {getStatusColor(data.status)}">
          {data.status === 'receta_encontrada' ? 'Encontrada' : 'Necesita Generación'}
        </span>
        <span class="badge confidence">
          {getConfidenceIcon(data.confianza)} {data.confianza}
        </span>
      </div>
    </div>
    <div class="meta-info">
      <span class="search-label">Búsqueda: <strong>{data.nombre_buscado}</strong></span>
      <span class="investigation-id">ID: {data.investigacion_id.substring(0, 12)}...</span>
    </div>
  </div>

  <!-- Contenido principal -->
  <div class="content">
    {#if data.status === 'receta_encontrada'}
      <!-- Receta encontrada -->
      <div class="section found">
        <h4>📋 Receta Encontrada</h4>

        <div class="recipe-grid">
          <!-- Nombre -->
          <div class="field">
            <label>Nombre</label>
            {#if isEditing}
              <input
                type="text"
                bind:value={editedReceta.nombre}
                placeholder="Nombre de receta"
              />
            {:else}
              <span class="value">{data.receta.nombre}</span>
            {/if}
          </div>

          <!-- Descripción -->
          {#if data.receta.descripcion}
            <div class="field full-width">
              <label>Descripción</label>
              {#if isEditing}
                <textarea
                  bind:value={editedReceta.descripcion}
                  placeholder="Descripción"
                  rows="2"
                />
              {:else}
                <span class="value">{data.receta.descripcion}</span>
              {/if}
            </div>
          {/if}

          <!-- Porciones -->
          {#if data.receta.porciones}
            <div class="field">
              <label>Porciones</label>
              {#if isEditing}
                <input
                  type="number"
                  bind:value={editedReceta.porciones}
                  placeholder="Porciones"
                />
              {:else}
                <span class="value">{data.receta.porciones}</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Ingredientes -->
        {#if data.receta.ingredientes && data.receta.ingredientes.length > 0}
          <div class="subsection">
            <h5>Ingredientes ({data.receta.ingredientes.length})</h5>
            <div class="ingredients-list">
              {#each data.receta.ingredientes as ing}
                <div class="ingredient-item">
                  <span class="ing-name">{ing.nombre || 'Sin nombre'}</span>
                  {#if ing.cantidad}
                    <span class="ing-qty">{ing.cantidad} {ing.unidad || ''}</span>
                  {/if}
                  {#if ing.precio_mercado_en_momento !== undefined}
                    <span class="ing-price">€{ing.precio_mercado_en_momento.toFixed(2)}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Costes -->
        {#if data.costes}
          <div class="subsection">
            <h5>💰 Costes</h5>
            <div class="costs-grid">
              <div class="cost-item">
                <span class="cost-label">Coste Total</span>
                <span class="cost-value">€{data.costes.coste_total.toFixed(2)}</span>
              </div>
              <div class="cost-item">
                <span class="cost-label">Por Porción</span>
                <span class="cost-value">€{data.costes.coste_porcion.toFixed(2)}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Viabilidad -->
        {#if data.viabilidad}
          <div class="subsection viability">
            <h5>✨ Viabilidad</h5>
            <div class="viability-item">
              <span class="viab-status" style="color: {data.viabilidad.estado === 'VIABLE' ? '#28a745' : '#dc3545'}">
                {data.viabilidad.estado}
              </span>
              <span class="viab-reason">{data.viabilidad.razon}</span>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Necesita generación -->
      <div class="section needs-generation">
        <h4>🤖 Requiere Generación con IA</h4>
        <p class="info-text">
          La receta "{data.nombre_buscado}" no fue encontrada en la base de datos.
          Se puede generar usando Claude IA en la próxima fase.
        </p>

        {#if data.receta}
          <div class="draft-info">
            <span class="draft-label">Nombre: {data.receta.nombre}</span>
            {#if data.receta.descripcion}
              <span class="draft-label">Descripción: {data.receta.descripcion}</span>
            {/if}
          </div>
        {/if}

        {#if data.flags && data.flags.length > 0}
          <div class="flags">
            {#each data.flags as flag}
              <span class="flag">{flag}</span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Actions -->
  <div class="actions">
    {#if data.status === 'receta_encontrada'}
      {#if isEditing}
        <Button variant="success" size="sm" on:click={handleSave}>
          💾 Guardar Cambios
        </Button>
        <Button variant="secondary" size="sm" on:click={handleCancel}>
          ✕ Cancelar
        </Button>
      {:else}
        <Button variant="primary" size="sm" on:click={handleEdit}>
          ✏️ Editar
        </Button>
        <Button variant="success" size="sm" on:click={handleSave}>
          ✅ Guardar Receta
        </Button>
        <Button variant="secondary" size="sm" on:click={handleCancel}>
          ✕ Cancelar
        </Button>
      {/if}
    {:else}
      <Button variant="secondary" size="sm" on:click={handleCancel}>
        ✕ Cerrar
      </Button>
      <span class="info-text small">Fase 2 está en desarrollo</span>
    {/if}
  </div>
</div>

<style>
  .investigation-result {
    background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
    border-left: 4px solid #007bff;
    border-radius: 0.5rem;
    padding: 1.25rem;
    margin: 0.75rem 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title-section h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #222;
  }

  .badge-group {
    display: flex;
    gap: 0.5rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: white;
  }

  .badge.status {
    background-color: #28a745;
  }

  .badge.confidence {
    background-color: #6c757d;
  }

  .meta-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #666;
  }

  .search-label,
  .investigation-id {
    display: block;
  }

  .search-label strong {
    color: #222;
  }

  .content {
    margin: 1rem 0;
  }

  .section {
    margin-bottom: 1rem;
  }

  .section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: #222;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 0.5rem;
  }

  .section.found {
    background: white;
    padding: 1rem;
    border-radius: 0.4rem;
  }

  .section.needs-generation {
    background: #fffaeb;
    padding: 1rem;
    border-radius: 0.4rem;
  }

  .recipe-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field.full-width {
    grid-column: 1 / -1;
  }

  .field label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #555;
  }

  .field input,
  .field textarea {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 0.3rem;
    font-size: 0.9rem;
    font-family: inherit;
  }

  .field input:focus,
  .field textarea:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .field .value {
    font-size: 0.95rem;
    color: #333;
  }

  .subsection {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e0e0e0;
  }

  .subsection h5 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
    color: #555;
  }

  .ingredients-list {
    display: grid;
    gap: 0.5rem;
  }

  .ingredient-item {
    display: flex;
    gap: 1rem;
    padding: 0.5rem;
    background: #fafafa;
    border-radius: 0.3rem;
    font-size: 0.9rem;
    align-items: center;
  }

  .ing-name {
    flex: 1;
    font-weight: 500;
    color: #333;
  }

  .ing-qty,
  .ing-price {
    color: #666;
    white-space: nowrap;
  }

  .ing-price {
    font-weight: 600;
    color: #28a745;
  }

  .costs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .cost-item {
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    background: #f0f8ff;
    border-radius: 0.3rem;
    border-left: 3px solid #007bff;
  }

  .cost-label {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.25rem;
  }

  .cost-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #007bff;
  }

  .viability {
    background: #f0fff4;
    padding: 0.75rem;
    border-radius: 0.3rem;
    border-left: 3px solid #28a745;
  }

  .viability-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .viab-status {
    font-weight: 700;
    font-size: 1rem;
  }

  .viab-reason {
    font-size: 0.9rem;
    color: #555;
  }

  .info-text {
    margin: 0.75rem 0;
    font-size: 0.95rem;
    color: #666;
    line-height: 1.5;
  }

  .info-text.small {
    font-size: 0.85rem;
    color: #999;
  }

  .draft-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.75rem 0;
    padding: 0.75rem;
    background: white;
    border-radius: 0.3rem;
  }

  .draft-label {
    font-size: 0.9rem;
    color: #555;
  }

  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .flag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #e7f3ff;
    border: 1px solid #b3d9ff;
    border-radius: 0.25rem;
    font-size: 0.8rem;
    color: #0066cc;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid #e0e0e0;
    align-items: center;
    flex-wrap: wrap;
  }
</style>
