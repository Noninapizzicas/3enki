<script lang="ts">
  /**
   * PerfilPanel — Ver y editar el perfil de marca del proyecto.
   *
   * Shape canonico: del blueprint carta-marketing (nombre_marca, tono_voz,
   * valores como array, publico_objetivo, diferenciacion, restricciones,
   * idiomas como array). Lecturas y escrituras directas via fs.read/fs.write
   * sobre /storage/config/marca.json — sin handler backend dedicado.
   *
   * El onboarding inicial lo hace el agente marketing-onboarding via chat
   * (operacion compleja). Este panel solo permite revisar/editar el perfil
   * ya creado.
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
    clearError,
    type PerfilMarca
  } from '$lib/stores/carta-marketing';

  export let panelId: string = '';

  let editMode = false;
  // Campos editables. valores e idiomas se editan como string CSV → array al save.
  let editando: {
    nombre_marca: string;
    lema: string;
    tono_voz: string;
    valoresCsv: string;
    publico_objetivo: string;
    diferenciacion: string;
    restricciones: string;
    idiomasCsv: string;
  } = {
    nombre_marca: '', lema: '', tono_voz: '', valoresCsv: '',
    publico_objetivo: '', diferenciacion: '', restricciones: '', idiomasCsv: ''
  };

  $: p = $perfil;
  $: loading = $marketingLoading;
  $: saving = $marketingSaving;
  $: error = $marketingError;
  $: completado = $onboardingCompletado;

  onMount(() => loadPerfil());

  function csvFromArray(a: string[] | undefined): string {
    return Array.isArray(a) ? a.join(', ') : '';
  }

  function arrayFromCsv(s: string): string[] {
    return s.split(',').map(x => x.trim()).filter(x => x.length > 0);
  }

  function startEdit() {
    editando = {
      nombre_marca: p?.nombre_marca || '',
      lema: p?.lema || '',
      tono_voz: p?.tono_voz || '',
      valoresCsv: csvFromArray(p?.valores),
      publico_objetivo: p?.publico_objetivo || '',
      diferenciacion: p?.diferenciacion || '',
      restricciones: p?.restricciones || '',
      idiomasCsv: csvFromArray(p?.idiomas) || 'es'
    };
    editMode = true;
  }

  async function handleSave() {
    const patch: Partial<PerfilMarca> = {
      nombre_marca: editando.nombre_marca,
      lema: editando.lema,
      tono_voz: editando.tono_voz,
      valores: arrayFromCsv(editando.valoresCsv),
      publico_objetivo: editando.publico_objetivo,
      diferenciacion: editando.diferenciacion,
      restricciones: editando.restricciones,
      idiomas: arrayFromCsv(editando.idiomasCsv)
    };
    const ok = await updatePerfil(patch);
    if (ok) editMode = false;
  }

  function handleCancel() {
    editMode = false;
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
      <label class="form-label" for="p-nombre">Nombre de marca</label>
      <input id="p-nombre" class="form-input" bind:value={editando.nombre_marca} placeholder="Nonina Pizzicas" />
    </div>

    <div class="form-group">
      <label class="form-label" for="p-lema">Lema</label>
      <input id="p-lema" class="form-input" bind:value={editando.lema} placeholder="Pizza con alma" />
    </div>

    <div class="form-group">
      <label class="form-label" for="p-tono">Tono de voz</label>
      <input id="p-tono" class="form-input" bind:value={editando.tono_voz} placeholder="Cercano y familiar, con humor" />
    </div>

    <div class="form-row">
      <div class="form-group compact">
        <label class="form-label" for="p-idiomas">Idiomas</label>
        <input id="p-idiomas" class="form-input" bind:value={editando.idiomasCsv} placeholder="es, en" />
        <span class="form-hint">separados por coma</span>
      </div>
      <div class="form-group compact">
        <label class="form-label" for="p-publico">Público objetivo</label>
        <input id="p-publico" class="form-input" bind:value={editando.publico_objetivo} placeholder="Familias, jóvenes" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-valores">Valores</label>
      <textarea id="p-valores" class="form-input" rows="2" bind:value={editando.valoresCsv}
        placeholder="producto fresco, hecho a mano, recetas de siempre"></textarea>
      <span class="form-hint">separados por coma</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-dif">Diferenciación</label>
      <textarea id="p-dif" class="form-input" rows="2" bind:value={editando.diferenciacion}
        placeholder="Lo que te hace único frente a la competencia"></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-rest">Restricciones</label>
      <textarea id="p-rest" class="form-input" rows="2" bind:value={editando.restricciones}
        placeholder="Anglicismos, tono pretencioso, frases hechas..."></textarea>
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
        <span class="field-value">{p.nombre_marca || '—'}</span>
      </div>

      {#if p.lema}
        <div class="field">
          <span class="field-label">Lema</span>
          <span class="field-value">{p.lema}</span>
        </div>
      {/if}

      <div class="field">
        <span class="field-label">Tono de voz</span>
        <span class="field-value">{p.tono_voz || '—'}</span>
      </div>

      <div class="field-row">
        <div class="field compact">
          <span class="field-label">Idiomas</span>
          <span class="field-value">{csvFromArray(p.idiomas) || '—'}</span>
        </div>
        <div class="field compact">
          <span class="field-label">Público objetivo</span>
          <span class="field-value">{p.publico_objetivo || '—'}</span>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Valores</span>
        {#if p.valores && p.valores.length > 0}
          <div class="chips">
            {#each p.valores as v}
              <span class="chip">{v}</span>
            {/each}
          </div>
        {:else}
          <span class="field-value">—</span>
        {/if}
      </div>

      {#if p.diferenciacion}
        <div class="field">
          <span class="field-label">Diferenciación</span>
          <span class="field-value">{p.diferenciacion}</span>
        </div>
      {/if}

      {#if p.restricciones}
        <div class="field">
          <span class="field-label">Restricciones</span>
          <span class="field-value">{p.restricciones}</span>
        </div>
      {/if}

      {#if p._updated_at}
        <div class="field">
          <span class="field-label">Última actualización</span>
          <span class="field-value field-meta">{new Date(p._updated_at).toLocaleString()}</span>
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
  .form-hint { font-size: 0.65rem; color: var(--color-text-muted, #888); font-style: italic; }
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
  .field-meta { font-family: monospace; font-size: 0.7rem; opacity: 0.7; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.2rem 0; }
  .chip {
    padding: 0.2rem 0.5rem;
    background: rgba(96, 165, 250, 0.15);
    color: var(--color-primary, #3b82f6);
    border-radius: 999px;
    font-size: 0.7rem;
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
