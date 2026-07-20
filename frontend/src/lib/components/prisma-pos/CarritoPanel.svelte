<script lang="ts">
  /**
   * CarritoPanel — REFLEJO puro del store. No calcula: muestra lo que el backend dice
   * (posItems/posTotal) y dispara acciones (quitar, elegir método, cobrar). El cobro
   * cierra el círculo real; un fallo se NOMBRA (posError), jamás se finge cobrado.
   */
  import {
    posItems, posTotalCentimos, posNumItems, posMetodo, posPuedeCobrar, posCobrando,
    posError, posUltimoCobro, seleccionarMetodo, quitarItem, cobrar, formatEuros
  } from '$lib/stores/prisma-pos';
  import type { MetodoPago, CarritoItem } from '$lib/stores/prisma-pos';

  const METODOS: { id: MetodoPago; nombre: string }[] = [
    { id: 'efectivo', nombre: 'Efectivo' },
    { id: 'tarjeta', nombre: 'Tarjeta' },
    { id: 'bizum', nombre: 'Bizum' }
  ];

  function detalle(i: CarritoItem): string {
    const libres = Array.isArray(i.libres) ? i.libres.join(' · ') : '';
    return [libres, i.notas].filter(Boolean).join(' · ');
  }
  // cobrar() cierra el círculo en el backend; el error queda NOMBRADO en posError, el éxito abre cuenta nueva
</script>

<aside class="cart">
  <div class="lines">
    {#each $posItems as item (item.id)}
      <div class="line">
        <span class="q">{item.cantidad}×</span>
        <span class="nm">
          {item.nombre}
          {#if detalle(item)}<small>· {detalle(item)}</small>{/if}
        </span>
        <span class="sub">{formatEuros(item.subtotal_centimos)}</span>
        <button class="x" title="Quitar" on:click={() => quitarItem(item.id)}>✕</button>
      </div>
    {:else}
      <div class="empty">Toca un producto para empezar</div>
    {/each}
  </div>

  {#if $posUltimoCobro}
    <div class="recibo">
      Cobrado · {$posUltimoCobro.metodo_pago}
      {#if $posUltimoCobro.cambio_centimos != null && $posUltimoCobro.cambio_centimos > 0}
        · cambio {formatEuros($posUltimoCobro.cambio_centimos)}
      {/if}
    </div>
  {/if}
  {#if $posError}<div class="err">{$posError}</div>{/if}

  <div class="foot">
    <div class="totalrow">
      <span class="t">{$posNumItems} artículo{$posNumItems === 1 ? '' : 's'}</span>
      <span class="v">{formatEuros($posTotalCentimos)}</span>
    </div>
    <div class="pays">
      {#each METODOS as m (m.id)}
        <button class:sel={$posMetodo === m.id} on:click={() => seleccionarMetodo(m.id)}>{m.nombre}</button>
      {/each}
    </div>
    <button class="cobrar" disabled={!$posPuedeCobrar} on:click={cobrar}>
      {$posCobrando ? 'Cobrando…' : ($posPuedeCobrar ? `Cobrar ${formatEuros($posTotalCentimos)}` : 'Cobrar')}
    </button>
  </div>
</aside>

<style>
  .cart {
    background: var(--color-bg-secondary, #111e1a);
    border-top: 1px solid var(--color-border, rgba(255,255,255,.09));
    display: flex; flex-direction: column; max-height: 48vh;
  }
  .lines { overflow-y: auto; padding: .4rem .9rem; min-height: 2.4rem; }
  .line {
    display: flex; align-items: center; gap: .6rem; padding: .4rem 0;
    border-bottom: 1px solid var(--color-border, rgba(255,255,255,.09));
  }
  .line:last-child { border-bottom: 0; }
  .q {
    background: var(--color-surface-hover, rgba(255,255,255,.1)); border-radius: 8px;
    font-weight: 700; font-size: .78rem; padding: .1rem .45rem; color: var(--color-primary, #14b8a6);
  }
  .nm { flex: 1; font-size: .88rem; color: var(--color-text, #eaf2ef); }
  .nm small { color: var(--color-text-muted, #94aaa3); font-size: .76rem; }
  .sub { font-weight: 700; font-size: .88rem; color: var(--color-text, #eaf2ef); }
  .x { color: var(--color-text-muted, #94aaa3); cursor: pointer; padding: 0 .3rem; background: none; border: 0; }
  .empty { color: var(--color-text-muted, #94aaa3); text-align: center; padding: .6rem; font-size: .85rem; }
  .recibo { margin: 0 .9rem; padding: .4rem .6rem; border-radius: 8px; font-size: .8rem;
            background: rgba(52,211,153,.14); color: var(--color-success, #34d399); }
  .err { margin: 0 .9rem; padding: .4rem .6rem; border-radius: 8px; font-size: .8rem;
         background: rgba(248,113,113,.14); color: var(--color-error, #f87171); }
  .foot {
    padding: .7rem .9rem; border-top: 1px solid var(--color-border, rgba(255,255,255,.09));
    display: flex; flex-direction: column; gap: .55rem;
  }
  .totalrow { display: flex; align-items: baseline; }
  .totalrow .t { color: var(--color-text-muted, #94aaa3); font-size: .85rem; }
  .totalrow .v { margin-left: auto; font-size: 1.35rem; font-weight: 800; color: var(--color-text, #eaf2ef); }
  .pays { display: flex; gap: .4rem; }
  .pays button {
    flex: 1; border: 1px solid var(--color-border, rgba(255,255,255,.09));
    background: var(--color-surface, rgba(255,255,255,.05)); color: var(--color-text, #eaf2ef);
    font-weight: 600; font-size: .8rem; padding: .45rem 0; border-radius: 10px; cursor: pointer;
  }
  .pays button.sel {
    border-color: var(--color-primary, #14b8a6); color: var(--color-primary, #14b8a6);
    background: var(--color-primary-bg, rgba(20,184,166,.18));
  }
  .cobrar {
    width: 100%; border: 0; border-radius: 12px; padding: .8rem; font-weight: 800; font-size: 1rem;
    background: var(--color-primary, #14b8a6); color: var(--color-text-inverse, #04120e); cursor: pointer;
  }
  .cobrar:disabled { opacity: .4; cursor: default; }
</style>
