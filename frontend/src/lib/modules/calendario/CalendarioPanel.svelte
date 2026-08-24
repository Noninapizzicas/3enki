<script lang="ts">
  /**
   * CalendarioPanel — la gestión de ENCARGOS del despacho (panel del jefe).
   *
   * Panel CUSTOM (no BlueprintForm): el handler real `calendario.producto.actualizar`
   * espera `{ producto_id, cambios:{ dias_salida, margen_antelacion_h } }`, que el
   * generador schema→UI no puede enviar (manda args planos). Por eso se construye a
   * mano, simple y ágil para el jefe:
   *   · lista de productos (de la carta + los que ya tienen calendario)
   *   · selector de días de salida (7 chips L M X J V S D)
   *   · margen de antelación (horas) + Guardar → producto.actualizar (payload correcto)
   *   · validación rápida: fecha deseada + botón Probar → calendario.validar
   *
   * Los días son 1..7 (ISO 8601: 1=Lun..7=Dom), según el validador real de modules/calendario.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId = '';

  // Días de la semana: 1=Lun .. 7=Dom (ISO). Etiqueta corta para los chips.
  const DIAS = [
    { n: 1, corto: 'L', largo: 'lunes' },
    { n: 2, corto: 'M', largo: 'martes' },
    { n: 3, corto: 'X', largo: 'miércoles' },
    { n: 4, corto: 'J', largo: 'jueves' },
    { n: 5, corto: 'V', largo: 'viernes' },
    { n: 6, corto: 'S', largo: 'sábado' },
    { n: 7, corto: 'D', largo: 'domingo' }
  ];

  type Calendario = { dias_salida: number[]; margen_antelacion_h: number | null };
  type Producto = { id: string; nombre: string };

  let productos: Producto[] = [];            // de la carta (para elegir)
  let calPorProducto: Record<string, Calendario> = {}; // de calendario.productos.leer
  let cargando = true;
  let error = '';

  // Selección del jefe
  let productoId = '';
  let diasSel: number[] = [];
  let margen: number | null = null;
  let guardando = '';            // producto_id en guarda ('' = nada)
  let nota = '';                 // feedback de guardar
  let notaTipo: 'ok' | 'error' = 'ok';

  // Validación rápida
  let fechaDeseada = '';
  let probando = false;
  let resultadoValidacion: null | {
    valido: boolean; motivo: string | null; dia: string | null; propuesta: { fecha: string | null; dia: string | null };
  } = null;

  onMount(cargar);

  function projectId(): string | null {
    return get(activeProjectId);
  }

  async function cargar() {
    cargando = true;
    error = '';
    const pid = projectId();
    try {
      // Productos de la carta (para nombres legibles).
      let carta: Producto[] = [];
      if (pid) {
        try {
          const res = await mqttRequest<{ productos: Producto[] }>('productos', 'carta_completa', { project_id: pid });
          carta = (res.data?.productos || []).map(p => ({ id: p.id, nombre: p.nombre }));
        } catch { /* sin carta activa: nos quedamos con los que tengan calendario */ }
      }

      // Calendarios declarados.
      const cal = await mqttRequest<{ calendarios: Record<string, Calendario> }>('calendario', 'productos.leer', pid ? { project_id: pid } : {});
      const calPorId = cal.data?.calendarios || {};

      // Unir: primero los de la carta (orden natural), luego los que solo tienen calendario.
      const vistos = new Set<string>();
      const unidos: Producto[] = [];
      for (const p of carta) {
        if (!vistos.has(p.id)) { vistos.add(p.id); unidos.push(p); }
      }
      for (const id of Object.keys(calPorId)) {
        if (!vistos.has(id)) { vistos.add(id); unidos.push({ id, nombre: id }); }
      }

      productos = unidos;
      calPorProducto = calPorId;

      // Preseleccionar el primero con calendario (o el primero).
      const primero = Object.keys(calPorId)[0] || unidos[0]?.id || '';
      if (primero) seleccionar(primero);
    } catch (e: any) {
      error = e?.message || 'No se pudieron cargar los productos.';
    } finally {
      cargando = false;
    }
  }

  function seleccionar(id: string) {
    productoId = id;
    const cal = calPorProducto[id];
    diasSel = cal ? [...cal.dias_salida] : [];
    margen = cal ? cal.margen_antelacion_h ?? null : null;
    nota = '';
    resultadoValidacion = null;
  }

  function toggleDia(n: number) {
    diasSel = diasSel.includes(n) ? diasSel.filter(d => d !== n) : [...diasSel, n].sort((a, b) => a - b);
  }

  function nombreDe(id: string): string {
    return productos.find(p => p.id === id)?.nombre || id;
  }

  async function guardar() {
    if (!productoId) return;
    if (diasSel.length === 0) {
      notaTipo = 'error'; nota = 'Marca al menos un día de salida.'; return;
    }
    if (margen === null || margen < 0) {
      notaTipo = 'error'; nota = 'Indica las horas de antelación (0 o más).'; return;
    }
    guardando = productoId;
    nota = ''; error = '';
    try {
      const res = await mqttRequest('calendario', 'producto.actualizar', {
        producto_id: productoId,
        cambios: { dias_salida: diasSel, margen_antelacion_h: margen }
      });
      if (res.success) {
        notaTipo = 'ok';
        nota = `Guardado: ${nombreDe(productoId)} sale ${diasSel.map(d => DIAS[d - 1]?.corto).join(' · ')} · margen ${margen}h.`;
        calPorProducto[productoId] = { dias_salida: diasSel, margen_antelacion_h: margen };
      } else {
        notaTipo = 'error';
        nota = res.error?.message || 'No se pudo guardar.';
      }
    } catch (e: any) {
      notaTipo = 'error';
      nota = e?.message || 'Error al guardar.';
    } finally {
      guardando = '';
    }
  }

  async function probar() {
    if (!productoId || !fechaDeseada) return;
    probando = true;
    resultadoValidacion = null;
    try {
      const res = await mqttRequest('calendario', 'validar', {
        producto_id: productoId,
        fecha_deseada: fechaDeseada
      });
      const d = res.data as any;
      resultadoValidacion = {
        valido: d?.valido,
        motivo: d?.motivo ?? null,
        dia: d?.dia_semana ?? null,
        propuesta: d?.propuesta ?? { fecha: null, dia: null }
      };
    } catch (e: any) {
      error = e?.message || 'No se pudo validar la fecha.';
    } finally {
      probando = false;
    }
  }
