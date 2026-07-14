<script lang="ts">
  /**
   * InvitacionesPanel — la cadena de delegación desde el panel.
   *
   * Tabs:
   *  - Emitir:    el admin del sistema crea una invitación de proyecto (crear/unirse) → código copiable
   *  - Gestionar: lista las emitidas con su estado y permite revocarlas
   *
   * La redención la hace el navegador del invitado (enki-identity), no este panel.
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    invitaciones,
    invLoading,
    invError,
    ultimoCodigo,
    loadInvitaciones,
    emitirInvitacion,
    revocarInvitacion,
    clearInvError,
    initInvitacionesSubscriptions,
    type AccionInvitacion,
    type EstadoInvitacion
  } from '$lib/stores/invitaciones';
  import { projectsList, loadProjects } from '$lib/stores/projects';

  export let panelId: string = '';

  // Catálogo de roles (semilla del sistema — Fase 2 los hará por-proyecto).
  const ROLES = [
    { id: 'project-admin', label: 'Admin de proyecto', desc: 'Control total del proyecto: gestiona todo y puede repartir invitaciones a su equipo.' },
    { id: 'member',        label: 'Miembro',           desc: 'Opera el proyecto (pedidos, cocina, caja…). No toca identidad ni ajustes de sistema.' },
    { id: 'device',        label: 'Dispositivo',       desc: 'Equipos IoT (ESP32, TPV, periféricos). Solo el carril de dispositivos y telemetría.' }
  ];

  let cleanup: (() => void) | null = null;
  let tab: 'emitir' | 'gestionar' = 'emitir';

  // Formulario de emisión
  let form: { accion: AccionInvitacion; project: string; role: string; dias: number; usos_max: number } = {
    accion: 'crear-proyecto',
    project: '',
    role: 'member',
    dias: 7,
    usos_max: 1
  };
  let copiado = false;

  $: rolDesc = ROLES.find((r) => r.id === form.role)?.desc ?? '';

  onMount(() => {
    loadInvitaciones();
    loadProjects();
    cleanup = initInvitacionesSubscriptions();
  });
  onDestroy(() => cleanup && cleanup());

  async function emitir() {
    const opts = {
      accion: form.accion,
      project: form.accion === 'unirse-proyecto' ? (form.project || null) : null,
      role: form.accion === 'crear-proyecto' ? 'project-admin' : form.role,
      dias: form.dias,
      usos_max: form.usos_max
    };
    const codigo = await emitirInvitacion(opts);
    if (codigo) { tab = 'emitir'; copiado = false; }
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); copiado = true; setTimeout(() => (copiado = false), 2000); }
    catch { /* clipboard no disponible */ }
  }

  const badge: Record<EstadoInvitacion, string> = {
    activa: 'ok', revocada: 'no', agotada: 'muted', caducada: 'muted'
  };
</script>

