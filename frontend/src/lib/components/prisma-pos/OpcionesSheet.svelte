<script lang="ts">
  /**
   * OpcionesSheet — CAPTURAR: el control que EMERGE de opciones[].modo.
   *
   * No sabe de pizza ni de nada: dibuja un control por opción según su .modo
   *   ELEGIR_UNO → radio · ELEGIR_VARIOS → check · QUITAR → chip "sin X" · LIBRE → texto
   * Recoge `selecciones` (Record<opcionId, valorId[]>) y el precio ESTIMADO es solo un hint —
   * la verdad la fija el backend al añadir (carrito.add_item → opciones.evaluar).
   * v1: el texto LIBRE viaja como `notas` (sin precio); tarifar lo libre = follow-up.
   */
  import { createEventDispatcher } from 'svelte';
  import type { VistaProducto, Opcion } from './tipos';
  import { deltaCentimos, precioCentimos, valoresDisponibles, esLibre } from './tipos';
  import { formatEuros } from '$lib/stores/prisma-pos';

  export let producto: VistaProducto;

  const dispatch = createEventDispatcher<{
    add: { selecciones: Record<string, string[]>; notas: string };
    close: void;
  }>();

  let selecciones: Record<string, string[]> = {};
  let libres: Record<string, string> = {};

  // defaults al abrir/cambiar de producto: ELEGIR_UNO toma el primer valor ofrecible
  $: reset(producto);
  function reset(p: VistaProducto) {
    const sel: Record<string, string[]> = {};
    for (const o of (p.opciones || [])) {
      if (o.modo === 'ELEGIR_UNO') {
        const v = valoresDisponibles(o)[0];
        if (v) sel[o.id] = [v.id];
      }
    }
    selecciones = sel;
    libres = {};
  }

  function toggle(o: Opcion, valorId: string) {
    const actual = selecciones[o.id] || [];
    if (o.modo === 'ELEGIR_UNO') {
      selecciones = { ...selecciones, [o.id]: [valorId] };
    } else {
      const i = actual.indexOf(valorId);
      const next = i >= 0 ? actual.filter(x => x !== valorId) : [...actual, valorId];
      selecciones = { ...selecciones, [o.id]: next };
    }
  }
  const puesto = (o: Opcion, valorId: string) => (selecciones[o.id] || []).includes(valorId);

  // precio estimado (hint): base + Σ deltas de lo elegido
  $: estimado = (() => {
    const base = precioCentimos(producto) || 0;
    let extra = 0;
    for (const o of (producto.opciones || [])) {
      for (const v of valoresDisponibles(o)) if (puesto(o, v.id)) extra += deltaCentimos(v);
    }
    return base + extra;
  })();

  function añadir() {
    const notasLibres = Object.entries(libres)
      .filter(([, t]) => t && t.trim())
      .map(([oid, t]) => {
        const o = producto.opciones.find(x => x.id === oid);
        return `${o?.etiqueta || oid}: ${t.trim()}`;
      })
      .join(' · ');
    dispatch('add', { selecciones, notas: notasLibres });
  }
</script>

<div class="backdrop" on:click|self={() => dispatch('close')} role="presentation">
  <div class="sheet" role="dialog" aria-label={producto.nombre}>
    <header>
      <h3>{producto.nombre}</h3>
      {#if producto.que_es && producto.que_es !== producto.nombre}<p class="sub">{producto.que_es}</p>{/if}
    </header>

    {#each producto.opciones as o (o.id)}
      <section class="grupo">
        <h4>{o.etiqueta}</h4>

        {#if esLibre(o)}
          <input class="libre" type="text" placeholder={`${o.etiqueta}…`} bind:value={libres[o.id]} />
        {:else}
          {#each valoresDisponibles(o) as v (v.id)}
            <button class="val" class:sel={puesto(o, v.id)} on:click={() => toggle(o, v.id)}>
              <span class="marca" aria-hidden="true">{o.modo === 'ELEGIR_UNO' ? '●' : '✓'}</span>
              <span class="et">{o.modo === 'QUITAR' ? 'sin ' : ''}{v.etiqueta}</span>
              {#if deltaCentimos(v)}<span class="d">+{formatEuros(deltaCentimos(v))}</span>{/if}
            </button>
          {/each}
        {/if}
      </section>
    {/each}

    {#if producto.verdades_obligatorias.length}
      <p class="avisos">Contiene: {producto.verdades_obligatorias.join(' · ')}</p>
    {/if}

    <button class="go" on:click={añadir}>Añadir · {formatEuros(estimado)}</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 40;
    background: rgba(0, 0, 0, .6);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .sheet {
    background: var(--color-panel-bg, #0f1a17);
    width: 100%; max-width: 520px;
    border-radius: 16px 16px 0 0;
    padding: 1rem 1rem 1.2rem;
    max-height: 82vh; overflow-y: auto;
    border-top: 1px solid var(--color-border, rgba(255,255,255,.09));
  }
  header h3 { margin: .1rem 0 .15rem; color: var(--color-text, #eaf2ef); }
  .sub { margin: 0 0 .7rem; color: var(--color-text-muted, #94aaa3); font-size: .85rem; }
  .grupo { margin-bottom: .9rem; }
  .grupo h4 { margin: 0 0 .4rem; font-size: .9rem; color: var(--color-text, #eaf2ef); }
  .val {
    width: 100%; display: flex; align-items: center; gap: .55rem;
    padding: .5rem .3rem; border: 0; border-bottom: 1px solid var(--color-border, rgba(255,255,255,.09));
    background: none; color: var(--color-text, #eaf2ef); cursor: pointer; font-size: .92rem; text-align: left;
  }
  .val .marca { opacity: .2; font-size: .8rem; }
  .val.sel .marca { opacity: 1; color: var(--color-primary, #14b8a6); }
  .val.sel .et { color: var(--color-primary, #14b8a6); font-weight: 600; }
  .val .d { margin-left: auto; color: var(--color-text-muted, #94aaa3); font-size: .82rem; }
  .libre {
    width: 100%; background: var(--color-input-bg, #12201c);
    border: 1px solid var(--color-border, rgba(255,255,255,.09)); border-radius: 10px;
    color: var(--color-text, #eaf2ef); padding: .55rem .7rem; font-size: .9rem;
  }
  .avisos { font-size: .74rem; color: var(--color-text-muted, #94aaa3); margin: .2rem 0 .6rem; }
  .go {
    width: 100%; margin-top: .5rem; border: 0; border-radius: 12px;
    background: var(--color-primary, #14b8a6); color: var(--color-text-inverse, #04120e);
    font-weight: 800; font-size: 1rem; padding: .8rem; cursor: pointer;
  }
</style>
