<script lang="ts">
  /**
   * PerfilPanel — Ver y editar el perfil de marca del proyecto
   *
   * El perfil se construye conversando con el agente marketing-onboarding.
   * Este panel permite revisar el resultado y ajustar puntos concretos.
   */
  import { onMount } from 'svelte';
  import {
    perfil,
    marketingLoading,
    marketingSaving,
    marketingError,
    onboardingCompletado,
    loadPerfil,
    updatePerfil,
    clearError
  } from '$lib/stores/carta-marketing';

  export let panelId: string = '';

  let editMode = false;
  let editando: any = {};

  $: p = $perfil;
  $: loading = $marketingLoading;
  $: saving = $marketingSaving;
  $: error = $marketingError;
  $: completado = $onboardingCompletado;

  onMount(() => loadPerfil());

  function startEdit() {
    editando = {
      nombre: p?.nombre || '',
      tono: p?.tono || '',
      idioma: p?.idioma || 'es',
      publico: p?.publico || '',
      valores: p?.valores || '',
      prohibido: p?.prohibido || '',
      referencia_visual: p?.referencia_visual || ''
    };
    editMode = true;
  }

  async function handleSave() {
    const ok = await updatePerfil(editando);
    if (ok) editMode = false;
  }

  function handleCancel() {
    editMode = false;
    editando = {};
  }
</script>

