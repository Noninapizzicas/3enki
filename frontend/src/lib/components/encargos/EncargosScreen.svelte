<script lang="ts">
  /**
   * EncargosScreen — Web de encargos del cliente (diseñada para mayores).
   *
   * Flujo guiado, UNA pregunta por pantalla, cero inputs de texto:
   *   1. ¿Qué quiere encargar?  → tarjetas grandes (icono + nombre + días).
   *   2. ¿Para cuándo?          → botones gigantes HOY · MAÑANA · PASADO MAÑANA.
   *   3. "Un momento, miro el horno…"
   *   4. Resultado en semáforo:
   *        verde  ✓ "estará el lunes"            → botón Pedir
   *        ámbar  "el martes no sale · te lo dejamos el lunes" → botón Vale
   *        rojo   "para ese día no llega"        → botón otro día
   *
   * Patrón comandero: connect()/disconnect() + mqttRequest.
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect } from '$lib/ui-core';
  import {
    productosEncargo,
    encargosLoading,
    encargosError,
    initEncargos,
    validarEncargo,
    resetEncargos,
    fechaDesdeOffset,
    etiquetaDias,
    nombreDiaDeISO,
    type ProductoEncargo,
    type ValidacionEncargo
  } from '$lib/stores/encargos';

  /** ID del proyecto (UUID real). */
  export let projectId: string = '';

  // ---- Estado del flujo ----
  type Paso = 'producto' | 'cuando' | 'pensando' | 'resultado';
  let paso: Paso = 'producto';
  let producto: ProductoEncargo | null = null;
  let validacion: ValidacionEncargo | null = null;
  let fechaElegida: string | null = null;
  let errorMsg = '';

  // ---- Opciones de "cuándo" ----
  const opcionesCuando = [
    { offset: 0, label: 'HOY' },
    { offset: 1, label: 'MAÑANA' },
    { offset: 2, label: 'PASADO MAÑANA' }
  ];

  function elegirProducto(p: ProductoEncargo) {
    producto = p;
    paso = 'cuando';
  }

  async function elegirCuando(offset: number) {
    if (!producto) return;
    paso = 'pensando';
    errorMsg = '';
    const fecha = fechaDesdeOffset(offset);
    fechaElegida = fecha;
    try {
      validacion = await validarEncargo(projectId, producto.id, fecha);
      paso = 'resultado';
    } catch (err: any) {
      errorMsg = err?.message || 'No se pudo comprobar';
      paso = 'resultado';
    }
  }

  function aceptarPropuesta() {
    // Paso 2 (pedido real) se conecta aquí. Por ahora confirmamos la elección.
    paso = 'resultado';
  }

  function volverAProducto() {
    paso = 'producto';
    producto = null;
    validacion = null;
    fechaElegida = null;
  }

  function volverACuando() {
    paso = 'cuando';
    validacion = null;
  }

  onMount(() => {
    connect().then(async () => {
      await initEncargos(projectId);
    }).catch((err) => {
      console.error('[EncargosScreen] MQTT connection failed', err);
    });
  });

  onDestroy(() => {
    resetEncargos();
    disconnect();
  });
</script>

