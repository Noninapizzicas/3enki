<script lang="ts">
  /**
   * InterruptoresPanel — el panel de control de on/off del sistema.
   *
   * Lista los interruptores que las features registraron en el backend y los
   * enciende/apaga. Cada cambio viaja por interruptores.set -> el dueño reacciona
   * en caliente (interruptor.cambiado), sin reinicio.
   */
  import { onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  type Toggle = { id: string; label: string; descripcion: string; grupo: string; estado: boolean };

  let toggles: Toggle[] = [];
  let loading = true;
  let error = '';
  let busy: Record<string, boolean> = {};

  async function cargar() {
    loading = true;
    error = '';
    try {
      const res = await mqttRequest<{ toggles: Toggle[] }>('interruptores', 'listar');
      toggles = res.data?.toggles ?? [];
    } catch (e: any) {
      error = e?.message || 'No se pudo cargar los interruptores';
    } finally {
      loading = false;
    }
  }

  async function flip(t: Toggle) {
    const next = !t.estado;
    busy = { ...busy, [t.id]: true };
    t.estado = next;                 // optimista
    toggles = toggles;
    try {
      await mqttRequest('interruptores', 'set', { id: t.id, enabled: next });
    } catch (e: any) {
      t.estado = !next;              // rollback
      toggles = toggles;
      error = e?.message || 'No se pudo cambiar el interruptor';
    } finally {
      busy = { ...busy, [t.id]: false };
    }
  }

  function porGrupo(ts: Toggle[]): [string, Toggle[]][] {
    const g: Record<string, Toggle[]> = {};
    for (const t of ts) (g[t.grupo] ??= []).push(t);
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }

  onMount(cargar);
</script>

<div class="interruptores">
  <header>
    <h2>🎛️ Interruptores</h2>
    <button class="recargar" on:click={cargar} disabled={loading} title="Recargar">↻</button>
  </header>

  {#if error}
    <p class="err">{error}</p>
  {/if}

  {#if loading}
    <p class="muted">Cargando…</p>
  {:else if toggles.length === 0}
    <p class="muted">Aún no hay interruptores registrados. Aparecen aquí cuando sus módulos cargan.</p>
  {:else}
    {#each porGrupo(toggles) as [grupo, items] (grupo)}
      <section>
        <h3>{grupo}</h3>
        {#each items as t (t.id)}
          <div class="row">
            <div class="info">
              <span class="label">{t.label}</span>
              {#if t.descripcion}<span class="desc">{t.descripcion}</span>{/if}
            </div>
            <button
              class="switch {t.estado ? 'on' : 'off'}"
              on:click={() => flip(t)}
              disabled={busy[t.id]}
              aria-pressed={t.estado}
              title={t.estado ? 'Encendido' : 'Apagado'}>
              <span class="knob"></span>
            </button>
          </div>
        {/each}
      </section>
    {/each}
  {/if}
</div>

<style>
  .interruptores { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
  header { display: flex; align-items: center; justify-content: space-between; }
  header h2 { margin: 0; font-size: 1.1rem; }
  .recargar { background: none; border: none; cursor: pointer; font-size: 1.1rem; opacity: .7; }
  .recargar:hover { opacity: 1; }
  .err { color: #d33; background: #fdecec; padding: .5rem .75rem; border-radius: 6px; margin: 0; }
  .muted { color: #888; font-size: .9rem; }
  section { display: flex; flex-direction: column; gap: .5rem; }
  section h3 { margin: 0 0 .25rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: #999; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .5rem 0; border-bottom: 1px solid #00000010; }
  .info { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
  .label { font-weight: 600; font-size: .95rem; }
  .desc { font-size: .8rem; color: #888; }
  .switch { position: relative; width: 44px; height: 24px; border-radius: 12px; border: none; cursor: pointer; flex: 0 0 auto; transition: background .15s; }
  .switch.on { background: #2ecc71; }
  .switch.off { background: #ccc; }
  .switch:disabled { opacity: .5; cursor: wait; }
  .knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s; }
  .switch.on .knob { transform: translateX(20px); }
</style>