<div class="panel-body">
  {#if loading}
    <div class="state-msg">Cargando perfil...</div>
  {:else if error}
    <div class="error-msg">
      <span>{error}</span>
      <button class="close-btn" on:click={clearError}>✕</button>
    </div>
  {:else if !p}
    <div class="state-msg">Sin perfil</div>
  {:else if !completado}
    <div class="onboarding-prompt">
      <div class="empty-icon">💬</div>
      <p><strong>Todavía no te conocemos</strong></p>
      <p class="small">
        Pregúntale al chat algo como "hablame del marketing" o "ayúdame a configurar la marca"
        y el agente <code>marketing-onboarding</code> te hará unas preguntas para construir
        el perfil del proyecto.
      </p>
    </div>
  {:else if editMode}
    <!-- MODO EDICIÓN -->
    <div class="form-group">
      <label class="form-label" for="p-nombre">Nombre</label>
      <input id="p-nombre" class="form-input" bind:value={editando.nombre} placeholder="Nonina Pizzicas" />
    </div>

    <div class="form-group">
      <label class="form-label" for="p-tono">Tono de voz</label>
      <input id="p-tono" class="form-input" bind:value={editando.tono} placeholder="Cercano y familiar, con humor" />
    </div>

    <div class="form-row">
      <div class="form-group compact">
        <label class="form-label" for="p-idioma">Idioma</label>
        <input id="p-idioma" class="form-input" bind:value={editando.idioma} placeholder="es" />
      </div>
      <div class="form-group compact">
        <label class="form-label" for="p-publico">Público</label>
        <input id="p-publico" class="form-input" bind:value={editando.publico} placeholder="Familias, jóvenes" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-valores">Valores</label>
      <textarea id="p-valores" class="form-input" rows="2" bind:value={editando.valores}
        placeholder="Producto fresco, hecho a mano, recetas de siempre"></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-prohibido">Qué evitar</label>
      <textarea id="p-prohibido" class="form-input" rows="2" bind:value={editando.prohibido}
        placeholder="Anglicismos, tono pretencioso"></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-ref">Referencia visual</label>
      <input id="p-ref" class="form-input" bind:value={editando.referencia_visual}
        placeholder="Trattoria italiana moderna" />
    </div>

    <div class="actions">
      <button class="btn-secondary" on:click={handleCancel}>Cancelar</button>
      <button class="btn-action" on:click={handleSave} disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  {:else}
    <!-- MODO LECTURA -->
    <div class="perfil-grid">
      <div class="field">
        <span class="field-label">Nombre</span>
        <span class="field-value">{p.nombre || '—'}</span>
      </div>

      <div class="field">
        <span class="field-label">Tono de voz</span>
        <span class="field-value">{p.tono || '—'}</span>
      </div>

      <div class="field-row">
        <div class="field compact">
          <span class="field-label">Idioma</span>
          <span class="field-value">{p.idioma || '—'}</span>
        </div>
        <div class="field compact">
          <span class="field-label">Público</span>
          <span class="field-value">{p.publico || '—'}</span>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Valores</span>
        <span class="field-value">{p.valores || '—'}</span>
      </div>

      <div class="field">
        <span class="field-label">Qué evitar</span>
        <span class="field-value">{p.prohibido || '—'}</span>
      </div>

      <div class="field">
        <span class="field-label">Referencia visual</span>
        <span class="field-value">{p.referencia_visual || '—'}</span>
      </div>

      {#if p.colores && Object.keys(p.colores).length > 0}
        <div class="field">
          <span class="field-label">Colores</span>
          <div class="colores">
            {#each Object.entries(p.colores) as [nombre, valor]}
              <div class="color-chip">
                <span class="color-swatch" style="background: {valor}"></span>
                <span class="color-info">{nombre}: {valor}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if p.notas && p.notas.length > 0}
        <div class="field">
          <span class="field-label">Notas</span>
          <ul class="notas">
            {#each p.notas as nota}<li>{nota}</li>{/each}
          </ul>
        </div>
      {/if}
    </div>

    <button class="btn-action" on:click={startEdit}>Editar</button>
  {/if}
</div>

<style>
  .panel-body {
    display: flex; flex-direction: column; gap: 0.625rem; padding: 0.5rem;
  }
  .state-msg {
    padding: 1rem; text-align: center; color: var(--color-text-muted, #888);
    font-size: 0.8rem;
  }
  .onboarding-prompt {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    padding: 1.5rem; text-align: center; color: var(--color-text-muted, #888);
    font-size: 0.8rem;
  }
  .empty-icon { font-size: 2rem; opacity: 0.7; }
  .onboarding-prompt p { margin: 0; }
  .onboarding-prompt .small { font-size: 0.7rem; line-height: 1.4; }
  .onboarding-prompt code {
    font-family: monospace;
    padding: 0.05rem 0.25rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.15rem;
    font-size: 0.65rem;
  }

  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-group.compact { flex: 1; min-width: 0; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .form-input {
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
    font-family: inherit;
    resize: vertical;
  }
  .form-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .form-row { display: flex; gap: 0.5rem; }

  .perfil-grid { display: flex; flex-direction: column; gap: 0.625rem; }
  .field { display: flex; flex-direction: column; gap: 0.15rem; }
  .field.compact { flex: 1; min-width: 0; }
  .field-row { display: flex; gap: 0.75rem; }
  .field-label {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--color-text-muted, #888); font-weight: 600;
  }
  .field-value {
    font-size: 0.8rem; color: var(--color-text, #e5e5e5);
    padding: 0.35rem 0.5rem;
    background: rgba(255,255,255,0.03);
    border-radius: 0.25rem;
    min-height: 1.5rem;
  }

  .colores { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .color-chip {
    display: flex; align-items: center; gap: 0.3rem;
    padding: 0.2rem 0.4rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.25rem;
    font-size: 0.7rem;
  }
  .color-swatch {
    width: 1rem; height: 1rem; border-radius: 0.2rem;
    border: 1px solid rgba(255,255,255,0.15);
  }
  .color-info { font-family: monospace; font-size: 0.65rem; }

  .notas {
    margin: 0; padding-left: 1rem; font-size: 0.75rem;
    color: var(--color-text, #e5e5e5);
  }

  .actions { display: flex; gap: 0.5rem; }
  .btn-action, .btn-secondary {
    padding: 0.5rem 0.75rem;
    border: none; border-radius: 0.375rem;
    font-size: 0.8rem; font-weight: 600; cursor: pointer;
  }
  .btn-action {
    background: var(--color-primary, #3b82f6);
    color: white;
    flex: 1;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    background: rgba(255,255,255,0.08);
    color: var(--color-text, #e5e5e5);
    border: 1px solid rgba(255,255,255,0.12);
    flex: 1;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.12); }

  .error-msg {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444); font-size: 0.75rem;
  }
  .close-btn {
    background: none; border: none; color: inherit; cursor: pointer;
    padding: 0.15rem; font-size: 1rem;
  }
</style>
