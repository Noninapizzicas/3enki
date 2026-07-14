<script lang="ts">
  /**
   * /redimir — onboarding del invitado (el otro extremo de la cadena de delegación).
   *
   * El invitado llega con un código enki-inv:… (link o pegado). Esta pantalla:
   *   1. decodifica el código para mostrar QUÉ otorga (crear proyecto | unirse, con rol)
   *   2. al aceptar: genera la clave de ESTE navegador, redime, guarda el cert
   *   → el navegador queda con identidad en el bus (project + role)
   *
   * Funciona SIN proyecto previo (crear-proyecto no tiene proyecto aún) — por eso es ruta propia.
   */
  import { onMount } from 'svelte';
  import { connect } from '$lib/ui-core/mqtt';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { redimirInvitacion } from '$lib/ui-core/enki-identity';

  let codigo = '';
  let nombreProyecto = '';
  let estado: 'idle' | 'redimiendo' | 'ok' | 'error' = 'idle';
  let mensaje = '';
  let resultado: { project: string; role: string } | null = null;

  // decodifica el código en el navegador para mostrar qué otorga (no confía en él, solo informa)
  function otorgaDe(cod: string): { accion?: string; project?: string | null; role?: string } | null {
    try {
      const b64u = cod.replace(/^enki-inv:/, '').trim();
      const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const bin = atob(b64 + pad);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const json = JSON.parse(new TextDecoder().decode(bytes));
      return json?.otorga ?? null;
    } catch { return null; }
  }

  $: otorga = otorgaDe(codigo);
  $: esCrear = otorga?.accion === 'crear-proyecto';

  onMount(() => {
    connect();   // conecta el bus (anónimo — redimir es un dominio que en observe/off pasa)
    const url = new URL(window.location.href);
    const c = url.searchParams.get('codigo') || url.searchParams.get('c');
    if (c) codigo = c;
  });

  async function aceptar() {
    estado = 'redimiendo'; mensaje = '';
    try {
      resultado = await redimirInvitacion(mqttRequest, codigo.trim(), esCrear ? { nombre_proyecto: nombreProyecto.trim() } : {});
      estado = 'ok';
    } catch (e) {
      estado = 'error';
      mensaje = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    }
  }
</script>

<div class="wrap">
  <h1>🎟️ Aceptar invitación</h1>

  {#if estado === 'ok' && resultado}
    <div class="ok">
      <p class="big">✓ ¡Listo!</p>
      <p>Ya tienes acceso al proyecto <strong>{resultado.project}</strong> como <strong>{resultado.role}</strong>.</p>
      <p class="hint">Este navegador ya porta tu identidad. Entra a tu proyecto:</p>
      <a class="primary" href={`/${resultado.project}`}>Ir a {resultado.project}</a>
    </div>
  {:else}
    <p class="hint">Pega el código que te dieron (empieza por <code>enki-inv:</code>).</p>
    <textarea bind:value={codigo} rows="3" placeholder="enki-inv:…"></textarea>

    {#if otorga}
      <div class="preview">
        {#if esCrear}
          Crearás un <strong>proyecto nuevo</strong> y serás su <strong>project-admin</strong>.
        {:else}
          Te unirás al proyecto <strong>{otorga.project}</strong> como <strong>{otorga.role}</strong>.
        {/if}
      </div>
    {:else if codigo.trim()}
      <div class="preview no">No pude leer el código. ¿Está completo?</div>
    {/if}

    {#if esCrear}
      <label>Nombre del proyecto
        <input type="text" bind:value={nombreProyecto} placeholder="Ej: Pizzería Roma" />
      </label>
    {/if}

    <button class="primary" on:click={aceptar}
      disabled={estado === 'redimiendo' || !otorga || (esCrear && !nombreProyecto.trim())}>
      {estado === 'redimiendo' ? 'Aceptando…' : 'Aceptar invitación'}
    </button>

    {#if estado === 'error'}
      <div class="err">⚠ {mensaje}</div>
    {/if}
  {/if}
</div>

<style>
  .wrap { max-width: 420px; margin: 3rem auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
  h1 { font-size: 1.3rem; }
  .hint { font-size: 0.85rem; opacity: 0.7; }
  textarea, input { width: 100%; padding: 0.6rem; border: 1px solid #444; border-radius: 6px; background: #111; color: #fff; font-family: monospace; }
  input { font-family: inherit; }
  label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; }
  .preview { padding: 0.6rem; border: 1px dashed #555; border-radius: 6px; font-size: 0.9rem; }
  .preview.no { border-color: #c5221f; color: #ff8a80; }
  .primary { padding: 0.7rem; background: #2d6cdf; color: #fff; border: none; border-radius: 6px; cursor: pointer; text-align: center; text-decoration: none; font-size: 1rem; }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .ok { display: flex; flex-direction: column; gap: 0.6rem; }
  .ok .big { font-size: 1.4rem; color: #5bd18a; }
  .err { padding: 0.6rem; background: #3a1512; color: #ff8a80; border-radius: 6px; font-size: 0.85rem; }
  code { background: #222; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
