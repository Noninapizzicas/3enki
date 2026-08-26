<script lang="ts">
  /**
   * RefSelect — Select dinámico que carga opciones vía MQTT RPC.
   * Dado un arg con tipo='ref', hace mqttRequest(dominio, accion) en onMount
   * y renderiza un <select> con las opciones.
   * Sin LLM, sin código específico por módulo — pura lógica determinista.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { activeProjectId } from '$lib/stores/projects';
  import type { BlueprintArg } from './blueprint-zones';

  export let arg: BlueprintArg;
  export let op: { nombre: string };
  export let moduleId = '';
  export let value: unknown = '';
  export let onchange: (v: string) => void = () => {};

  let opciones: { value: string; label: string }[] = [];
  let cargando = true;
  let error = '';

  $: refParts = (arg.ref || '').split('.');
  $: refModule = refParts[0] || moduleId;
  $: refAction = refParts.slice(1).join('.') || arg.nombre;
  $: refLabel = arg.ref_label || 'nombre';
  $: refValue = arg.ref_value || 'id';

  function getProjectId(): string | null {
    return get(activeProjectId) || null;
  }

  onMount(async () => {
    const pid = getProjectId();
    if (!pid) { cargando = false; error = 'Selecciona un proyecto'; return; }
    try {
      const res = await mqttRequest(refModule, refAction, { project_id: pid });
      const data = res.data;
      if (!data) { cargando = false; return; }
      const items = Array.isArray(data) ? data
        : data[Object.keys(data).find(k => Array.isArray(data[k])) || ''] || [];
      opciones = (items as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
        value: String(item[refValue] ?? ''),
        label: String(item[refLabel] ?? item[refValue] ?? ''),
      }));
    } catch (e: any) {
      error = e?.message || 'Error al cargar opciones';
    } finally {
      cargando = false;
    }
  });
</script>

{#if cargando}
  <select disabled><option value="">Cargando…</option></select>
{:else if error}
  <div class="ref-error">⚠ {error}</div>
{:else if opciones.length === 0}
  <select disabled><option value="">Sin opciones</option></select>
{:else}
  <select
    value={String(value || '')}
    on:change={(e) => onchange((e.target as HTMLSelectElement).value)}
  >
    <option value="">—</option>
    {#each opciones as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
{/if}

<style>
  .ref-error { font-size: 0.78rem; color: #ff9a9a; }
</style>
