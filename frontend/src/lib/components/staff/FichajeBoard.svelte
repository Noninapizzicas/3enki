<script lang="ts">
  /**
   * FichajeBoard — Vista en tiempo real de quién está en turno
   *
   * Muestra una tarjeta por empleado activo.
   * Click en tarjeta → tap_in (si está fuera) / tap_out (si está dentro).
   * Las sesiones irregulares (abiertas > maxShiftHours) aparecen con aviso.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    employees, activeSessions, staleSessions, loading,
    activeSessionMap, loadAll, tapIn, tapOut, managerClose,
    formatDuration, formatRole
  } from '$lib/stores/staff';

  // Refresco del reloj cada minuto
  let clock = '';
  let clockTimer: ReturnType<typeof setInterval>;
  let refreshTimer: ReturnType<typeof setInterval>;

  // Estado de operación por empleado (para feedback visual)
  const tapping = new Set<string>();
  let tappingStore = 0; // contador reactivo para forzar re-render

  function updateClock() {
    const now = new Date();
    const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    clock = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} · ${
      String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }

  async function handleCardClick(employeeId: string) {
    if (tapping.has(employeeId)) return;
    tapping.add(employeeId);
    tappingStore++;
    try {
      const sessionMap = $activeSessionMap;
      if (sessionMap.has(employeeId)) {
        await tapOut(employeeId);
      } else {
        await tapIn(employeeId);
      }
    } catch (e) {
      console.error('tap error:', e);
    } finally {
      tapping.delete(employeeId);
      tappingStore++;
    }
  }

  async function handleManagerClose(employeeId: string, e: MouseEvent) {
    e.stopPropagation();
    await managerClose(employeeId);
  }

  onMount(() => {
    updateClock();
    clockTimer   = setInterval(updateClock, 60000);
    refreshTimer = setInterval(() => {
      // Refresca duración visible sin petición de red
      tappingStore++;
    }, 60000);
    loadAll();
  });

  onDestroy(() => {
    clearInterval(clockTimer);
    clearInterval(refreshTimer);
  });
</script>

<div class="board">
  <!-- Header -->
  <div class="board-header">
    <div>
      <h2>Fichajes</h2>
      <p class="clock">{clock}</p>
    </div>
    {#if !$loading}
      <div class="summary">
        <span class="badge-in">{$activeSessions.length} en turno</span>
        {#if $staleSessions.length > 0}
          <span class="badge-stale">⚠ {$staleSessions.length} irregular{$staleSessions.length > 1 ? 'es' : ''}</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if $loading && $employees.length === 0}
    <div class="empty">Cargando…</div>

  {:else if $employees.length === 0}
    <div class="empty">
      <p>Sin empleados</p>
      <span>Crea empleados en la pestaña <strong>Empleados</strong></span>
    </div>

  {:else}
    <!-- Grid de tarjetas -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="grid" class:updating={tappingStore > -1 && false /* just to use reactivity */}>
      {#each $employees as emp (emp.id)}
        {@const session = $activeSessionMap.get(emp.id)}
        {@const isIn    = !!session}
        {@const isBusy  = tapping.has(emp.id)}
        {@const isStale = $staleSessions.some(s => s.employee_id === emp.id)}

        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
          class="card"
          class:card-in={isIn}
          class:card-stale={isStale}
          class:card-busy={isBusy}
          on:click={() => handleCardClick(emp.id)}
          title={isIn ? 'Clic para fichar salida' : 'Clic para fichar entrada'}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === 'Enter' && handleCardClick(emp.id)}
        >
          <!-- Indicador de estado -->
          <div class="status-row">
            <span class="dot" class:dot-in={isIn} class:dot-out={!isIn}></span>
            <span class="status-label">{isIn ? 'DENTRO' : 'FUERA'}</span>
            {#if isStale}
              <span class="stale-badge" title="Turno excedido">⚠</span>
            {/if}
          </div>

          <!-- Info empleado -->
          <div class="emp-name">{emp.name}</div>
          <div class="emp-role">{formatRole(emp.role)}</div>

          <!-- Duración si está dentro -->
          {#if isIn && session}
            <div class="duration">
              {#if isBusy}
                …
              {:else}
                {formatDuration(session.tap_in_at)}
              {/if}
            </div>
          {:else}
            <div class="duration placeholder">—</div>
          {/if}

          <!-- Botón manager close si irregular -->
          {#if isStale && session}
            <button
              class="manager-close-btn"
              on:click={(e) => handleManagerClose(emp.id, e)}
              title="Cerrar turno manualmente"
            >
              Cerrar turno
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    height: 100%;
  }

  .board-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  h2 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f3f4f6;
    margin: 0;
  }

  .clock {
    font-size: 0.78rem;
    color: #6b7280;
    margin: 2px 0 0;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge-in {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  .badge-stale {
    background: rgba(234, 179, 8, 0.15);
    color: #fbbf24;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(234, 179, 8, 0.25);
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #4b5563;
    gap: 0.25rem;
    font-size: 0.9rem;
  }

  .empty p { font-size: 1rem; color: #6b7280; margin: 0; }
  .empty strong { color: #9ca3af; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  /* ── Tarjeta ── */
  .card {
    background: #141414;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 0.9rem 0.85rem 0.75rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: border-color 0.15s, background 0.15s, opacity 0.15s;
    user-select: none;
  }

  .card:hover:not(.card-busy) {
    border-color: #3a3a3a;
    background: #181818;
  }

  .card-in {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.04);
  }

  .card-in:hover:not(.card-busy) {
    border-color: rgba(34, 197, 94, 0.5);
    background: rgba(34, 197, 94, 0.07);
  }

  .card-stale {
    border-color: rgba(234, 179, 8, 0.4) !important;
    background: rgba(234, 179, 8, 0.04) !important;
  }

  .card-busy {
    opacity: 0.6;
    cursor: wait;
  }

  /* ── Status row ── */
  .status-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-in  { background: #4ade80; box-shadow: 0 0 4px #4ade80; }
  .dot-out { background: #374151; }

  .status-label {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #6b7280;
  }

  .stale-badge {
    margin-left: auto;
    font-size: 0.75rem;
    color: #fbbf24;
  }

  /* ── Empleado info ── */
  .emp-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: #e5e7eb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .emp-role {
    font-size: 0.72rem;
    color: #6b7280;
    text-transform: capitalize;
  }

  /* ── Duración ── */
  .duration {
    margin-top: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #4ade80;
  }

  .duration.placeholder { color: #374151; }

  /* ── Manager close ── */
  .manager-close-btn {
    margin-top: 8px;
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid rgba(234, 179, 8, 0.3);
    color: #fbbf24;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    width: 100%;
  }
  .manager-close-btn:hover {
    background: rgba(234, 179, 8, 0.18);
  }
</style>