</script>

<div class="calendario" data-calendario-panel={panelId}>
  {#if cargando}
    <div class="vacío">Cargando calendario…</div>
  {:else if productos.length === 0}
    <div class="vacío">
      No hay productos con calendario todavía.
      {#if error}<p class="aviso error">{error}</p>{/if}
    </div>
  {:else}
    {#if error}<div class="aviso error">{error}</div>{/if}

    <div class="bloque">
      <label class="etiqueta" for="cal-prod">Producto</label>
      <select id="cal-prod" bind:value={productoId} on:change={() => seleccionar(productoId)} class="select">
        {#each productos as p}
          <option value={p.id}>{p.nombre}</option>
        {/each}
      </select>
    </div>

    <div class="bloque">
      <label class="etiqueta" for="cal-dias">Días de salida</label>
      <div class="chips" id="cal-dias">
        {#each DIAS as d}
          <button
            type="button"
            class="chip {diasSel.includes(d.n) ? 'activo' : ''}"
            on:click={() => toggleDia(d.n)}
            title={d.largo}
          >{d.corto}</button>
        {/each}
      </div>
      {#if diasSel.length > 0}
        <p class="mini">Sale: {diasSel.map(d => DIAS[d - 1]?.largo).join(', ')}</p>
      {/if}
    </div>

    <div class="bloque fila">
      <div class="campo">
        <label class="etiqueta" for="cal-margen">Margen de antelación (horas)</label>
        <input id="cal-margen" type="number" min="0" bind:value={margen} class="input" placeholder="p.ej. 24" />
      </div>
      <button type="button" class="btn primario" on:click={guardar} disabled={guardando !== ''}>
        {guardando ? 'Guardando…' : '💾 Guardar'}
      </button>
    </div>

    {#if nota}
      <div class="aviso {notaTipo}">{nota}</div>
    {/if}

    <div class="separador"></div>

    <div class="bloque">
      <label class="etiqueta" for="cal-fecha">Comprobar una fecha de encargo</label>
      <div class="fila">
        <input id="cal-fecha" type="date" bind:value={fechaDeseada} class="campo" />
        <button type="button" class="btn" on:click={probar} disabled={probando || !fechaDeseada}>
          {probando ? 'Comprobando…' : '✔ Probar'}
        </button>
      </div>
      {#if resultadoValidacion}
        <div class="valido {resultadoValidacion.valido ? 'ok' : 'no'}">
          {#if resultadoValidacion.valido}
            ✅ <strong>{nombreDe(productoId)}</strong> sale el {resultadoValidacion.dia}: fecha válida.
          {:else}
            ❌ <strong>{nombreDe(productoId)}</strong> — {resultadoValidacion.motivo}.
            {#if resultadoValidacion.propuesta?.fecha}
              Día válido más cercano: <strong>{resultadoValidacion.propuesta.fecha} ({resultadoValidacion.propuesta.dia})</strong>.
            {:else}
              No hay día de salida en el horizonte próximo.
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .calendario { display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem; }
  .vacío { color: var(--color-text-muted, #888); font-size: 0.9rem; }
  .bloque { display: flex; flex-direction: column; gap: 0.4rem; }
  .etiqueta { font-size: 0.78rem; color: var(--color-text-muted, #888); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .select, .campo {
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, #333); border-radius: 0.4rem;
    padding: 0.45rem 0.6rem; font-size: 0.9rem; width: 100%;
  }
  .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .chip {
    width: 2.2rem; height: 2.2rem; border-radius: 0.45rem;
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text-muted, #999);
    border: 1px solid var(--color-border, #333); font-weight: 700; font-size: 0.95rem; cursor: pointer;
    transition: all 0.12s;
  }
  .chip.activo { background: #2563eb; border-color: #2563eb; color: #fff; }
  .pic { margin: 0; color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .fila { display: flex; gap: 0.5rem; align-items: center; }
  .btn {
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, #333); border-radius: 0.4rem;
    padding: 0.45rem 0.8rem; font-size: 0.85rem; cursor: pointer; white-space: nowrap;
  }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primario { background: #2563eb; border-color: #2563eb; color: #fff; }
  .aviso { border-radius: 0.4rem; padding: 0.5rem 0.7rem; font-size: 0.85rem; }
  .aviso.ok { background: rgba(56, 211, 159, 0.12); border: 1px solid rgba(56,211,159,0.4); color: #6ee7b7; }
  .aviso.error { background: rgba(220, 70, 70, 0.12); border: 1px solid rgba(220,70,70,0.4); color: #ff9a9a; }
  .separador { border-top: 1px solid var(--color-border, #2a2a30); }
  .valido { border-radius: 0.4rem; padding: 0.55rem 0.7rem; font-size: 0.88rem; }
  .valido.ok { background: rgba(38, 211, 159, 0.12); border: 1px solid rgba(38,211,159,0.4); color: #6ee7b7; }
  .valido.no { background: rgba(220, 70, 70, 0.12); border: 1px solid rgba(220,70,70,0.4); color: #ffc4a3; }
</style>