<div class="inv-panel">
  <div class="tabs">
    <button class:active={tab === 'emitir'} on:click={() => (tab = 'emitir')}>Emitir</button>
    <button class:active={tab === 'gestionar'} on:click={() => { tab = 'gestionar'; loadInvitaciones(); }}>Gestionar</button>
  </div>

  {#if $invError}
    <div class="error">⚠ {$invError} <button on:click={clearInvError}>✕</button></div>
  {/if}

  {#if tab === 'emitir'}
    <div class="form">
      <label class="radios">
        <span>Acción</span>
        <label><input type="radio" bind:group={form.accion} value="crear-proyecto" /> Crear proyecto nuevo</label>
        <label><input type="radio" bind:group={form.accion} value="unirse-proyecto" /> Unirse a un proyecto</label>
      </label>

      {#if form.accion === 'unirse-proyecto'}
        <label>Proyecto
          <select bind:value={form.project}>
            <option value="" disabled>— elige un proyecto —</option>
            {#each $projectsList as p (p.id)}
              <option value={p.id}>{p.name || p.id}</option>
            {/each}
          </select>
        </label>
        <label>Rol
          <select bind:value={form.role}>
            {#each ROLES as r (r.id)}
              <option value={r.id}>{r.label}</option>
            {/each}
          </select>
        </label>
        {#if rolDesc}<p class="hint">{rolDesc}</p>{/if}
      {:else}
        <p class="hint">El invitado creará un proyecto nuevo y será su <strong>project-admin</strong>.</p>
      {/if}

      <div class="row">
        <label>Caducidad (días) <input type="number" min="1" bind:value={form.dias} /></label>
        <label>Usos <input type="number" min="1" bind:value={form.usos_max} /></label>
      </div>

      <button class="primary" on:click={emitir} disabled={$invLoading || (form.accion === 'unirse-proyecto' && !form.project)}>
        {$invLoading ? 'Emitiendo…' : 'Emitir invitación'}
      </button>

      {#if $ultimoCodigo}
        <div class="codigo">
          <span>Entrega este código al invitado:</span>
          <code>{$ultimoCodigo}</code>
          <button on:click={() => copiar($ultimoCodigo)}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="lista">
      {#if $invitaciones.length === 0}
        <p class="hint">No hay invitaciones emitidas.</p>
      {:else}
        {#each $invitaciones as inv (inv.id)}
          <div class="item">
            <div class="meta">
              <span class="id">{inv.id}</span>
              <span class="grant">{inv.otorga.accion}{inv.otorga.project ? ` · ${inv.otorga.project}` : ''} · {inv.otorga.role}</span>
              <span class="usos">usos {inv.limites.usos}/{inv.limites.usos_max}</span>
            </div>
            <span class="estado {badge[inv.estado]}">{inv.estado}</span>
            {#if inv.estado === 'activa'}
              <button class="danger" on:click={() => revocarInvitacion(inv.id)}>Revocar</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .inv-panel { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem; }
  .tabs { display: flex; gap: 0.25rem; }
  .tabs button { flex: 1; padding: 0.4rem; border: 1px solid var(--border, #ccc); background: transparent; cursor: pointer; border-radius: 4px; }
  .tabs button.active { background: var(--accent, #2d6cdf); color: #fff; }
  .form, .lista { display: flex; flex-direction: column; gap: 0.6rem; }
  .form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
  .radios label { flex-direction: row; align-items: center; gap: 0.4rem; }
  .row { display: flex; gap: 0.6rem; }
  .row label { flex: 1; }
  input, select { padding: 0.35rem; border: 1px solid var(--border, #ccc); border-radius: 4px; background: var(--input-bg, #111); color: inherit; }
  button.primary { padding: 0.5rem; background: var(--accent, #2d6cdf); color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  button.primary:disabled { opacity: 0.5; cursor: default; }
  .hint { font-size: 0.8rem; color: var(--muted, #888); }
  .codigo { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.5rem; border: 1px dashed var(--border, #ccc); border-radius: 4px; }
  .codigo code { word-break: break-all; font-size: 0.75rem; background: var(--code-bg, #f4f4f4); padding: 0.4rem; border-radius: 4px; }
  .item { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem; border: 1px solid var(--border, #eee); border-radius: 4px; }
  .item .meta { display: flex; flex-direction: column; flex: 1; gap: 0.15rem; }
  .item .id { font-size: 0.7rem; color: var(--muted, #888); }
  .item .grant { font-size: 0.85rem; }
  .item .usos { font-size: 0.7rem; color: var(--muted, #888); }
  .estado { font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 999px; }
  .estado.ok { background: #e6f4ea; color: #137333; }
  .estado.no { background: #fce8e6; color: #c5221f; }
  .estado.muted { background: #f1f3f4; color: #5f6368; }
  button.danger { padding: 0.3rem 0.5rem; background: transparent; color: #c5221f; border: 1px solid #c5221f; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
  .error { display: flex; justify-content: space-between; padding: 0.4rem; background: #fce8e6; color: #c5221f; border-radius: 4px; font-size: 0.85rem; }
  .error button { background: none; border: none; cursor: pointer; }
</style>
