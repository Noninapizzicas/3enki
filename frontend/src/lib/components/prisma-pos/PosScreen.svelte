<script lang="ts">
  /**
   * PosScreen — orquesta la superficie POS de un proyecto prisma.
   *
   * Monta el cimiento (initPrismaPos → abre cuenta) + suscripciones (coherencia entre
   * superficies), LEE la vista del proyector (la forma EMERGE de aquí) y cose las piezas.
   * Refresca la vista cuando el catálogo cambia (vista.actualizada). No calcula nada:
   * el grid pinta la proyección, el carrito refleja el store, el cobro lo cierra el backend.
   */
  import { onMount, onDestroy } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { subscribe as mqttSubscribe } from '$lib/ui-core';
  import { notifyInfo } from '$lib/stores/ui';
  import {
    initPrismaPos, initPrismaPosSubscriptions, resetPrismaPos, addItem, posRefDisplay
  } from '$lib/stores/prisma-pos';
  import type { VistaProducto, VistaCategoria } from './tipos';
  import ProductoGrid from './ProductoGrid.svelte';
  import CarritoPanel from './CarritoPanel.svelte';
  import OpcionesSheet from './OpcionesSheet.svelte';

  export let projectId: string;

  let comercio = 'Comercio';
  let catalogoId: string | null = null;
  let categorias: VistaCategoria[] = [];
  let productos: VistaProducto[] = [];
  let categoriaActiva: string | null = null;
  let sheetProducto: VistaProducto | null = null;
  let cargando = true;

  let cleanupSubs: (() => void) | null = null;
  let cleanupVista: (() => void) | null = null;

  async function cargarVista() {
    cargando = true;
    try {
      const res = await mqttRequest('vista', 'completa', { project_id: projectId });
      const d = res?.data as any;
      categorias = d?.categorias || [];
      productos = d?.productos || [];
      catalogoId = d?.catalogo_id || null;
      if (!categoriaActiva || !categorias.some(c => c.id === categoriaActiva)) {
        categoriaActiva = categorias[0]?.id || null;
      }
    } catch {
      categorias = []; productos = [];
    } finally {
      cargando = false;
    }
  }

  async function añadir(producto: VistaProducto, selecciones: Record<string, string[]> = {}, notas = '') {
    const r = await addItem({ producto_id: producto.id, catalogo_id: catalogoId || undefined, selecciones, notas });
    if (!r.success && r.error) notifyInfo(r.error);
  }

  function onAdd(e: CustomEvent<VistaProducto>) { añadir(e.detail); }
  function onPersonalizar(e: CustomEvent<VistaProducto>) {
    const p = e.detail;
    if (p.requiere_tiempo) { notifyInfo('Este producto requiere cita — la agenda llega en otra pieza'); return; }
    sheetProducto = p;
  }
  function onSheetAdd(e: CustomEvent<{ selecciones: Record<string, string[]>; notas: string }>) {
    if (sheetProducto) añadir(sheetProducto, e.detail.selecciones, e.detail.notas);
    sheetProducto = null;
  }

  onMount(async () => {
    cleanupSubs = initPrismaPosSubscriptions();
    await initPrismaPos(projectId);
    await cargarVista();
    // el catálogo cambió → re-proyectar (consume-on-read del refresco)
    cleanupVista = mqttSubscribe('vista.actualizada', () => cargarVista());
  });

  onDestroy(() => {
    cleanupSubs?.();
    cleanupVista?.();
    resetPrismaPos();
  });
</script>

<div class="pos">
  <header>
    <span class="dot"></span>
    <span class="name">{comercio} · POS</span>
    {#if $posRefDisplay}<span class="ref">{$posRefDisplay}</span>{/if}
    <span class="tag">prisma</span>
  </header>

  {#if cargando}
    <div class="state">Cargando catálogo…</div>
  {:else if productos.length === 0}
    <div class="state">Este proyecto aún no tiene productos en servicio.</div>
  {:else}
    <ProductoGrid
      {categorias} {productos} {categoriaActiva}
      on:categoria={(e) => (categoriaActiva = e.detail)}
      on:add={onAdd}
      on:personalizar={onPersonalizar}
    />
  {/if}

  <CarritoPanel />

  {#if sheetProducto}
    <OpcionesSheet producto={sheetProducto} on:add={onSheetAdd} on:close={() => (sheetProducto = null)} />
  {/if}
</div>

<style>
  .pos {
    display: flex; flex-direction: column; height: 100%;
    max-width: 560px; margin: 0 auto; width: 100%;
    background: var(--color-bg, #0d1512); color: var(--color-text, #eaf2ef);
  }
  header {
    display: flex; align-items: center; gap: .6rem; padding: .8rem 1rem;
    background: var(--color-bg-secondary, #111e1a); border-bottom: 1px solid var(--color-border, rgba(255,255,255,.09));
  }
  header .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--color-primary, #14b8a6); }
  header .name { font-weight: 700; }
  header .ref { color: var(--color-text-muted, #94aaa3); font-size: .8rem; }
  header .tag {
    margin-left: auto; font-size: .66rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px;
    background: var(--color-primary-bg, rgba(20,184,166,.18)); color: var(--color-primary, #14b8a6);
  }
  .state { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; text-align: center;
           color: var(--color-text-muted, #94aaa3); }
</style>
