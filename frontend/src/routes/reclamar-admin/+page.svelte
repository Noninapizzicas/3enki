<script lang="ts">
  /**
   * /reclamar-admin — R2: la raíz de la cadena de delegación.
   *
   * El admin del sistema NO recibe invitación (es la raíz). En el primer arranque la CA imprime en
   * consola un código de bootstrap de un solo uso; el dueño lo pega aquí, su navegador genera la
   * clave (no sale) y obtiene el cert admin:system:root. A partir de ahí ES el admin del sistema.
   */
  import { onMount } from 'svelte';
  import { connect } from '$lib/ui-core/mqtt';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { reclamarAdmin } from '$lib/ui-core/enki-identity';

  let token = '';
  let estado: 'idle' | 'reclamando' | 'ok' | 'error' = 'idle';
  let mensaje = '';
  let yaReclamado = false;

  onMount(async () => {
    connect();
    try {
      const st = await mqttRequest<{ claimed: boolean }>('certificate-authority', 'bootstrap-status', {});
      yaReclamado = !!st?.data?.claimed;
    } catch { /* si no hay conexión aún, se verá al reclamar */ }
  });

  async function reclamar() {
    estado = 'reclamando'; mensaje = '';
    try {
      await reclamarAdmin(mqttRequest, token.trim());
      estado = 'ok';
    } catch (e) {
      estado = 'error';
      mensaje = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    }
  }
</script>

<div class="wrap">
  <h1>🔑 Reclamar admin del sistema</h1>

  {#if estado === 'ok'}
    <div class="ok">
      <p class="big">✓ Eres el admin del sistema</p>
      <p>Este navegador ya porta la identidad <strong>admin:system:root</strong>. Puedes emitir invitaciones de proyecto.</p>
      <a class="primary" href="/3333">Ir al panel</a>
    </div>
  {:else if yaReclamado}
    <div class="preview no">El admin del sistema ya fue reclamado. El código de bootstrap es de un solo uso.</div>
  {:else}
    <p class="hint">Pega el <strong>código de bootstrap</strong> que la CA imprimió en consola en el primer arranque.</p>
    <input type="text" bind:value={token} placeholder="código de bootstrap" />
    <p class="hint">Se emite una sola vez. Tu clave privada se genera aquí y nunca sale del navegador.</p>
    <button class="primary" on:click={reclamar} disabled={estado === 'reclamando' || !token.trim()}>
      {estado === 'reclamando' ? 'Reclamando…' : 'Reclamar identidad'}
    </button>
    {#if estado === 'error'}<div class="err">⚠ {mensaje}</div>{/if}
  {/if}
</div>

<style>
  .wrap { max-width: 420px; margin: 3rem auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
  h1 { font-size: 1.3rem; }
  .hint { font-size: 0.85rem; opacity: 0.7; }
  input { width: 100%; padding: 0.6rem; border: 1px solid #444; border-radius: 6px; background: #111; color: #fff; font-family: monospace; }
  .primary { padding: 0.7rem; background: #2d6cdf; color: #fff; border: none; border-radius: 6px; cursor: pointer; text-align: center; text-decoration: none; font-size: 1rem; }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .preview.no { padding: 0.6rem; border: 1px dashed #c5221f; color: #ff8a80; border-radius: 6px; font-size: 0.9rem; }
  .ok { display: flex; flex-direction: column; gap: 0.6rem; }
  .ok .big { font-size: 1.4rem; color: #5bd18a; }
  .err { padding: 0.6rem; background: #3a1512; color: #ff8a80; border-radius: 6px; font-size: 0.85rem; }
</style>
