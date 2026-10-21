<script lang="ts">
  /**
   * InterfazPanel — superficie de dominio del dueño del radar (spec interfaz-interfaz.md).
   * VISTA_LISTA: tablero de candidatos con estado + total (filtrable por estado).
   * VISTA_FICHA: evidencia completa por criterio (M11 — transparencia, el dueño decide).
   * ACCIONES: confirmar PASA/NO_PASA (la voz del dueño; el custodio aplica), añadir a mano,
   * corregir ficha (M10). Sin estado propio: proyección pura vía interfaz store.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    candidatos, total, ficha, vista, busy, error, filtroEstado,
    listaFiltrada, estadosPresentes, loadListar, verCandidato,
    confirmarVeredicto, anadirManual, corregirFicha, initInterfazSubscriptions
  } from '$lib/stores/interfaz';

  let cleanup: (() => void) | null = null;
  let confirmando: 'PASA' | 'NO_PASA' | null = null;   // doble paso: armar → confirmar
  let anadirAbierto = false;
  let nuevoTitulo = '';
  let nuevoUrl = '';
  let nuevoSector = '';
  let campoCorregir = '';
  let valorCorregir = '';
  let mensajeOk = '';

  $: totalVisible = $total || $candidatos.length;

  onMount(() => {
    loadListar();
    cleanup = initInterfazSubscriptions();
  });
  onDestroy(() => cleanup?.());

  function volverLista() {
    vista.set('lista');
    confirmando = null;
    campoCorregir = '';
    valorCorregir = '';
  }

  async function onConfirmar(candidatoId: string, v: 'PASA' | 'NO_PASA') {
    // Confirmación cerrada: primer click arma, segundo envía (sin modales — contrato).
    if (confirmando !== v) { confirmando = v; return; }
    confirmando = null;
    const ok = await confirmarVeredicto(candidatoId, v);
    if (ok) { mensajeOk = `Veredicto ${v} aplicado por el custodio`; volverLista(); }
    setTimeout(() => (mensajeOk = ''), 4000);
  }

  async function onAnadir() {
    const ok = await anadirManual({ titulo: nuevoTitulo, url: nuevoUrl || undefined, sector: nuevoSector || undefined });
    if (ok) {
      mensajeOk = 'Candidato añadido (fuente manual)';
      nuevoTitulo = ''; nuevoUrl = ''; nuevoSector = '';
      anadirAbierto = false;
      setTimeout(() => (mensajeOk = ''), 4000);
    }
  }

  async function onCorregir(candidatoId: string) {
    const ok = await corregirFicha(candidatoId, campoCorregir, valorCorregir);
    if (ok) {
      mensajeOk = 'Ficha corregida — re-evaluación encadenada';
      campoCorregir = ''; valorCorregir = '';
      setTimeout(() => (mensajeOk = ''), 4000);
    }
  }

  function estadoClase(estado: string): string {
    const e = String(estado || '').toUpperCase();
    if (e.includes('APROB') || e === 'PASA') return 'ok';
    if (e.includes('RECHAZ') || e === 'NO_PASA' || e.includes('FALLID')) return 'ko';
    if (e.includes('OBSERV') || e.includes('CRUDO')) return 'pend';
    return 'neutro';
  }
</script>

<section class="panel">
  <header class="cabecera">
    <h2>📡 Radar de nichos</h2>
    <span class="total">{totalVisible} candidatos</span>
  </header>

  {#if mensajeOk}<div class="ok-banner">✓ {mensajeOk}</div>{/if}
  {#if $error}<div class="error">⚠ {$error}</div>{/if}

  {#if $vista === 'lista'}
    <div class="filtros">
      <button class="filtro" class:activo={$filtroEstado === 'todos'} on:click={() => filtroEstado.set('todos')}>todos</button>
      {#each $estadosPresentes as estado}
        <button class="filtro" class:activo={$filtroEstado === estado} on:click={() => filtroEstado.set(estado)}>{estado}</button>
      {/each}
      <button class="anadir-btn" on:click={() => (anadirAbierto = !anadirAbierto)}>
        {anadirAbierto ? '▴ cerrar' : '+ añadir manual'}
      </button>
    </div>

    {#if anadirAbierto}
      <div class="form-nuevo">
        <input placeholder="Título * (obligatorio)" bind:value={nuevoTitulo} />
        <input placeholder="URL (opcional — se auto-genera si falta)" bind:value={nuevoUrl} />
        <input placeholder="Sector (opcional)" bind:value={nuevoSector} />
        <button on:click={onAnadir} disabled={$busy === '__nuevo__' || !nuevoTitulo.trim()}>
          {$busy === '__nuevo__' ? 'añadiendo…' : 'Añadir'}
        </button>
      </div>
    {/if}

    {#if $listaFiltrada.length === 0}
      <p class="hint">No hay candidatos con este filtro.</p>
    {:else}
      <div class="tablero">
        {#each $listaFiltrada as c (c.id)}
          <div class="candidato" class:ocupado={$busy === c.id}>
            <div class="cand-cab">
              <button class="titulo" on:click={() => verCandidato(c.id)} title="Ver ficha completa">{c.titulo}</button>
              <span class="estado {estadoClase(c.estado)}">{c.estado}</span>
            </div>
            <div class="cand-meta">
              <span class="fuente">fuente: {c.fuente}</span>
              {#if c.sector}<span class="sector">· {c.sector}</span>{/if}
            </div>
            <div class="cand-acciones">
              <button class="ver" on:click={() => verCandidato(c.id)} disabled={$busy === c.id}>ver ficha →</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    {#if $ficha}
      <div class="ficha">
        <div class="ficha-cab">
          <button class="volver" on:click={volverLista}>← lista</button>
          <h3>{$ficha.titulo}</h3>
          <span class="estado {estadoClase($ficha.estado)}">{$ficha.estado}</span>
        </div>
        <p class="hint">
          fuente: {$ficha.fuente}{#if $ficha.sector} · sector: {$ficha.sector}{/if}
          {#if $ficha.veredicto} · veredicto: <strong>{$ficha.veredicto}</strong>{/if}
        </p>

        <div class="evidencia">
          <h4>Evidencia por criterio (M11 — transparencia total)</h4>
          {#if ($ficha.detallePorCriterio || []).length === 0}
            <p class="hint">Sin evidencia registrada.</p>
          {:else}
            {#each $ficha.detallePorCriterio as dc}
              <div class="criterio">
                <div class="crit-cab">
                  <span class="crit-nombre">{dc.criterio}</span>
                  {#if dc.puntuacion !== undefined}<span class="crit-puntos">{dc.puntuacion}</span>{/if}
                </div>
                <p class="crit-evidencia">{dc.evidencia}</p>
              </div>
            {/each}
          {/if}
        </div>

        {#if ($ficha.criterios_faltantes || []).length > 0}
          <div class="faltantes">
            <h4>Criterios faltantes — el dueño puede aportar el dato (M10)</h4>
            <p class="hint">{($ficha.criterios_faltantes || []).join(' · ')}</p>
          </div>
        {/if}

        <div class="acciones">
          <div class="confirmar">
            <span class="accion-label">Confirmar veredicto (la decisión es tuya):</span>
            <button class="pasa" on:click={() => onConfirmar($ficha.id, 'PASA')}
                    disabled={$busy === $ficha.id}>
              {confirmando === 'PASA' ? '¿Seguro? Pulsa otra vez' : '✔ PASA'}
            </button>
            <button class="nopasa" on:click={() => onConfirmar($ficha.id, 'NO_PASA')}
                    disabled={$busy === $ficha.id}>
              {confirmando === 'NO_PASA' ? '¿Seguro? Pulsa otra vez' : '✘ NO_PASA'}
            </button>
          </div>

          <div class="corregir">
            <input placeholder="campo (p.ej. sector, descripcion)" bind:value={campoCorregir} />
            <input placeholder="valor correcto" bind:value={valorCorregir} />
            <button on:click={() => onCorregir($ficha.id)}
                    disabled={$busy === $ficha.id || !campoCorregir.trim() || !valorCorregir.trim()}>
              Corregir ficha
            </button>
          </div>
        </div>
      </div>
    {:else}
      <p class="hint">Cargando ficha…</p>
    {/if}
  {/if}
</section>

<style>
  .panel { padding: 1rem 1.25rem; color: var(--color-text, #eeeeee); max-height: 33vh; overflow-y: auto; }
  .cabecera { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
  .cabecera h2 { margin: 0; font-size: 1.05rem; }
  .total { color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .hint { color: var(--color-text-muted, #888); font-size: 0.85rem; margin: 0.4rem 0; }
  .ok-banner { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); border-radius: 6px; padding: 0.4rem 0.75rem; margin-bottom: 0.6rem; font-size: 0.85rem; }
  .error { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 0.4rem 0.75rem; margin-bottom: 0.6rem; font-size: 0.85rem; }
  .filtros { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 0.75rem; }
  .filtro { cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-border, #333); border-radius: 20px; padding: 2px 10px; background: var(--color-surface-2, #222); color: var(--color-text-muted, #aaa); }
  .filtro.activo { border-color: var(--color-primary, #eab308); color: var(--color-primary, #eab308); }
  .anadir-btn { margin-left: auto; cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 2px 8px; background: var(--color-surface-2, #222); color: var(--color-text, #eeeeee); }
  .form-nuevo { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .form-nuevo input, .corregir input { flex: 1; min-width: 120px; font-size: 0.8rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 4px 8px; background: var(--color-surface-2, #222); color: var(--color-text, #eeeeee); }
  .form-nuevo button, .corregir button { cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-primary, #eab308); border-radius: 6px; padding: 4px 10px; background: rgba(245,158,11,0.12); color: var(--color-primary, #eab308); }
  .tablero { display: flex; flex-direction: column; gap: 0.5rem; }
  .candidato { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.5rem 0.75rem; background: var(--color-surface, #111111); }
  .candidato.ocupado { opacity: 0.6; }
  .cand-cab { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .titulo { cursor: pointer; font-weight: 600; background: none; border: none; color: var(--color-text, #eeeeee); text-align: left; font-size: 0.9rem; }
  .titulo:hover { color: var(--color-primary, #eab308); }
  .estado { font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
  .estado.ok { background: rgba(34,197,94,0.15); color: #22c55e; }
  .estado.ko { background: rgba(239,68,68,0.15); color: #ef4444; }
  .estado.pend { background: rgba(245,158,11,0.15); color: var(--color-primary, #eab308); }
  .estado.neutro { background: rgba(148,163,184,0.15); color: var(--color-text-muted, #888); }
  .cand-meta { margin-top: 0.2rem; font-size: 0.75rem; color: var(--color-text-muted, #888); }
  .cand-acciones { margin-top: 0.35rem; }
  .ver { cursor: pointer; font-size: 0.72rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 2px 8px; background: var(--color-surface-2, #222); color: var(--color-text-muted, #ccc); }
  .ficha { display: flex; flex-direction: column; gap: 0.6rem; }
  .ficha-cab { display: flex; align-items: center; gap: 0.6rem; }
  .ficha-cab h3 { margin: 0; font-size: 1rem; }
  .volver { cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 2px 8px; background: var(--color-surface-2, #222); color: var(--color-text-muted, #ccc); }
  .evidencia, .faltantes { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.6rem 0.8rem; background: var(--color-surface, #111111); }
  .evidencia h4, .faltantes h4 { margin: 0 0 0.4rem; font-size: 0.82rem; color: var(--color-text-muted, #aaa); }
  .criterio { border-bottom: 1px dashed var(--color-border, #333); padding: 0.35rem 0; }
  .criterio:last-child { border-bottom: none; }
  .crit-cab { display: flex; justify-content: space-between; align-items: center; }
  .crit-nombre { font-weight: 600; font-size: 0.82rem; }
  .crit-puntos { font-size: 0.75rem; color: var(--color-primary, #eab308); }
  .crit-evidencia { margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--color-text-muted, #aaa); line-height: 1.35; }
  .acciones { display: flex; flex-direction: column; gap: 0.6rem; }
  .confirmar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .accion-label { font-size: 0.8rem; color: var(--color-text-muted, #aaa); }
  .pasa, .nopasa { cursor: pointer; font-size: 0.78rem; font-weight: 600; border-radius: 6px; padding: 4px 12px; }
  .pasa { border: 1px solid rgba(34,197,94,0.4); background: rgba(34,197,94,0.12); color: #22c55e; }
  .nopasa { border: 1px solid rgba(239,68,68,0.4); background: rgba(239,68,68,0.12); color: #ef4444; }
  .corregir { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
