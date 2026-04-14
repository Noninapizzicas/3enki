<script lang="ts">
  import { formatISO, formatDistanceToNow } from 'date-fns';
  import { es } from 'date-fns/locale';
  import type { RecetaCompleta } from '$lib/stores/recetas-v2.types';

  export let recipe: RecetaCompleta;
  export let version: number;
  export let changedBy: string = 'Sistema';
  export let changedAt: number = Date.now();
  export let description: string = '';

  $: estadoColor = {
    activa: '#28a745',
    borrador: '#ffc107',
    archivada: '#6c757d'
  }[recipe.estado] || '#6c757d';
</script>

<div class="version-detail">
  <div class="header">
    <div class="version-badge">
      <span class="badge-label">Versión</span>
      <span class="badge-value">{version}</span>
    </div>

    <div class="metadata">
      <div class="meta-item">
        <span class="label">Estado:</span>
        <span class="value" style="color: {estadoColor}">
          {recipe.estado}
        </span>
      </div>
      <div class="meta-item">
        <span class="label">Cambio:</span>
        <span class="value" title={formatISO(changedAt)}>
          {formatDistanceToNow(changedAt, { locale: es, addSuffix: true })}
        </span>
      </div>
      <div class="meta-item">
        <span class="label">Por:</span>
        <span class="value">{changedBy}</span>
      </div>
    </div>
  </div>

  {#if description}
    <div class="description-box">
      <p>{description}</p>
    </div>
  {/if}

  <div class="content-grid">
    <!-- Sección: Información Básica -->
    <section class="section">
      <h3>Información Básica</h3>
      <div class="field-group">
        <div class="field">
          <span class="field-label">Nombre</span>
          <span class="field-value">{recipe.nombre}</span>
        </div>

        {#if recipe.descripcion}
          <div class="field">
            <span class="field-label">Descripción</span>
            <span class="field-value">{recipe.descripcion}</span>
          </div>
        {/if}

        <div class="field">
          <span class="field-label">Porciones</span>
          <span class="field-value">{recipe.porciones}</span>
        </div>

        {#if recipe.tiempo_preparacion}
          <div class="field">
            <span class="field-label">Tiempo</span>
            <span class="field-value">{recipe.tiempo_preparacion} min</span>
          </div>
        {/if}

        {#if recipe.dificultad}
          <div class="field">
            <span class="field-label">Dificultad</span>
            <span class="field-value">
              {recipe.dificultad}/10
              <div class="difficulty-bar">
                <div class="bar-fill" style="width: {(recipe.dificultad / 10) * 100}%" />
              </div>
            </span>
          </div>
        {/if}
      </div>
    </section>

    <!-- Sección: Ingredientes -->
    <section class="section">
      <h3>Ingredientes ({recipe.ingredientes.length})</h3>
      <div class="ingredients-list">
        {#each recipe.ingredientes as ing}
          <div class="ingredient-item">
            <span class="ing-name">{ing.nombre}</span>
            <span class="ing-amount">
              {ing.cantidad}{ing.unidad}
            </span>
            {#if ing.precio_mercado}
              <span class="ing-price">
                €{ing.precio_mercado.toFixed(2)}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Sección: Costes -->
    {#if recipe.coste_total || recipe.coste_porcion}
      <section class="section">
        <h3>Costes</h3>
        <div class="field-group">
          {#if recipe.coste_total}
            <div class="field">
              <span class="field-label">Total</span>
              <span class="field-value">€{recipe.coste_total.toFixed(2)}</span>
            </div>
          {/if}
          {#if recipe.coste_porcion}
            <div class="field">
              <span class="field-label">Por porción</span>
              <span class="field-value">€{recipe.coste_porcion.toFixed(2)}</span>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Sección: Análisis -->
    {#if recipe.analisis}
      <section class="section">
        <h3>Análisis</h3>
        <div class="field-group">
          <div class="field">
            <span class="field-label">Viabilidad</span>
            <span class="field-value viability-badge" class={recipe.analisis.viabilidad}>
              {recipe.analisis.viabilidad}
            </span>
          </div>

          {#if recipe.analisis.alerge nos_detectados}
            <div class="field">
              <span class="field-label">Alérgenos</span>
              <span class="field-value">
                {#each recipe.analisis.alerge nos_detectados as alg}
                  <span class="tag allergen">{alg}</span>
                {/each}
              </span>
            </div>
          {/if}

          {#if recipe.caracteristicas}
            <div class="field">
              <span class="field-label">Características</span>
              <span class="field-value">
                {#each recipe.caracteristicas as char}
                  <span class="tag characteristic">{char}</span>
                {/each}
              </span>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Sección: Instrucciones -->
    {#if recipe.instrucciones && recipe.instrucciones.length > 0}
      <section class="section full-width">
        <h3>Preparación</h3>
        <ol class="instructions-list">
          {#each recipe.instrucciones as instr, i}
            <li>
              <span class="step-number">{i + 1}</span>
              {instr}
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <!-- Sección: Categorías y Etiquetas -->
    {#if (recipe.categorias && recipe.categorias.length > 0) || (recipe.etiquetas && recipe.etiquetas.length > 0)}
      <section class="section full-width">
        <h3>Categorías y Etiquetas</h3>
        <div class="tags-section">
          {#if recipe.categorias && recipe.categorias.length > 0}
            <div class="tag-group">
              <span class="tag-group-label">Categorías:</span>
              {#each recipe.categorias as cat}
                <span class="tag category">{cat}</span>
              {/each}
            </div>
          {/if}

          {#if recipe.etiquetas && recipe.etiquetas.length > 0}
            <div class="tag-group">
              <span class="tag-group-label">Etiquetas:</span>
              {#each recipe.etiquetas as tag}
                <span class="tag etiqueta">{tag}</span>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .version-detail {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
    background: var(--color-bg-secondary);
    border-radius: 8px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .version-badge {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .badge-label {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .badge-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-accent);
  }

  .metadata {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    flex: 1;
  }

  .meta-item {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.95rem;
  }

  .meta-item .label {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .meta-item .value {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .description-box {
    padding: 1rem;
    background: var(--color-accent-soft);
    border-radius: 6px;
    border-left: 4px solid var(--color-accent);
  }

  .description-box p {
    margin: 0;
    color: var(--color-text-primary);
    line-height: 1.5;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section.full-width {
    grid-column: 1 / -1;
  }

  .section h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .field-label {
    font-weight: 500;
    color: var(--color-text-secondary);
    min-width: 120px;
  }

  .field-value {
    color: var(--color-text-primary);
    text-align: right;
    flex: 1;
  }

  .difficulty-bar {
    width: 100%;
    height: 6px;
    background: var(--color-border);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 0.25rem;
  }

  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #28a745, #ffc107, #dc3545);
    border-radius: 3px;
  }

  .ingredients-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ingredient-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem;
    background: var(--color-bg-primary);
    border-radius: 4px;
    font-size: 0.95rem;
  }

  .ing-name {
    flex: 1;
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .ing-amount {
    color: var(--color-text-secondary);
    min-width: 70px;
    text-align: right;
  }

  .ing-price {
    color: var(--color-accent);
    min-width: 60px;
    text-align: right;
    font-weight: 500;
  }

  .viability-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .viability-badge.alta {
    background: rgba(40, 167, 69, 0.2);
    color: #28a745;
  }

  .viability-badge.media {
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
  }

  .viability-badge.baja {
    background: rgba(220, 53, 69, 0.2);
    color: #dc3545;
  }

  .tag {
    display: inline-block;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    font-size: 0.8rem;
    margin-right: 0.5rem;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .tag.allergen {
    background: rgba(220, 53, 69, 0.15);
    color: #dc3545;
  }

  .tag.characteristic {
    background: rgba(0, 123, 255, 0.15);
    color: #007bff;
  }

  .tag.category {
    background: rgba(40, 167, 69, 0.15);
    color: #28a745;
  }

  .tag.etiqueta {
    background: rgba(111, 66, 193, 0.15);
    color: #6f42c1;
  }

  .tags-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tag-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .tag-group-label {
    font-weight: 600;
    color: var(--color-text-secondary);
    min-width: 100px;
  }

  .instructions-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .instructions-list li {
    display: flex;
    gap: 1rem;
    padding: 0.75rem;
    background: var(--color-bg-primary);
    border-radius: 4px;
    line-height: 1.5;
    color: var(--color-text-primary);
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    background: var(--color-accent);
    color: white;
    border-radius: 50%;
    font-weight: 600;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
</style>
