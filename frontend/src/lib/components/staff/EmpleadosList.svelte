<script lang="ts">
  /**
   * EmpleadosList — CRUD de empleados + generación de tarjeta NFC
   *
   * Columnas: nombre, rol, estado, acciones (NFC / editar / baja).
   * El formulario de creación/edición aparece inline arriba de la tabla.
   */
  import { onMount } from 'svelte';
  import {
    employees, loading,
    loadEmployees, createEmployee, updateEmployee, deleteEmployee,
    generateNfcEmployeeCard, formatRole
  } from '$lib/stores/staff';
  import NfcCardModal from './NfcCardModal.svelte';
  import type { Employee } from '$lib/stores/staff';

  // Estado local del formulario
  let showForm    = false;
  let editingId: string | null = null;
  let form = { name: '', role: 'camarero', pin: '' };
  const ROLES = ['camarero', 'cocina', 'barra', 'recepción', 'admin'];

  let saving  = false;
  let formErr = '';

  // Estado NFC modal
  let nfcModalData: {
    employeeName: string;
    payload: any;
    jsonString: string;
    byteSize: number;
  } | null = null;

  let showInactive = false;

  function openCreate() {
    editingId = null;
    form      = { name: '', role: 'camarero', pin: '' };
    formErr   = '';
    showForm  = true;
  }

  function openEdit(emp: Employee) {
    editingId = emp.id;
    form      = { name: emp.name, role: emp.role, pin: '' };
    formErr   = '';
    showForm  = true;
  }

  function cancelForm() {
    showForm  = false;
    editingId = null;
    formErr   = '';
  }

  async function submitForm() {
    if (!form.name.trim()) { formErr = 'El nombre es obligatorio'; return; }
    if (!form.role.trim()) { formErr = 'El rol es obligatorio'; return; }

    saving  = true;
    formErr = '';
    try {
      const payload: any = { name: form.name.trim(), role: form.role.trim() };
      if (form.pin.trim()) payload.pin = form.pin.trim();

      if (editingId) {
        await updateEmployee(editingId, payload);
      } else {
        await createEmployee(payload);
      }
      showForm = false;
    } catch (e: any) {
      formErr = e?.message || 'Error al guardar';
    } finally {
      saving = false;
    }
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`¿Dar de baja a ${emp.name}? Sus jornadas históricas se conservan.`)) return;
    try {
      await deleteEmployee(emp.id);
    } catch (e: any) {
      alert(e?.message || 'Error al dar de baja');
    }
  }

  async function handleNfc(emp: Employee) {
    try {
      const data = await generateNfcEmployeeCard(emp.id);
      nfcModalData = {
        employeeName: emp.name,
        payload:      data.payload,
        jsonString:   data.json_string,
        byteSize:     data.byte_size
      };
    } catch (e: any) {
      alert(e?.message || 'Error al generar tarjeta NFC');
    }
  }

  onMount(() => loadEmployees(false));

  $: visibleEmployees = $employees.filter(e => showInactive ? true : e.active);
</script>

