<script lang="ts">
  /**
   * CartaConfigPanel - Configuración de carta digital
   *
   * Tema, colores, WhatsApp, branding, moneda.
   * TODO: conectar con backend cuando los endpoints estén listos.
   */

  export let panelId: string = '';

  // Placeholder — se conectará a la config real del proyecto
  let config = {
    restaurantName: '',
    whatsapp: '',
    currency: 'EUR',
    theme: 'dark',
    primaryColor: '#e85d04',
    showPrices: true
  };

  let saving = false;

  async function handleSave() {
    saving = true;
    // TODO: mqttRequest para guardar config
    await new Promise(r => setTimeout(r, 500));
    saving = false;
  }
</script>

<div class="panel-body">
  <div class="form-group">
    <label class="form-label" for="cc-name">Nombre del restaurante</label>
    <input id="cc-name" class="form-input" type="text" bind:value={config.restaurantName} placeholder="Ej: Peppone" />
  </div>

  <div class="form-group">
    <label class="form-label" for="cc-whatsapp">WhatsApp (con prefijo)</label>
    <input id="cc-whatsapp" class="form-input" type="tel" bind:value={config.whatsapp} placeholder="+34 612 345 678" />
  </div>

  <div class="form-row">
    <div class="form-group compact">
      <label class="form-label" for="cc-currency">Moneda</label>
      <select id="cc-currency" class="form-input" bind:value={config.currency}>
        <option value="EUR">€ EUR</option>
        <option value="USD">$ USD</option>
        <option value="GBP">£ GBP</option>
      </select>
    </div>
    <div class="form-group compact">
      <label class="form-label" for="cc-theme">Tema</label>
      <select id="cc-theme" class="form-input" bind:value={config.theme}>
        <option value="dark">Oscuro</option>
        <option value="light">Claro</option>
      </select>
    </div>
  </div>

  <div class="form-group">
    <label class="form-label" for="cc-color">Color principal</label>
    <div class="color-row">
      <input id="cc-color" type="color" bind:value={config.primaryColor} />
      <span class="color-hex">{config.primaryColor}</span>
    </div>
  </div>

  <label class="checkbox-row">
    <input type="checkbox" bind:checked={config.showPrices} />
    <span class="form-label">Mostrar precios en la carta</span>
  </label>

  <button class="btn-action" on:click={handleSave} disabled={saving}>
    {saving ? 'Guardando...' : '💾 Guardar configuración'}
  </button>
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem;
  }
  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-group.compact { flex: 1; min-width: 0; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .form-input {
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }
  .form-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .form-row { display: flex; gap: 0.5rem; }
  .color-row { display: flex; align-items: center; gap: 0.5rem; }
  .color-row input[type="color"] {
    width: 2rem; height: 2rem;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.25rem;
    background: none;
    cursor: pointer;
  }
  .color-hex { font-size: 0.75rem; font-family: monospace; color: var(--color-text-muted, #888); }
  .checkbox-row {
    display: flex; align-items: center; gap: 0.5rem;
    cursor: pointer;
  }
  .btn-action {
    padding: 0.6rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
