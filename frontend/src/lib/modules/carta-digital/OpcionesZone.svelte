<script lang="ts">
  /**
   * OpcionesZone — config del canal (PWA), EDITABLE.
   * Campos que el PWA (static-template) usa de verdad: WhatsApp de pedidos, moneda,
   * mensaje de pedido. Guarda con update_config → luego Refrescas el Preview y lo ves.
   * (Branding —nombre/logo— se edita en marketing; funcionalidades toggles: Paso 2b.)
   */
  import { cartaDigitalConfig, updateCartaDigitalConfig } from '$lib/stores/carta-digital';

  let expanded = false;
  let saving = false;
  let saved = false;
  let dirty = false;

  // campos editables
  let whatsapp = '';
  let moneda = '€';
  let mensaje = '';

  $: op = ($cartaDigitalConfig?.opciones_visualizacion || {}) as Record<string, any>;
  // hidrata desde el config cuando carga / cambia de proyecto, salvo si hay edición sin guardar
  $: if ($cartaDigitalConfig && !dirty) {
    whatsapp = op.whatsapp_telefono || '';
    moneda = op.moneda || '€';
    mensaje = op.mensaje_pedido || '';
  }

  function tocar() { dirty = true; saved = false; }

  async function guardar() {
    saving = true; saved = false;
    const ok = await updateCartaDigitalConfig({
      opciones_visualizacion: {
        whatsapp_telefono: whatsapp.trim(),
        moneda: moneda.trim() || '€',
        mensaje_pedido: mensaje.trim()
      }
    } as any);
    saving = false; saved = ok; dirty = false;
    if (ok) setTimeout(() => (saved = false), 2500);
  }
</script>

<section class="zona-opciones">
  <button class="header-colapsable" on:click={() => (expanded = !expanded)} aria-expanded={expanded}>
    <span class="caret">{expanded ? '▾' : '▸'}</span>
    <span class="titulo">Opciones del PWA</span>
    {#if !expanded}<span class="resumen">WhatsApp · moneda · mensaje</span>{/if}
  </button>

  {#if expanded}
    <div class="form">
      <label class="campo">
        <span class="lbl">WhatsApp de pedidos <small>(con prefijo país)</small></span>
        <input type="tel" inputmode="tel" placeholder="34612345678" bind:value={whatsapp} on:input={tocar} />
      </label>

      <div class="fila">
        <label class="campo small">
          <span class="lbl">Moneda</span>
          <input type="text" maxlength="3" placeholder="€" bind:value={moneda} on:input={tocar} />
        </label>
      </div>

      <label class="campo">
        <span class="lbl">Mensaje de pedido <small>(cabecera del WhatsApp)</small></span>
        <input type="text" placeholder="¡Hola! Quiero pedir:" bind:value={mensaje} on:input={tocar} />
      </label>

      <button class="btn-guardar" on:click={guardar} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
      {#if saved}<span class="ok">✓ Guardado — refresca el Preview para verlo</span>{/if}
    </div>
  {/if}
</section>

<style>
  .zona-opciones { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.75rem 1rem; background: var(--color-surface, #1a1a1a); }
  .header-colapsable { display: flex; align-items: center; gap: 0.5rem; background: none; border: none; cursor: pointer; font-size: 0.9rem; padding: 0; width: 100%; text-align: left; color: var(--color-text, #e5e5e5); }
  .caret { color: var(--color-text-muted, #888); }
  .titulo { font-weight: 600; }
  .resumen { margin-left: auto; font-size: 0.7rem; color: var(--color-text-muted, #888); }
  .form { display: flex; flex-direction: column; gap: 0.7rem; margin-top: 0.8rem; }
  .campo { display: flex; flex-direction: column; gap: 0.25rem; }
  .campo.small { max-width: 120px; }
  .lbl { font-size: 0.72rem; color: var(--color-text-muted, #9aa0a6); }
  .lbl small { opacity: 0.7; }
  .fila { display: flex; gap: 0.6rem; }
  input { background: #0f0f0f; border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.5rem 0.6rem; color: var(--color-text, #e5e5e5); font-size: 0.85rem; }
  input:focus { outline: none; border-color: var(--color-primary, #f59e0b); }
  .btn-guardar { margin-top: 0.2rem; padding: 0.55rem 0.75rem; background: var(--color-primary, #f59e0b); border: none; border-radius: 8px; color: #1a1205; font-size: 0.82rem; font-weight: 700; cursor: pointer; width: fit-content; }
  .btn-guardar:disabled { opacity: 0.5; cursor: default; }
  .ok { font-size: 0.72rem; color: #25d366; }
</style>
