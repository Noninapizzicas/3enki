<script lang="ts">
  /**
   * RefSelect — Select dinámico que carga opciones vía MQTT RPC.
   * Dado un arg con tipo='ref', hace mqttRequest(dominio, accion) en onMount
   * y renderiza un <select> con las opciones.
   * Fallback: si falla o no hay opciones, degrada a input texto.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { mqttRequest, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
  import { activeProjectId } from '$lib/stores/projects';
  import type { BlueprintArg } from './blueprint-zones';

  export let arg: BlueprintArg;
  export let op: { nombre: string };
  export let moduleId = '';
  export let value: unknown = '';
  export let onchange: (v: string) => void = () => {};

  let opciones: { value: string; label: string }[] = [];
  let cargando = true;
  let fallback = false;

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
    if (!pid) { cargando = false; fallback = true; return; }
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 5000)
    );
    try {
      const res = await Promise.race([
        mqttRequest(refModule, refAction, { project_id: pid }),
        timeout
      ]);
      const data = (res as any).data;
      if (!data) { cargando = false; fallback = true; return; }
      const items = Array.isArray(data) ? data
        : data[Object.keys(data).find((k: string) => Array.isArray(data[k])) || ''] || [];
      opciones = (items as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
        value: String(item[refValue] ?? ''),
        label: String(item[refLabel] ?? item[refValue] ?? ''),
      }));
      if (opciones.length === 0) fallback = true;
    } catch {
      fallback = true;
    } finally {
      cargando = false;
    }
  });
</script>

{#if cargando}
  <select disabled><option value="">Cargando…</option></select>
{:else if fallback && opciones.length === 0}
  <input
    type="text"
    value={String(value || '')}
    placeholder={arg.placeholder || arg.nombre}
    on:input={(e) => onchange((e.target).value)}
  />
{:else}
  <select
    value={String(value || '')}
    on:change={(e) => onchange((e.target).value)}
  >
    <option value="">—</option>
    {#each opciones as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
{/if}
