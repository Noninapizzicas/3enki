<script lang="ts">
  /**
   * ActividadPanel — Muestra el estado del marketing en el proyecto.
   *
   * Shape canonico del blueprint carta-marketing. La "actividad" como tal
   * (invocaciones a agentes marketing-*) esta TRABAJO_PENDIENTE hasta que
   * agent-observer exponga consulta filtrada — por ahora el panel muestra
   * solo el resumen del perfil y el estado del onboarding.
   */
  import { onMount } from 'svelte';
  import {
    actividad,
    perfil,
    onboardingCompletado,
    loadActividad,
    loadPerfil
  } from '$lib/stores/carta-marketing';

  export let panelId: string = '';

  $: act = $actividad;
  $: p = $perfil;
  $: completado = $onboardingCompletado;

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    loadPerfil();
    loadActividad();
    refreshTimer = setInterval(() => {
      loadPerfil();
      loadActividad();
    }, 30000);
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  });

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
</script>

<div class="panel-body">
  <div class="stats-grid">
    <div class="stat">
      <span class="stat-value">{act?.invocaciones?.length ?? 0}</span>
      <span class="stat-label">Invocaciones ({act?.ventana_dias ?? 7}d)</span>
    </div>

    <div class="stat">
      <span class="stat-value">
        {#if completado}✓{:else}—{/if}
      </span>
      <span class="stat-label">Onboarding</span>
    </div>
  </div>

  <div class="info-section">
    <span class="section-title">Perfil</span>
    <div class="info-row">
      <span class="info-label">Estado</span>
      <span class="info-value" class:ok={completado}>
        {completado ? 'Completado' : 'Pendiente'}
      </span>
    </div>
    {#if p?.esencia?.nombre}
      <div class="info-row">
        <span class="info-label">Nombre</span>
        <span class="info-value">{p.esencia.nombre}</span>
      </div>
    {/if}
    {#if p?.voz?.tono && p.voz.tono.length > 0}
      <div class="info-row">
        <span class="info-label">Tono</span>
        <span class="info-value">{p.voz.tono.join(', ')}</span>
      </div>
    {/if}
    {#if p?.arquetipo}
      <div class="info-row">
        <span class="info-label">Arquetipo</span>
        <span class="info-value">{p.arquetipo}</span>
      </div>
    {/if}
    {#if p?._updated_at}
      <div class="info-row">
        <span class="info-label">Actualizado</span>
        <span class="info-value date">{formatDate(p._updated_at)}</span>
      </div>
    {/if}
  </div>

  {#if act?.nota}
    <div class="note">{act.nota}</div>
  {/if}

  {#if !completado}
    <div class="hint">
      💬 Para configurar marketing, completa el onboarding via chat.
    </div>
  {:else}
    <div class="hint ok">
      ✓ Marketing trabajando silenciosamente en cada cambio de carta.
    </div>
  {/if}
</div>

<style>
  .panel-body {
    display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem;
  }

  .stats-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
  }
  .stat {
    display: flex; flex-direction: column; align-items: center;
    padding: 0.75rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.375rem;
  }
  .stat-value {
    font-size: 1.5rem; font-weight: 700;
    color: var(--color-primary, #3b82f6);
  }
  .stat-label {
    font-size: 0.6rem; color: var(--color-text-muted, #888);
    text-transform: uppercase; letter-spacing: 0.05em;
    text-align: center;
  }

  .info-section {
    display: flex; flex-direction: column; gap: 0.3rem;
    padding: 0.5rem;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 0.375rem;
  }
  .section-title {
    font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--color-text-muted, #888); font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .info-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.2rem 0;
    border-top: 1px solid rgba(255,255,255,0.04);
  }
  .info-row:first-of-type { border-top: none; }
  .info-label { font-size: 0.7rem; color: var(--color-text-muted, #888); }
  .info-value { font-size: 0.75rem; color: var(--color-text, #e5e5e5); }
  .info-value.ok { color: var(--color-success, #22c55e); }
  .info-value.date { font-family: monospace; font-size: 0.7rem; }

  .note {
    padding: 0.4rem 0.6rem;
    background: rgba(245,158,11,0.08);
    border: 1px solid rgba(245,158,11,0.2);
    border-radius: 0.375rem;
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
    font-style: italic;
  }

  .hint {
    padding: 0.5rem;
    background: rgba(59,130,246,0.08);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 0.375rem;
    font-size: 0.7rem;
    color: var(--color-text, #e5e5e5);
    text-align: center;
  }
  .hint.ok {
    background: rgba(34,197,94,0.08);
    border-color: rgba(34,197,94,0.2);
  }
</style>
