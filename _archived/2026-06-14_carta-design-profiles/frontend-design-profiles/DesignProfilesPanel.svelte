<script lang="ts">
  /**
   * DesignProfilesPanel — Perfiles de estilo de diseño
   *
   * Muestra perfiles built-in y custom con preview visual.
   * El usuario selecciona un perfil y pide al chat que genere un diseño.
   *
   * Consumidor READ-ONLY — no modifica datos de carta.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    cartaDesignStore,
    designProfiles,
    loadProfiles,
    deleteProfile,
    initCartaDesignSubscriptions
  } from '$lib/stores/carta-design';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;

  onMount(() => {
    cleanup = initCartaDesignSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  async function handleDelete(profileId: string) {
    await deleteProfile(profileId);
  }

  // Colores de preview de paleta
  function paletteColors(palette: Record<string, string> | undefined): string[] {
    if (!palette) return [];
    return Object.values(palette).filter(v => typeof v === 'string' && v.startsWith('#'));
  }
</script>

<div class="panel">
  <section class="section">
    <h3 class="section-title">Perfiles de diseño</h3>
    <div class="hint">Selecciona un estilo y pide al chat que diseñe la carta</div>
  </section>

  {#if $designProfiles.length === 0}
    <div class="empty">Cargando perfiles...</div>
  {:else}
    <div class="profiles-list">
      {#each $designProfiles as profile}
        <div class="profile-card">
          <!-- Palette preview -->
          <div class="palette-bar">
            {#each paletteColors(profile.color_palette) as color}
              <div class="color-swatch" style="background: {color}"></div>
            {/each}
          </div>

          <div class="profile-body">
            <div class="profile-header">
              <span class="profile-name">{profile.nombre}</span>
              {#if profile.builtin}
                <span class="badge builtin">built-in</span>
              {:else}
                <span class="badge custom">custom</span>
              {/if}
            </div>

            <p class="profile-desc">{profile.description || ''}</p>

            {#if profile.fonts}
              <div class="profile-fonts">
                {#if profile.fonts.heading}
                  <span class="font-tag">H: {profile.fonts.heading}</span>
                {/if}
                {#if profile.fonts.body}
                  <span class="font-tag">B: {profile.fonts.body}</span>
                {/if}
              </div>
            {/if}

            {#if profile.layout_type}
              <span class="layout-tag">{profile.layout_type}</span>
            {/if}
          </div>

          <div class="profile-actions">
            {#if !profile.builtin}
              <button class="btn-delete" on:click|stopPropagation={() => handleDelete(profile.id)}>
                ×
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    height: 100%;
    overflow-y: auto;
  }

  .section { display: flex; flex-direction: column; gap: 4px; }
  .section-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #888);
    margin: 0;
  }

  .hint {
    font-size: 0.7rem;
    color: var(--color-text-muted, #666);
  }

  .empty {
    text-align: center;
    padding: 20px;
    color: var(--color-text-muted, #666);
    font-size: 0.8rem;
  }

  .profiles-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-surface, #1a1a1a);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .profile-card:hover {
    border-color: #f59e0b;
  }

  .palette-bar {
    display: flex;
    height: 6px;
  }

  .color-swatch {
    flex: 1;
  }

  .profile-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .profile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .profile-name {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text, #e5e5e5);
  }

  .badge {
    font-size: 0.55rem;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .badge.builtin { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
  .badge.custom { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

  .profile-desc {
    font-size: 0.7rem;
    color: var(--color-text-muted, #999);
    line-height: 1.4;
    margin: 0;
  }

  .profile-fonts {
    display: flex;
    gap: 6px;
  }

  .font-tag {
    font-size: 0.6rem;
    padding: 1px 5px;
    background: var(--color-surface-2, #252525);
    border-radius: 3px;
    color: var(--color-text-muted, #888);
  }

  .layout-tag {
    font-size: 0.6rem;
    color: #f59e0b;
    font-weight: 600;
  }

  .profile-actions {
    display: flex;
    gap: 4px;
    padding: 0 12px 10px;
  }

  .btn-use {
    flex: 1;
    padding: 6px;
    border: none;
    border-radius: 5px;
    background: #f59e0b;
    color: #000;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-use:active { background: #d97706; }

  .btn-delete {
    width: 28px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 5px;
    background: transparent;
    color: #ef4444;
    font-size: 1rem;
    cursor: pointer;
  }
  .btn-delete:active { background: rgba(239, 68, 68, 0.1); }
</style>
