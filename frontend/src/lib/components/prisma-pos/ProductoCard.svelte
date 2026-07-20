<script lang="ts">
  /**
   * ProductoCard — la identidad del ProductoUniversal hecha botón.
   *
   * Los badges NO se codifican por comercio: EMERGEN de naturalezas/ejes/madurez.
   *   elaborado ↔ de_reventa (naturalezas.origen) · cita (requiere_tiempo) · borrador (madurez)
   * Dos zonas: cuerpo → añadir/personalizar · franja → "Opciones" si el producto las declara.
   */
  import { createEventDispatcher } from 'svelte';
  import type { VistaProducto } from './tipos';
  import { precioCentimos } from './tipos';
  import { formatEuros } from '$lib/stores/prisma-pos';

  export let producto: VistaProducto;

  const dispatch = createEventDispatcher<{ add: VistaProducto; personalizar: VistaProducto }>();

  $: precio = precioCentimos(producto);
  $: tieneOpciones = (producto.opciones || []).length > 0;

  $: badge = producto.requiere_tiempo
    ? { txt: 'cita', tone: 'time' }
    : producto.naturalezas?.origen === 'elaborado'
      ? { txt: 'elaborado', tone: 'made' }
      : { txt: 'reventa', tone: 'resell' };

  function cuerpo() {
    // el POS v1 no agenda: un producto con cita no entra al carrito por aquí
    if (producto.requiere_tiempo) return dispatch('personalizar', producto);
    if (tieneOpciones || precio == null) return dispatch('personalizar', producto);
    dispatch('add', producto);
  }
</script>

<div class="prod">
  <button class="main" on:click={cuerpo}>
    <span class="badge {badge.tone}">{badge.txt}</span>
    {#if !producto.listo_para_vender}<span class="badge draft">borrador</span>{/if}
    <span class="n">{producto.nombre}</span>
    {#if precio == null}
      <span class="p cons">Consultar ▸</span>
    {:else}
      <span class="p">{formatEuros(precio)}</span>
    {/if}
  </button>
  {#if tieneOpciones}
    <button class="opts" on:click={() => dispatch('personalizar', producto)}>⚙ Opciones ▸</button>
  {/if}
</div>

<style>
  .prod {
    border: 1px solid var(--color-border, rgba(255,255,255,.09));
    border-radius: 14px; overflow: hidden;
    background: var(--color-surface, rgba(255,255,255,.05));
    display: flex; flex-direction: column;
  }
  .main {
    padding: .7rem; text-align: left; background: none; border: 0;
    color: var(--color-text, #eaf2ef); cursor: pointer;
    display: flex; flex-direction: column; gap: .3rem; min-height: 76px;
  }
  .main:active { background: var(--color-surface-hover, rgba(255,255,255,.1)); }
  .badge {
    align-self: flex-start; font-size: .62rem; font-weight: 600;
    padding: .1rem .42rem; border-radius: 999px;
    background: var(--color-primary-bg, rgba(20,184,166,.18)); color: var(--color-primary, #14b8a6);
  }
  .badge.resell { background: rgba(255,255,255,.06); color: var(--color-text-muted, #94aaa3); }
  .badge.draft { background: rgba(251,191,36,.16); color: var(--color-warning, #fbbf24); }
  .n { font-weight: 700; font-size: .9rem; line-height: 1.2; }
  .p { margin-top: auto; font-weight: 700; }
  .p.cons { color: var(--color-text-muted, #94aaa3); font-weight: 600; font-size: .85rem; }
  .opts {
    border: 0; border-top: 1px dashed var(--color-border, rgba(255,255,255,.09));
    background: var(--color-surface-hover, rgba(255,255,255,.1));
    color: var(--color-primary, #14b8a6); font-weight: 700; font-size: .76rem;
    padding: .4rem .7rem; text-align: left; cursor: pointer;
  }
</style>
