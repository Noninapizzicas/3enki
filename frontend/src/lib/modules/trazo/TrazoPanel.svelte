<script lang="ts">
  /**
   * TrazoPanel — la superficie donde DIBUJAS dentro de Enki.
   *
   * El BORDE del 6º sentido (enki-sense/trazo): captura el gesto en el cliente
   * (dedo/ratón), y al interpretar manda los trazos al motor-trazo (Rust nativo,
   * geometría pura) por mqttRequest('motor-trazo','interpretar',{trazos}). Pinta
   * la geometría que devuelve (caja + tipo). La INTENCIÓN la pones tú; el motor
   * solo mide la FORMA. Degrada honesto si el motor no está (503 sin_motor).
   */
  import { onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  type Punto = { x: number; y: number };
  type Bbox = { x: number; y: number; w: number; h: number };
  type Elemento = { tipo: string; bbox: Bbox; cerrado: boolean; n_puntos: number; n_vertices: number };

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let dpr = 1;

  let trazos: Punto[][] = [];      // trazos cerrados (dibujados)
  let actual: Punto[] = [];        // el trazo en curso
  let dibujando = false;

  let elementos: Elemento[] = [];  // lo que el motor leyó
  let nota = '';
  let cargando = false;
  let error = '';

  const ICONO: Record<string, string> = {
    linea: '📏', circulo: '⭕', rectangulo: '▭', triangulo: '🔺',
    poligono: '⬡', trazo_libre: '〰️', punto: '•'
  };

  onMount(() => {
    ctx = canvas.getContext('2d');
    ajustar();
    const ro = new ResizeObserver(() => ajustar());
    ro.observe(canvas);
    return () => ro.disconnect();
  });

  // Ajusta el backing-store al tamaño real (nítido en pantallas retina).
  function ajustar() {
    if (!canvas || !ctx) return;
    dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    repintar();
  }

  function pos(e: PointerEvent): Punto {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function abajo(e: PointerEvent) {
    dibujando = true;
    actual = [pos(e)];
    canvas.setPointerCapture(e.pointerId);
    // dibujar de nuevo desactiva las cajas del resultado anterior
    elementos = [];
    error = '';
  }

  function mueve(e: PointerEvent) {
    if (!dibujando) return;
    const p = pos(e);
    const ult = actual[actual.length - 1];
    // descarta micro-movimientos (ruido de mano)
    if (ult && Math.hypot(p.x - ult.x, p.y - ult.y) < 1.5) return;
    actual.push(p);
    repintar();
  }

  function arriba(e: PointerEvent) {
    if (!dibujando) return;
    dibujando = false;
    if (actual.length >= 1) trazos = [...trazos, actual];
    actual = [];
    repintar();
  }

  function limpiar() {
    trazos = [];
    actual = [];
    elementos = [];
    nota = '';
    error = '';
    repintar();
  }

  function deshacer() {
    trazos = trazos.slice(0, -1);
    elementos = [];
    repintar();
  }

  function repintar() {
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // trazos del usuario
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4aa3ff';
    for (const t of [...trazos, actual]) {
      if (t.length < 2) {
        if (t.length === 1) { ctx.beginPath(); ctx.arc(t[0].x, t[0].y, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#4aa3ff'; ctx.fill(); }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y);
      for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y);
      ctx.stroke();
    }

    // geometría leída por el motor (cajas + etiqueta)
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#38d39f';
    ctx.fillStyle = '#38d39f';
    ctx.font = '12px system-ui, sans-serif';
    for (const el of elementos) {
      const b = el.bbox;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      const etq = `${ICONO[el.tipo] ?? '·'} ${el.tipo}`;
      ctx.fillText(etq, b.x, Math.max(12, b.y - 4));
    }
    ctx.setLineDash([]);
  }

  async function interpretar() {
    if (trazos.length === 0) { error = 'Dibuja algo primero.'; return; }
    cargando = true;
    error = '';
    try {
      const res = await mqttRequest<{ elementos: Elemento[]; total: number; nota: string }>(
        'motor-trazo', 'interpretar', { trazos }
      );
      elementos = res.data?.elementos ?? [];
      nota = res.data?.nota ?? '';
      repintar();
    } catch (e: any) {
      const code = e?.code || e?.response?.error?.code;
      if (code === 'UPSTREAM_UNREACHABLE' || e?.status === 503) {
        error = 'El motor-trazo no está desplegado (503). Levántalo en el VPS con vps-setup.sh — mientras tanto el sentido degrada honesto, no inventa formas.';
      } else {
        error = e?.message || 'No se pudo interpretar el trazo.';
      }
    } finally {
      cargando = false;
    }
  }
</script>

<div class="trazo">
  <div class="lienzo-wrap">
    <canvas
      bind:this={canvas}
      class="lienzo"
      on:pointerdown={abajo}
      on:pointermove={mueve}
      on:pointerup={arriba}
      on:pointercancel={arriba}
    ></canvas>
    {#if trazos.length === 0 && actual.length === 0}
      <div class="hint">Dibuja aquí con el dedo o el ratón — una línea, un círculo, un rectángulo…</div>
    {/if}
  </div>

  <div class="barra">
    <button class="btn primario" on:click={interpretar} disabled={cargando || trazos.length === 0}>
      {cargando ? 'Leyendo…' : '👁 Interpretar'}
    </button>
    <button class="btn" on:click={deshacer} disabled={trazos.length === 0}>↩ Deshacer</button>
    <button class="btn" on:click={limpiar} disabled={trazos.length === 0 && elementos.length === 0}>🗑 Limpiar</button>
    <span class="contador">{trazos.length} trazo{trazos.length === 1 ? '' : 's'}</span>
  </div>

  {#if error}
    <div class="aviso error">{error}</div>
  {/if}

  {#if elementos.length > 0}
    <div class="resultado">
      <ul class="formas">
        {#each elementos as el, i}
          <li>
            <span class="ico">{ICONO[el.tipo] ?? '·'}</span>
            <span class="tipo">{el.tipo}</span>
            <span class="meta">
              {el.cerrado ? 'cerrado' : 'abierto'} · {el.n_vertices} vért. ·
              {Math.round(el.bbox.w)}×{Math.round(el.bbox.h)}
            </span>
          </li>
        {/each}
      </ul>
      {#if nota}<p class="nota">{nota}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .trazo { display: flex; flex-direction: column; gap: 0.75rem; height: 100%; padding: 0.5rem; }
  .lienzo-wrap { position: relative; flex: 1; min-height: 300px; }
  .lienzo {
    width: 100%; height: 100%;
    background: var(--color-bg, #0f0f12);
    border: 1px solid var(--color-border, #333);
    border-radius: 0.5rem;
    touch-action: none;            /* el dedo dibuja, no hace scroll */
    cursor: crosshair;
    display: block;
  }
  .hint {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-text-muted, #777); font-size: 0.9rem;
    pointer-events: none; text-align: center; padding: 1rem;
  }
  .barra { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .btn {
    background: var(--color-bg-elevated, #1c1c22); color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, #333); border-radius: 0.4rem;
    padding: 0.4rem 0.75rem; font-size: 0.85rem; cursor: pointer; transition: background 0.15s;
  }
  .btn:hover:not(:disabled) { background: var(--color-bg-hover, rgba(255,255,255,0.06)); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primario { background: #2563eb; border-color: #2563eb; color: #fff; }
  .btn.primario:hover:not(:disabled) { background: #1d4ed8; }
  .contador { margin-left: auto; color: var(--color-text-muted, #777); font-size: 0.8rem; }
  .aviso.error {
    background: rgba(220, 70, 70, 0.12); border: 1px solid rgba(220,70,70,0.4);
    color: #ff9a9a; border-radius: 0.4rem; padding: 0.5rem 0.7rem; font-size: 0.85rem;
  }
  .resultado { border-top: 1px solid var(--color-border, #333); padding-top: 0.5rem; }
  .formas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .formas li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.9rem; }
  .ico { font-size: 1.1rem; }
  .tipo { font-weight: 600; color: var(--color-text, #e5e5e5); }
  .meta { color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .nota { color: var(--color-text-muted, #888); font-size: 0.78rem; margin: 0.5rem 0 0; font-style: italic; }
</style>