<div class="list">
  <!-- Header -->
  <div class="list-header">
    <h2>Empleados</h2>
    <div class="header-actions">
      <label class="toggle-inactive">
        <input type="checkbox" bind:checked={showInactive} on:change={() => loadEmployees(!showInactive ? true : false)} />
        Ver bajas
      </label>
      <button class="add-btn" on:click={openCreate}>+ Añadir</button>
    </div>
  </div>

  <!-- Formulario inline -->
  {#if showForm}
    <div class="form-card">
      <p class="form-title">{editingId ? 'Editar empleado' : 'Nuevo empleado'}</p>

      <div class="form-row">
        <label>
          Nombre
          <input
            class="field"
            type="text"
            bind:value={form.name}
            placeholder="María García"
            autocomplete="off"
          />
        </label>
        <label>
          Rol
          <select class="field" bind:value={form.role}>
            {#each ROLES as r}
              <option value={r}>{formatRole(r)}</option>
            {/each}
          </select>
        </label>
        <label>
          PIN (opcional)
          <input
            class="field"
            type="password"
            bind:value={form.pin}
            placeholder="••••"
            maxlength="8"
            inputmode="numeric"
          />
        </label>
      </div>

      {#if formErr}
        <p class="form-err">{formErr}</p>
      {/if}

      <div class="form-btns">
        <button class="btn-cancel" on:click={cancelForm} disabled={saving}>Cancelar</button>
        <button class="btn-save" on:click={submitForm} disabled={saving}>
          {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear empleado'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Tabla -->
  {#if $loading && $employees.length === 0}
    <div class="empty">Cargando…</div>

  {:else if visibleEmployees.length === 0}
    <div class="empty">
      {#if $employees.length === 0}
        <p>Sin empleados aún</p>
        <span>Pulsa <strong>+ Añadir</strong> para crear el primero</span>
      {:else}
        <p>No hay empleados activos</p>
        <span>Activa <strong>Ver bajas</strong> para verlos todos</span>
      {/if}
    </div>

  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Estado</th>
            <th class="th-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleEmployees as emp (emp.id)}
            <tr class:row-inactive={!emp.active}>
              <td class="td-name">{emp.name}</td>
              <td class="td-role">{formatRole(emp.role)}</td>
              <td>
                <span class="status-dot" class:active={emp.active}></span>
                <span class="status-text">{emp.active ? 'Activo' : 'Baja'}</span>
              </td>
              <td class="td-actions">
                <button class="action-btn nfc-btn" on:click={() => handleNfc(emp)} title="Generar tarjeta NFC">
                  📶 NFC
                </button>
                <button class="action-btn edit-btn" on:click={() => openEdit(emp)} title="Editar">
                  ✎
                </button>
                {#if emp.active}
                  <button class="action-btn del-btn" on:click={() => handleDelete(emp)} title="Dar de baja">
                    ✕
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Modal NFC -->
{#if nfcModalData}
  <NfcCardModal
    employeeName={nfcModalData.employeeName}
    payload={nfcModalData.payload}
    jsonString={nfcModalData.jsonString}
    byteSize={nfcModalData.byteSize}
    onClose={() => (nfcModalData = null)}
  />
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  /* ── Header ── */
  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  h2 {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f3f4f6;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .toggle-inactive {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    color: #6b7280;
    cursor: pointer;
    user-select: none;
  }

  .add-btn {
    background: #1d4ed8;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.45rem 0.85rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .add-btn:hover { background: #2563eb; }

  /* ── Formulario ── */
  .form-card {
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #d1d5db;
    margin: 0;
  }

  .form-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .form-row label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: #6b7280;
    flex: 1;
    min-width: 120px;
  }

  .field {
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    color: #e5e7eb;
    font-size: 0.85rem;
    padding: 0.45rem 0.6rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .field:focus { border-color: #3b82f6; }

  select.field option { background: #141414; }

  .form-err {
    font-size: 0.78rem;
    color: #f87171;
    margin: 0;
  }

  .form-btns {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #6b7280;
    border-radius: 7px;
    padding: 0.4rem 0.8rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .btn-cancel:hover { border-color: #3a3a3a; color: #9ca3af; }

  .btn-save {
    background: #1d4ed8;
    border: none;
    color: #fff;
    border-radius: 7px;
    padding: 0.4rem 0.9rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-save:hover:not(:disabled) { background: #2563eb; }
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Empty ── */
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #4b5563;
    gap: 0.25rem;
    font-size: 0.9rem;
    min-height: 180px;
  }
  .empty p { font-size: 1rem; color: #6b7280; margin: 0; }
  .empty strong { color: #9ca3af; }

  /* ── Tabla ── */
  .table-wrap {
    overflow-x: auto;
    border: 1px solid #1f1f1f;
    border-radius: 10px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead { background: #111; }

  th {
    padding: 0.6rem 0.9rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    text-align: left;
    white-space: nowrap;
  }

  .th-actions { text-align: right; }

  td {
    padding: 0.65rem 0.9rem;
    font-size: 0.85rem;
    color: #d1d5db;
    border-top: 1px solid #181818;
    vertical-align: middle;
  }

  tr:hover td { background: #0f0f0f; }

  .row-inactive td { opacity: 0.45; }

  .td-name { font-weight: 500; color: #f3f4f6; }
  .td-role { color: #9ca3af; font-size: 0.8rem; }

  /* ── Status ── */
  td:has(.status-dot) {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #374151;
    flex-shrink: 0;
  }
  .status-dot.active { background: #4ade80; box-shadow: 0 0 4px #4ade80; }

  .status-text { font-size: 0.78rem; color: #6b7280; }

  /* ── Acciones ── */
  .td-actions {
    text-align: right;
    white-space: nowrap;
  }

  .action-btn {
    background: transparent;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    margin-left: 4px;
  }

  .nfc-btn  { color: #60a5fa; }
  .nfc-btn:hover  { background: rgba(96, 165, 250, 0.08); border-color: #3b82f6; }

  .edit-btn { color: #9ca3af; }
  .edit-btn:hover { background: #181818; border-color: #3a3a3a; }

  .del-btn  { color: #f87171; }
  .del-btn:hover  { background: rgba(248, 113, 113, 0.08); border-color: #ef4444; }
</style>