<div class="encargos-screen">
  <!-- ============ PASO 1: ¿Qué quiere encargar? ============ -->
  {#if paso === 'producto'}
    <div class="paso">
      <h1 class="pregunta">¿Qué quiere encargar?</h1>

      {#if $encargosLoading}
        <p class="pensando">Cargando…</p>
      {:else if $encargosError}
        <p class="error">No se pudo cargar. Pruebe en un momento.</p>
      {:else if $productosEncargo.length === 0}
        <p class="vacio">Pronto podrá encargar aquí.</p>
      {:else}
        <div class="productos">
          {#each $productosEncargo as p (p.id)}
            <button class="producto-btn" on:click={() => elegirProducto(p)}>
              <span class="producto-icon">{p.icon}</span>
              <span class="producto-nombre">{p.nombre}</span>
              <span class="producto-dias">Sale: {etiquetaDias(p.dias_salida)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- ============ PASO 2: ¿Para cuándo? ============ -->
  {#if paso === 'cuando' && producto}
    <div class="paso">
      <h1 class="pregunta">¿Para cuándo lo quiere?</h1>
      <p class="sub">{producto.icon} {producto.nombre}</p>

      <div class="cuando">
        {#each opcionesCuando as op (op.offset)}
          <button class="cuando-btn" on:click={() => elegirCuando(op.offset)}>
            {op.label}
          </button>
        {/each}
      </div>

      <button class="link-btn" on:click={volverAProducto}>← otro producto</button>
    </div>
  {/if}

  <!-- ============ PASO 3: Pensando ============ -->
  {#if paso === 'pensando'}
    <div class="paso">
      <h1 class="pregunta">Un momento, miro el horno…</h1>
      <div class="spinner" aria-hidden="true"></div>
    </div>
  {/if}

  <!-- ============ PASO 4: Resultado (semáforo) ============ -->
  {#if paso === 'resultado' && producto && validacion}
    <div class="paso">
      {#if errorMsg}
        <div class="resultado rojo">
          <span class="resultado-icon">⚠️</span>
          <p class="resultado-texto">No se pudo comprobar. Pruebe en un momento.</p>
          <button class="accion-btn" on:click={volverACuando}>← otro día</button>
        </div>
      {:else if validacion.valido}
        <div class="resultado verde">
          <span class="resultado-icon">✓</span>
          <p class="resultado-texto">
            Sí, {producto.nombre} estará el {validacion.dia_semana}.
          </p>
          <button class="accion-btn" on:click={aceptarPropuesta}>Pedir</button>
        </div>
      {:else if validacion.propuesta}
        <div class="resultado ambar">
          <span class="resultado-icon">🕐</span>
          <p class="resultado-texto">
            El {validacion.dia_semana} no sale · te lo dejamos el {validacion.propuesta.dia}.
          </p>
          <button class="accion-btn" on:click={aceptarPropuesta}>Vale, el {validacion.propuesta.dia}</button>
          <button class="link-btn" on:click={volverACuando}>otro día</button>
        </div>
      {:else}
        <div class="resultado rojo">
          <span class="resultado-icon">✕</span>
          <p class="resultado-texto">Para ese día no llega el obrador.</p>
          <button class="accion-btn" on:click={volverACuando}>otro día</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .encargos-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f3ee;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 24px;
    box-sizing: border-box;
  }

  .paso {
    width: 100%;
    max-width: 560px;
    text-align: center;
  }

  .pregunta {
    font-size: 2rem;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 8px;
  }

  .sub {
    font-size: 1.3rem;
    color: #555;
    margin: 0 0 24px;
  }

  .pensando, .vacio, .error {
    font-size: 1.3rem;
    color: #666;
    margin-top: 24px;
  }

  .error { color: #b91c1c; }

  /* ---- Productos (paso 1) ---- */
  .productos {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 24px;
  }

  .producto-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 16px;
    background: #fff;
    border: 2px solid #e5e0d6;
    border-radius: 20px;
    cursor: pointer;
    transition: transform 0.1s, border-color 0.1s;
  }
  .producto-btn:active { transform: scale(0.98); border-color: #b45309; }
  .producto-icon { font-size: 3rem; }
  .producto-nombre { font-size: 1.6rem; font-weight: 700; color: #1a1a1a; }
  .producto-dias { font-size: 1.1rem; color: #888; }

  /* ---- Cuándo (paso 2) ---- */
  .cuando {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 24px;
  }

  .cuando-btn {
    padding: 28px 16px;
    font-size: 1.8rem;
    font-weight: 700;
    color: #fff;
    background: #b45309;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    transition: transform 0.1s, background 0.1s;
  }
  .cuando-btn:active { transform: scale(0.98); background: #92400e; }

  /* ---- Botones secundarios ---- */
  .link-btn {
    margin-top: 20px;
    background: none;
    border: none;
    color: #b45309;
    font-size: 1.2rem;
    text-decoration: underline;
    cursor: pointer;
  }

  /* ---- Resultado (paso 4) ---- */
  .resultado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 32px 24px;
    border-radius: 20px;
    margin-top: 16px;
  }
  .resultado-icon { font-size: 3.5rem; }
  .resultado-texto { font-size: 1.6rem; font-weight: 600; color: #1a1a1a; margin: 0; }

  .verde { background: #dcfce7; border: 2px solid #16a34a; }
  .ambar { background: #fef3c7; border: 2px solid #d97706; }
  .rojo  { background: #fee2e2; border: 2px solid #dc2626; }

  .accion-btn {
    padding: 20px 40px;
    font-size: 1.6rem;
    font-weight: 700;
    color: #fff;
    background: #16a34a;
    border: none;
    border-radius: 16px;
    cursor: pointer;
  }
  .ambar .accion-btn { background: #d97706; }
  .rojo .accion-btn { background: #dc2626; }

  /* ---- Spinner (paso 3) ---- */
  .spinner {
    width: 56px;
    height: 56px;
    margin: 32px auto 0;
    border: 6px solid #e5e0d6;
    border-top-color: #b45309;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
