<script lang="ts">
  /**
   * PerfilPanel — Ver y editar el perfil de marca del proyecto.
   *
   * Shape canónico: marca.schema.json (secciones esencia/voz/publico/visual/
   * negocio + arquetipo/manifiesto). Lecturas y escrituras por la puerta del
   * dueño: ui/request/carta-marketing/get_perfil · update_perfil (deep-merge
   * por sección, gate AJV en el reflejo).
   *
   * El onboarding inicial lo conduce el LLM de página via chat. Este panel
   * permite revisar/editar el perfil ya creado.
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
    type PerfilCampos
  } from '$lib/stores/carta-marketing';

  export let panelId: string = '';

  let editMode = false;
  // Campos editables. Los arrays (valores, tono, evita) se editan como CSV → array al save.
  let editando = {
    nombre: '', lema: '', proposito: '', valoresCsv: '',
    tonoCsv: '', registro: '', evitaCsv: '',
    publico_quien: '', publico_actitud: ''
  };

  $: p = $perfil;
  $: loading = $marketingLoading;
  $: saving = $marketingSaving;
  $: error = $marketingError;
  $: completado = $onboardingCompletado;
  // Hay contenido real si el comerciante ya dio algo (aunque no cerrara el onboarding).
  // El empty-state solo cuando NO hay nada — no esconder lo ya rellenado.
  $: hasContent = !!(p && (
    p.esencia?.nombre ||
    (p.esencia?.valores && p.esencia.valores.length > 0) ||
    (p.voz?.tono && p.voz.tono.length > 0) ||
    p.publico?.quien
  ));

  onMount(() => loadPerfil());

  function csvFromArray(a: string[] | undefined): string {
    return Array.isArray(a) ? a.join(', ') : '';
  }

  function arrayFromCsv(s: string): string[] {
    return s.split(',').map(x => x.trim()).filter(x => x.length > 0);
  }

  function startEdit() {
    editando = {
      nombre: p?.esencia?.nombre || '',
      lema: p?.esencia?.lema || '',
      proposito: p?.esencia?.proposito || '',
      valoresCsv: csvFromArray(p?.esencia?.valores),
      tonoCsv: csvFromArray(p?.voz?.tono),
      registro: p?.voz?.registro || '',
      evitaCsv: csvFromArray(p?.voz?.no),
      publico_quien: p?.publico?.quien || '',
      publico_actitud: p?.publico?.actitud || ''
    };
    editMode = true;
  }

  async function handleSave() {
    const campos: PerfilCampos = {
      esencia: {
        nombre: editando.nombre,
        lema: editando.lema,
        proposito: editando.proposito,
        valores: arrayFromCsv(editando.valoresCsv)
      },
      voz: {
        tono: arrayFromCsv(editando.tonoCsv),
        registro: editando.registro,
        no: arrayFromCsv(editando.evitaCsv)
      },
      publico: {
        quien: editando.publico_quien,
        actitud: editando.publico_actitud
      }
    };
    const ok = await updatePerfil(campos);
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
  {:else if !completado && !hasContent}
    <div class="onboarding-prompt">
      <div class="empty-icon">💬</div>
      <p><strong>Todavía no te conocemos</strong></p>
      <p class="small">
        Pregúntale al chat algo como "hablame del marketing" o "ayúdame a configurar la marca"
        y te hará unas preguntas para construir el perfil del proyecto.
      </p>
    </div>
  {:else if editMode}
    <!-- MODO EDICIÓN -->
    <div class="form-group">
      <label class="form-label" for="p-nombre">Nombre de marca</label>
      <input id="p-nombre" class="form-input" bind:value={editando.nombre} placeholder="Nonina Pizzicas" />
    </div>

    <div class="form-group">
      <label class="form-label" for="p-lema">Lema</label>
      <input id="p-lema" class="form-input" bind:value={editando.lema} placeholder="Pizza con alma" />
    </div>

    <div class="form-group">
      <label class="form-label" for="p-proposito">Propósito</label>
      <textarea id="p-proposito" class="form-input" rows="2" bind:value={editando.proposito}
        placeholder="Para qué existe la marca, en una frase"></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-valores">Valores</label>
      <textarea id="p-valores" class="form-input" rows="2" bind:value={editando.valoresCsv}
        placeholder="producto fresco, hecho a mano, recetas de siempre"></textarea>
      <span class="form-hint">separados por coma</span>
    </div>

    <div class="form-row">
      <div class="form-group compact">
        <label class="form-label" for="p-tono">Tono de voz</label>
        <input id="p-tono" class="form-input" bind:value={editando.tonoCsv} placeholder="directo, cercano, con humor" />
        <span class="form-hint">separados por coma</span>
      </div>
      <div class="form-group compact">
        <label class="form-label" for="p-registro">Registro</label>
        <input id="p-registro" class="form-input" bind:value={editando.registro} placeholder="desenfadado" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-evita">La voz evita</label>
      <input id="p-evita" class="form-input" bind:value={editando.evitaCsv} placeholder="cursi, formal, corporativo" />
      <span class="form-hint">separados por coma</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-quien">Público — quién</label>
      <textarea id="p-quien" class="form-input" rows="2" bind:value={editando.publico_quien}
        placeholder="Familias, jóvenes, inconformistas..."></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="p-actitud">Público — actitud</label>
      <textarea id="p-actitud" class="form-input" rows="2" bind:value={editando.publico_actitud}
        placeholder="Qué buscan, cómo viven"></textarea>
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
        <span class="field-value">{p.esencia?.nombre || '—'}</span>
      </div>

      {#if p.esencia?.lema}
        <div class="field">
          <span class="field-label">Lema</span>
          <span class="field-value">{p.esencia.lema}</span>
        </div>
      {/if}

      {#if p.esencia?.proposito}
        <div class="field">
          <span class="field-label">Propósito</span>
          <span class="field-value">{p.esencia.proposito}</span>
        </div>
      {/if}

      <div class="field">
        <span class="field-label">Valores</span>
        {#if p.esencia?.valores && p.esencia.valores.length > 0}
          <div class="chips">
            {#each p.esencia.valores as v}
              <span class="chip">{v}</span>
            {/each}
          </div>
        {:else}
          <span class="field-value">—</span>
        {/if}
      </div>

      <div class="field">
        <span class="field-label">Tono de voz</span>
        {#if p.voz?.tono && p.voz.tono.length > 0}
          <div class="chips">
            {#each p.voz.tono as t}
              <span class="chip">{t}</span>
            {/each}
          </div>
        {:else}
          <span class="field-value">—</span>
        {/if}
      </div>

      <div class="field-row">
        <div class="field compact">
          <span class="field-label">Registro</span>
          <span class="field-value">{p.voz?.registro || '—'}</span>
        </div>
        {#if p.arquetipo}
          <div class="field compact">
            <span class="field-label">Arquetipo</span>
            <span class="field-value">{p.arquetipo}</span>
          </div>
        {/if}
      </div>

      {#if p.voz?.no && p.voz.no.length > 0}
        <div class="field">
          <span class="field-label">La voz evita</span>
          <div class="chips">
            {#each p.voz.no as n}
              <span class="chip chip-no">{n}</span>
            {/each}
          </div>
        </div>
      {/if}

      {#if p.publico?.quien}
        <div class="field">
          <span class="field-label">Público — quién</span>
          <span class="field-value">{p.publico.quien}</span>
        </div>
      {/if}

      {#if p.publico?.actitud}
        <div class="field">
          <span class="field-label">Público — actitud</span>
          <span class="field-value">{p.publico.actitud}</span>
        </div>
      {/if}

      {#if p.visual?.estilo}
        <div class="field">
          <span class="field-label">Estilo visual</span>
          <span class="field-value">{p.visual.estilo}</span>
        </div>
      {/if}

      {#if p.visual?.colores && Object.keys(p.visual.colores).length > 0}
        <div class="field">
          <span class="field-label">Colores</span>
          <div class="chips">
            {#each Object.entries(p.visual.colores) as [rol, hex]}
              <span class="chip chip-color">
                <span class="swatch" style="background: {hex}"></span>
                {rol} {hex}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if p.manifiesto?.texto}
        <div class="field">
          <span class="field-label">{p.manifiesto.titulo ? `Manifiesto — ${p.manifiesto.titulo}` : 'Manifiesto'}</span>
          <span class="field-value manifiesto">{p.manifiesto.texto}</span>
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
  .manifiesto { white-space: pre-line; line-height: 1.5; font-style: italic; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.2rem 0; }
  .chip {
    padding: 0.2rem 0.5rem;
    background: rgba(96, 165, 250, 0.15);
    color: var(--color-primary, #3b82f6);
    border-radius: 999px;
    font-size: 0.7rem;
  }
  .chip-no {
    background: rgba(239, 68, 68, 0.12);
    color: var(--color-error, #ef4444);
  }
  .chip-color {
    display: inline-flex; align-items: center; gap: 0.3rem;
    background: rgba(255,255,255,0.06);
    color: var(--color-text, #e5e5e5);
    font-family: monospace; font-size: 0.65rem;
  }
  .swatch {
    width: 0.7rem; height: 0.7rem; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.25);
    display: inline-block;
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
