/**
 * Cocina Store — Estado y operaciones MQTT para pantalla de cocina
 *
 * Backend: modules/pizzepos/cocina (uiHandler domain: 'cocina')
 *
 * Operaciones: list-active, get, history, prepare-item, mark-ready, metrics, health
 * Eventos RT: pedido.enviado_cocina, cocina.item_preparado, cocina.pedido_listo, pedido.cancelado
 *
 * Diseño: optimistic updates + sonido en nuevo pedido
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';
import { onReconnect } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export type EstadoItem = 'pendiente' | 'preparando' | 'listo';

export interface PizzaHalf {
  nombre: string;
  emoji?: string;
  precio?: number;
  ingredientes_base?: string[];
}

export interface IngredienteAlGusto {
  id?: string;
  nombre: string;
  emoji?: string;
  precio_extra?: number;
  tipo?: string;
}

export interface ItemCocina {
  item_id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  variaciones?: any;
  notas?: string;
  estado: EstadoItem;
  tipo?: 'mitad_mitad' | 'al_gusto' | string;
  pizza_izquierda?: string | PizzaHalf;
  pizza_derecha?: string | PizzaHalf;
  ingredientes?: Array<string | IngredienteAlGusto>;
  ingredientes_base?: string[];
  preparando_at?: string;
  preparado_at?: string;
  // Multi-dispositivo
  device_id?: string;
  device_color?: string;
  device_nombre?: string;
  // Sistema de pases: 0=general, 1=horno, 2=listo
  pase: number;
}

export interface GlovoMetadata {
  glovo_order_id?: string;
  cliente_nombre?: string;
  direccion_entrega?: string;
  requiere_confirmacion?: boolean;
  tiempo_estimado_entrega?: number;
  total?: number;
}

export interface PedidoCocina {
  pedido_id: string;
  cuenta_id: string;
  nombre_cuenta: string | null;
  canal: string | null;
  items: ItemCocina[];
  estado: 'activo' | 'listo' | 'cancelado';
  notas_generales: string;
  recibido_at: string;
  listo_at?: string;
  tiempo_preparacion?: number;
  metadata?: GlovoMetadata | null;
}

export interface CocinaMetrics {
  pedidos_activos: number;
  items_pendientes: number;
  items_preparando: number;
  historial_count: number;
  tiempo_promedio_preparacion: number;
}

export interface TipoEstacionInfo {
  id: string;
  nombre: string;
  descripcion: string;
  pase_minimo: number;
  comportamientos: {
    imprime_al_completar: boolean;
    auto_preparar: boolean;
  };
}

export interface ImpresoraConfig {
  esp32_device_id: string;  // ID del ESP32 bridge BLE (ej: "cocina-1")
  destino?: string;         // Nombre lógico en perifericos registry (ej: "cocina")
}

export interface ImpresoraDisponible {
  nombre: string;
  tipo: string;
  estado: string;
  conectado: boolean;
  transporte_tipo: string;
  metadata: Record<string, any>;
}

export interface CocinaDevice {
  device_id: string;
  nombre: string;
  estacion: string | null;
  color: string;
  filtros: { familias: string[] };
  tipo_estacion: string;
  impresora: ImpresoraConfig | null;
  connected_at: string;
  last_seen: string;
}

export interface CocinaState {
  pedidos: PedidoCocina[];
  loading: boolean;
  error: string | null;
  metrics: CocinaMetrics | null;
  // Multi-dispositivo
  myDeviceId: string | null;
  myColor: string | null;
  myNombre: string | null;
  myEstacion: string | null;
  filtrosActivos: string[]; // familias/categorías activas (vacío = todo)
  tipoEstacion: string; // tipo de estación: 'general', 'horno', 'montaje', etc.
  tipoEstacionInfo: TipoEstacionInfo | null; // info completa del tipo seleccionado
  tiposDisponibles: TipoEstacionInfo[]; // tipos cargados del backend
  impresora: ImpresoraConfig | null; // impresora asignada a este dispositivo
  devices: CocinaDevice[];
}

// =============================================================================
// COLORS — Paleta cocina (dark, high contrast)
// =============================================================================

export const ESTADO_ITEM_COLORS: Record<EstadoItem, string> = {
  pendiente: '#94a3b8',  // slate-400
  preparando: '#eab308', // yellow-500
  listo: '#22c55e'       // green-500
};

export const CANAL_LABELS: Record<string, string> = {
  mesa: 'MESA',
  telefono: 'TEL',
  llevar: 'LLEVAR',
  glovo: 'GLOVO',
  whatsapp: 'WHATSAPP'
};

// =============================================================================
// STORE
// =============================================================================

// Genera un device ID persistente en localStorage
function getOrCreateDeviceId(): string {
  const KEY = 'cocina_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// Persistencia de config del device en localStorage
// Sobrevive a reinicios del servidor y reconexiones MQTT
const DEVICE_CONFIG_KEY = 'cocina_device_config';

interface DeviceConfig {
  nombre?: string;
  estacion?: string;
  tipoEstacion?: string;
  filtrosActivos?: string[];
}

function saveDeviceConfig(config: Partial<DeviceConfig>): void {
  try {
    const existing = loadDeviceConfig();
    const merged = { ...existing, ...config };
    localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(merged));
  } catch {}
}

function loadDeviceConfig(): DeviceConfig {
  try {
    const raw = localStorage.getItem(DEVICE_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

// Cargar config persistida para inicializar el store con valores previos
const _savedConfig = loadDeviceConfig();

export const cocinaStore = writable<CocinaState>({
  pedidos: [],
  loading: false,
  error: null,
  metrics: null,
  myDeviceId: null,
  myColor: null,
  myNombre: _savedConfig.nombre || null,
  myEstacion: _savedConfig.estacion || null,
  filtrosActivos: _savedConfig.filtrosActivos || [],
  tipoEstacion: _savedConfig.tipoEstacion || 'general',
  tipoEstacionInfo: null,
  tiposDisponibles: [],
  impresora: null,
  devices: []
});

// Glovo: Set de cuenta_ids ya confirmados (aceptados en Glovo API)
const glovoConfirmados = new Set<string>();

// Derivados
export const pedidosCocina = derived(cocinaStore, $s => $s.pedidos);
export const cocinaLoading = derived(cocinaStore, $s => $s.loading);
export const cocinaError = derived(cocinaStore, $s => $s.error);
export const cocinaMetrics = derived(cocinaStore, $s => $s.metrics);
export const pedidosCount = derived(cocinaStore, $s => $s.pedidos.length);
export const myDeviceColor = derived(cocinaStore, $s => $s.myColor);
export const myDeviceNombre = derived(cocinaStore, $s => $s.myNombre);
export const myEstacion = derived(cocinaStore, $s => $s.myEstacion);
export const filtrosActivos = derived(cocinaStore, $s => $s.filtrosActivos);
export const tipoEstacion = derived(cocinaStore, $s => $s.tipoEstacion);
export const tipoEstacionInfo = derived(cocinaStore, $s => $s.tipoEstacionInfo);
export const tiposDisponibles = derived(cocinaStore, $s => $s.tiposDisponibles);
export const cocinaDevices = derived(cocinaStore, $s => $s.devices);
export const myImpresora = derived(cocinaStore, $s => $s.impresora);

export const itemsPendientes = derived(cocinaStore, $s =>
  $s.pedidos.reduce((sum, p) => sum + p.items.filter(i => i.estado === 'pendiente').length, 0)
);

export const itemsPreparando = derived(cocinaStore, $s =>
  $s.pedidos.reduce((sum, p) => sum + p.items.filter(i => i.estado === 'preparando').length, 0)
);

/** Comprobar si un pedido Glovo ya fue confirmado */
export function isGlovoConfirmado(cuentaId: string): boolean {
  return glovoConfirmados.has(cuentaId);
}

// =============================================================================
// OPERATIONS
// =============================================================================

export async function loadPedidosActivos(): Promise<void> {
  cocinaStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await mqttRequest<any>('cocina', 'list-active', {});
    const data = res?.data?.pedidos ? res.data : res?.data?.data;
    const pedidos = data?.pedidos || [];
    const devices = data?.devices || [];

    cocinaStore.update(s => ({
      ...s,
      pedidos,
      devices,
      loading: false
    }));
  } catch (err: any) {
    cocinaStore.update(s => ({
      ...s,
      loading: false,
      error: err.message || 'Error al cargar pedidos'
    }));
  }
}

export async function loadMetrics(): Promise<void> {
  try {
    const res = await mqttRequest<any>('cocina', 'metrics', {});
    const metrics = res?.data?.pedidos_activos !== undefined ? res.data : res?.data?.data;

    if (metrics) {
      cocinaStore.update(s => ({ ...s, metrics }));
    }
  } catch {
    // Non-critical
  }
}

/**
 * Tap toggle: pendiente → preparando → listo
 * Optimistic update: UI cambia al instante, revierte si falla
 */
export async function prepararItem(itemId: string): Promise<boolean> {
  const state = get(cocinaStore);

  // Encontrar item para optimistic update
  let pedidoIdx = -1;
  let itemIdx = -1;
  let estadoAnterior: EstadoItem = 'pendiente';
  let paseAnterior = 0;

  for (let pi = 0; pi < state.pedidos.length; pi++) {
    const ii = state.pedidos[pi].items.findIndex(i => i.item_id === itemId);
    if (ii !== -1) {
      pedidoIdx = pi;
      itemIdx = ii;
      estadoAnterior = state.pedidos[pi].items[ii].estado;
      paseAnterior = state.pedidos[pi].items[ii].pase ?? 0;
      break;
    }
  }

  if (pedidoIdx === -1 || estadoAnterior === 'listo') return false;

  // Optimistic: siguiente estado
  // pendiente → preparando (mismo pase)
  // preparando → pase++ (el backend decidirá el estado final)
  const nuevoEstado: EstadoItem = estadoAnterior === 'pendiente' ? 'preparando' : 'listo';
  const nuevoPase = estadoAnterior === 'preparando' ? paseAnterior + 1 : paseAnterior;

  cocinaStore.update(s => {
    const pedidos = [...s.pedidos];
    const pedido = { ...pedidos[pedidoIdx], items: [...pedidos[pedidoIdx].items] };
    pedido.items[itemIdx] = { ...pedido.items[itemIdx], estado: nuevoEstado, pase: nuevoPase };
    pedidos[pedidoIdx] = pedido;
    return { ...s, pedidos };
  });

  try {
    const state2 = get(cocinaStore);
    const payload: any = { item_id: itemId };
    if (state2.myDeviceId) payload.device_id = state2.myDeviceId;
    await mqttRequest<any>('cocina', 'prepare-item', payload);
    return true;
  } catch {
    // Revert optimistic update
    cocinaStore.update(s => {
      const pedidos = [...s.pedidos];
      if (pedidos[pedidoIdx]) {
        const pedido = { ...pedidos[pedidoIdx], items: [...pedidos[pedidoIdx].items] };
        pedido.items[itemIdx] = { ...pedido.items[itemIdx], estado: estadoAnterior };
        pedidos[pedidoIdx] = pedido;
      }
      return { ...s, pedidos };
    });
    return false;
  }
}

/**
 * Marca todos los items de un pedido como listo de golpe
 */
export async function marcarListo(pedidoId: string): Promise<boolean> {
  // Optimistic: marcar todos listo
  cocinaStore.update(s => ({
    ...s,
    pedidos: s.pedidos.map(p =>
      p.pedido_id === pedidoId
        ? { ...p, items: p.items.map(i => ({ ...i, estado: 'listo' as EstadoItem })) }
        : p
    )
  }));

  try {
    await mqttRequest<any>('cocina', 'mark-ready', { pedido_id: pedidoId });
    return true;
  } catch {
    // Recargar estado real
    await loadPedidosActivos();
    return false;
  }
}

// =============================================================================
// DEVICE REGISTRATION & FILTERS
// =============================================================================

/**
 * Registra este dispositivo en el backend de cocina.
 * Asigna color único, persiste device_id en localStorage.
 */
export async function registerDevice(nombre?: string): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();

  try {
    const state = get(cocinaStore);
    // Enviar config completa: valores del store (que ya incluyen los persistidos de localStorage)
    const res = await mqttRequest<any>('cocina', 'register-device', {
      device_id: deviceId,
      nombre: nombre || state.myNombre || undefined,
      estacion: state.myEstacion || undefined,
      filtros: state.filtrosActivos.length > 0 ? { familias: state.filtrosActivos } : undefined,
      tipo_estacion: state.tipoEstacion || 'general',
      impresora: state.impresora || undefined
    });

    const data = res?.data?.color ? res.data : res?.data?.data;
    if (data) {
      cocinaStore.update(s => ({
        ...s,
        myDeviceId: deviceId,
        myColor: data.color,
        myNombre: data.nombre,
        myEstacion: data.estacion || s.myEstacion,
        tipoEstacion: data.tipo_estacion || s.tipoEstacion,
        tipoEstacionInfo: data.tipo_estacion_info || s.tipoEstacionInfo,
        impresora: data.impresora !== undefined ? data.impresora : s.impresora,
        devices: data.devices || s.devices
      }));
      // Persistir lo que el backend devolvió (incluye nombre asignado si era nuevo)
      saveDeviceConfig({
        nombre: data.nombre || nombre || state.myNombre || undefined,
        estacion: data.estacion || state.myEstacion || undefined,
        tipoEstacion: data.tipo_estacion || state.tipoEstacion || 'general',
        filtrosActivos: state.filtrosActivos
      });
    }
    return true;
  } catch {
    // Registro falló, seguir sin color
    cocinaStore.update(s => ({ ...s, myDeviceId: deviceId }));
    return false;
  }
}

/**
 * Toggle de filtro por familia/categoría.
 * Vacío = ver todo. Con filtros = solo items de esas familias.
 * El filtrado es client-side, todos los pedidos llegan completos.
 */
export function toggleFiltro(familia: string): void {
  cocinaStore.update(s => {
    const activos = s.filtrosActivos.includes(familia)
      ? s.filtrosActivos.filter(f => f !== familia)
      : [...s.filtrosActivos, familia];
    return { ...s, filtrosActivos: activos };
  });

  // Persistir y sincronizar filtros con backend
  const state = get(cocinaStore);
  saveDeviceConfig({ filtrosActivos: state.filtrosActivos });
  if (state.myDeviceId) {
    mqttRequest('cocina', 'register-device', {
      device_id: state.myDeviceId,
      filtros: { familias: state.filtrosActivos }
    }).catch(() => {});
  }
}

/** Limpia todos los filtros (ver todo) */
export function clearFiltros(): void {
  cocinaStore.update(s => ({ ...s, filtrosActivos: [] }));
  saveDeviceConfig({ filtrosActivos: [] });

  const state = get(cocinaStore);
  if (state.myDeviceId) {
    mqttRequest('cocina', 'register-device', {
      device_id: state.myDeviceId,
      filtros: { familias: [] }
    }).catch(() => {});
  }
}

/**
 * Establece filtros de golpe (reemplaza todos los activos).
 * Usado por el panel de configuración.
 */
export function setFiltros(familias: string[]): void {
  cocinaStore.update(s => ({ ...s, filtrosActivos: familias }));
  saveDeviceConfig({ filtrosActivos: familias });

  const state = get(cocinaStore);
  if (state.myDeviceId) {
    mqttRequest('cocina', 'register-device', {
      device_id: state.myDeviceId,
      filtros: { familias }
    }).catch(() => {});
  }
}

/**
 * Actualiza el nombre del dispositivo (persiste en backend).
 */
export async function updateDeviceName(nombre: string): Promise<boolean> {
  const state = get(cocinaStore);
  if (!state.myDeviceId) return false;

  cocinaStore.update(s => ({ ...s, myNombre: nombre }));
  saveDeviceConfig({ nombre });

  try {
    await mqttRequest('cocina', 'register-device', {
      device_id: state.myDeviceId,
      nombre,
      estacion: state.myEstacion || undefined,
      filtros: { familias: state.filtrosActivos },
      tipo_estacion: state.tipoEstacion || 'general'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Establece el nombre de estación del dispositivo.
 */
export async function updateEstacion(estacion: string): Promise<boolean> {
  const state = get(cocinaStore);
  if (!state.myDeviceId) return false;

  cocinaStore.update(s => ({ ...s, myEstacion: estacion }));
  saveDeviceConfig({ estacion });

  try {
    await mqttRequest('cocina', 'register-device', {
      device_id: state.myDeviceId,
      estacion,
      filtros: { familias: state.filtrosActivos },
      tipo_estacion: state.tipoEstacion || 'general'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Establece el tipo de estación del dispositivo.
 * El tipo determina los comportamientos (imprime_al_completar, etc.).
 */
export async function setTipoEstacion(tipo: string): Promise<boolean> {
  const state = get(cocinaStore);
  const tipoInfo = state.tiposDisponibles.find(t => t.id === tipo) || null;

  cocinaStore.update(s => ({ ...s, tipoEstacion: tipo, tipoEstacionInfo: tipoInfo }));
  saveDeviceConfig({ tipoEstacion: tipo });

  if (state.myDeviceId) {
    try {
      await mqttRequest('cocina', 'register-device', {
        device_id: state.myDeviceId,
        tipo_estacion: tipo,
        filtros: { familias: state.filtrosActivos }
      });
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Establece la impresora asignada a este dispositivo.
 * Se persiste en localStorage y se envía al backend en el registro.
 */
export async function setImpresora(impresora: ImpresoraConfig | null): Promise<boolean> {
  cocinaStore.update(s => ({ ...s, impresora }));

  // Persistir en localStorage
  const IMPRESORA_KEY = 'cocina_impresora';
  try {
    if (impresora) {
      localStorage.setItem(IMPRESORA_KEY, JSON.stringify(impresora));
    } else {
      localStorage.removeItem(IMPRESORA_KEY);
    }
  } catch {}

  // Enviar al backend
  const state = get(cocinaStore);
  if (state.myDeviceId) {
    try {
      await mqttRequest('cocina', 'register-device', {
        device_id: state.myDeviceId,
        impresora
      });
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Carga la impresora desde localStorage al iniciar.
 */
function loadImpresoraFromStorage(): ImpresoraConfig | null {
  try {
    const raw = localStorage.getItem('cocina_impresora');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/**
 * Carga las impresoras disponibles del registry de periféricos.
 * Consulta por capacidad 'imprimir'.
 */
export async function loadImpresorasDisponibles(): Promise<ImpresoraDisponible[]> {
  try {
    const res = await mqttRequest<any>('perifericos', 'listar-por-capacidad', {
      capacidad: 'imprimir'
    }, { timeout: 5000 });
    return res?.data?.dispositivos || [];
  } catch {
    return [];
  }
}

/**
 * Carga los tipos de estación disponibles desde el backend.
 */
export async function loadTiposEstacion(): Promise<void> {
  try {
    const res = await mqttRequest<any>('cocina', 'list-station-types', {});
    const tipos = res?.data?.tipos || res?.data?.data?.tipos || [];
    if (tipos.length > 0) {
      cocinaStore.update(s => ({ ...s, tiposDisponibles: tipos }));
    }
  } catch {
    // Non-critical
  }
}

/**
 * Comprueba si un item pasa el filtro activo del dispositivo.
 * Si no hay filtros activos, pasa todo.
 * Usa el campo `categoria` del item si existe, o intenta inferir de la metadata.
 */
export function itemPassesFilter(item: ItemCocina, filtros: string[]): boolean {
  if (filtros.length === 0) return true;
  // El item puede tener categoria directa (añadida por el comandero)
  const cat = (item as any).categoria || (item as any).familia || '';
  if (!cat) return true; // Sin categoría = siempre visible (no filtrable)
  return filtros.includes(cat);
}

/**
 * Filtra items por pase acumulativo.
 * El pase es un contador del item que se incrementa cada vez que pasa por una estación.
 * Cada estación define pase_minimo: el pase que debe tener el item para mostrarse ahí.
 * general (pase_minimo=0) ve items con pase=0
 * horno (pase_minimo=1) ve items con pase=1
 * Un futuro emplatado (pase_minimo=2) vería items con pase=2, etc.
 */
export function itemMatchesStation(item: ItemCocina, tipoEstacion: string, tipoInfo?: TipoEstacionInfo | null): boolean {
  const paseItem = item.pase ?? 0;
  const paseMinimo = tipoInfo?.pase_minimo ?? 0;
  return paseItem === paseMinimo;
}

// =============================================================================
// GLOVO OPERATIONS
// =============================================================================

/**
 * Confirmar pedido Glovo — acepta en Glovo API y permite preparación
 */
export async function confirmarGlovo(cuentaId: string, tiempoEstimado?: number): Promise<boolean> {
  try {
    await mqttRequest<any>('glovo', 'aceptar', {
      cuenta_id: cuentaId,
      tiempo_preparacion_estimado: tiempoEstimado || 25
    });
    glovoConfirmados.add(cuentaId);
    // Forzar re-render actualizando pedidos
    cocinaStore.update(s => ({ ...s, pedidos: [...s.pedidos] }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Rechazar pedido Glovo — rechaza en Glovo API y quita de cocina
 */
export async function rechazarGlovo(cuentaId: string, motivo: string): Promise<boolean> {
  try {
    await mqttRequest<any>('glovo', 'rechazar', {
      cuenta_id: cuentaId,
      motivo
    });
    // Quitar de la cola de cocina
    cocinaStore.update(s => ({
      ...s,
      pedidos: s.pedidos.filter(p => p.cuenta_id !== cuentaId)
    }));
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// NOTIFICATIONS — Web Notification API para pedidos en background
// =============================================================================

let notificationsPermission: NotificationPermission = 'default';

/**
 * Solicita permiso de notificaciones al usuario.
 * Llamar tras gesto de usuario (click/tap).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  try {
    notificationsPermission = await Notification.requestPermission();
    return notificationsPermission === 'granted';
  } catch {
    return false;
  }
}

function sendNotification(title: string, body: string, tag?: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Solo notificar si la pestaña NO está visible (en background)
  if (document.visibilityState === 'visible') return;

  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.png',
      tag: tag || 'cocina-pedido',
      renotify: true,
      vibrate: [200, 100, 200, 100, 300]
    });
    // Auto-cerrar después de 10s
    setTimeout(() => n.close(), 10000);
    // Click en la notificación = enfocar la pestaña
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Notifications not supported in this context
  }
}

/**
 * Vibrar el dispositivo (móvil) — patrón corto de alerta
 */
function vibrateDevice(pattern: number[] = [200, 100, 200]) {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration not available
  }
}

// =============================================================================
// SOUND — Campana de cocina (triple ding ascendente, audible en ambiente ruidoso)
// =============================================================================

let audioCtx: AudioContext | null = null;

/**
 * Desbloquea AudioContext (requiere gesto de usuario en navegadores modernos).
 * Llamar una vez en el primer click/tap de la pantalla.
 */
export function resumeAudioContext() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    // Audio not available
  }
}

function bellTone(startTime: number, freq: number, vol: number, dur: number) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  osc.type = 'triangle';
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
  osc.start(startTime);
  osc.stop(startTime + dur);
}

function playNewOrderSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;

    // Ding 1 — fundamental + overtone
    bellTone(t, 1200, 0.5, 0.35);
    bellTone(t, 2400, 0.2, 0.25);

    // Ding 2 — más alto (150ms después)
    bellTone(t + 0.15, 1500, 0.5, 0.35);
    bellTone(t + 0.15, 3000, 0.2, 0.25);

    // Ding 3 — aún más alto (300ms después)
    bellTone(t + 0.30, 1800, 0.45, 0.4);
    bellTone(t + 0.30, 3600, 0.15, 0.3);
  } catch {
    // Audio not available
  }
}

/**
 * Alarma Glovo — más grave, más larga, doble secuencia
 * Distinguible del bell normal en ambiente ruidoso de cocina
 */
function playGlovoAlertSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;

    // Secuencia 1: tono grave de alerta (800Hz base)
    bellTone(t, 800, 0.6, 0.3);
    bellTone(t, 1600, 0.3, 0.2);
    bellTone(t + 0.12, 1000, 0.6, 0.3);
    bellTone(t + 0.12, 2000, 0.3, 0.2);
    bellTone(t + 0.24, 1200, 0.5, 0.35);
    bellTone(t + 0.24, 2400, 0.25, 0.25);

    // Pausa breve, luego secuencia 2 (repetir para urgencia)
    bellTone(t + 0.6, 800, 0.6, 0.3);
    bellTone(t + 0.6, 1600, 0.3, 0.2);
    bellTone(t + 0.72, 1000, 0.6, 0.3);
    bellTone(t + 0.72, 2000, 0.3, 0.2);
    bellTone(t + 0.84, 1200, 0.5, 0.35);
    bellTone(t + 0.84, 2400, 0.25, 0.25);
  } catch {
    // Audio not available
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extrae referencia legible del cuenta_id
 * mesa_5_20260225_001 → "MESA 5"
 * tel_20260225_001 → "TEL #1"
 */
export function extractRef(cuentaId: string, nombreCuenta?: string | null): string {
  if (!cuentaId) return '???';

  // Si hay nombre de cliente, usarlo como referencia principal
  // con el tipo como sufijo: "JUAN (LLEVAR #5)"
  let tipoRef = '';

  if (cuentaId.startsWith('mesa_')) {
    const parts = cuentaId.split('_');
    tipoRef = `MESA ${parts[1]}`;
  } else if (cuentaId.startsWith('tel_')) {
    const parts = cuentaId.split('_');
    tipoRef = `TEL #${parseInt(parts[2]) || parts[2]}`;
  } else if (cuentaId.startsWith('llevar_')) {
    const parts = cuentaId.split('_');
    tipoRef = `LLEVAR #${parseInt(parts[2]) || parts[2]}`;
  } else if (cuentaId.startsWith('glovo_')) {
    const parts = cuentaId.split('_');
    tipoRef = `GLOVO #${parseInt(parts[2]) || parts[2]}`;
  } else if (cuentaId.startsWith('wa_')) {
    const parts = cuentaId.split('_');
    tipoRef = `WA #${parseInt(parts[2]) || parts[2]}`;
  } else {
    tipoRef = cuentaId.substring(0, 8).toUpperCase();
  }

  if (nombreCuenta && nombreCuenta !== tipoRef) {
    return `${nombreCuenta.toUpperCase()} · ${tipoRef}`;
  }

  return tipoRef;
}

/**
 * Calcula tiempo transcurrido en formato MM:SS
 */
export function elapsed(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

export function initCocinaSubscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  // pedido.enviado_cocina → nuevo pedido llega
  cleanups.push(
    mqttSubscribe('pedido.enviado_cocina', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.pedido_id) return;

      const isGlovo = data.canal === 'glovo';

      const pedidoCocina: PedidoCocina = {
        pedido_id: data.pedido_id,
        cuenta_id: data.cuenta_id,
        canal: data.canal || null,
        items: (data.items || []).map((item: any) => ({
          ...item,
          estado: 'pendiente' as EstadoItem
        })),
        estado: 'activo',
        notas_generales: data.notas_generales || '',
        recibido_at: data.recibido_at || new Date().toISOString(),
        metadata: isGlovo ? (data.metadata || null) : null
      };

      cocinaStore.update(s => {
        // Evitar duplicados
        if (s.pedidos.some(p => p.pedido_id === data.pedido_id)) return s;
        return { ...s, pedidos: [...s.pedidos, pedidoCocina] };
      });

      // Sonido diferenciado: Glovo = alarma doble grave, resto = campana triple
      if (isGlovo) {
        playGlovoAlertSound();
        sendNotification('GLOVO', `Nuevo pedido Glovo${data.metadata?.cliente_nombre ? ` — ${data.metadata.cliente_nombre}` : ''}`, `glovo-${data.pedido_id}`);
        vibrateDevice([200, 100, 200, 100, 300]);
      } else {
        playNewOrderSound();
        const ref = data.cuenta_id ? extractRef(data.cuenta_id) : 'Nuevo pedido';
        sendNotification('COCINA', `${ref} — ${(data.items || []).length} items`, `pedido-${data.pedido_id}`);
        vibrateDevice([200, 100, 200]);
      }
    })
  );

  // cocina.item_preparando → item empieza a prepararse (sync multi-pantalla + device color)
  cleanups.push(
    mqttSubscribe('cocina.item_preparando', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.item_id) return;

      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.map(p =>
          p.pedido_id === data.pedido_id
            ? {
              ...p,
              items: p.items.map(i =>
                i.item_id === data.item_id
                  ? {
                    ...i,
                    estado: 'preparando' as EstadoItem,
                    pase: data.pase ?? i.pase,
                    preparando_at: data.preparando_at,
                    device_id: data.device_id || i.device_id,
                    device_color: data.device_color || i.device_color,
                    device_nombre: data.device_nombre || i.device_nombre
                  }
                  : i
              )
            }
            : p
        )
      }));
    })
  );

  // cocina.item_preparado → item marcado listo (sync multi-pantalla + device color)
  cleanups.push(
    mqttSubscribe('cocina.item_preparado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.item_id) return;

      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.map(p =>
          p.pedido_id === data.pedido_id
            ? {
              ...p,
              items: p.items.map(i =>
                i.item_id === data.item_id
                  ? {
                    ...i,
                    estado: 'listo' as EstadoItem,
                    pase: data.pase ?? i.pase,
                    preparado_at: data.preparado_at,
                    device_id: data.device_id || i.device_id,
                    device_color: data.device_color || i.device_color,
                    device_nombre: data.device_nombre || i.device_nombre
                  }
                  : i
              )
            }
            : p
        )
      }));
    })
  );

  // cocina.item_avanzado → item pasa a siguiente estación (reset a pendiente)
  cleanups.push(
    mqttSubscribe('cocina.item_avanzado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.item_id) return;

      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.map(p =>
          p.pedido_id === data.pedido_id
            ? {
              ...p,
              items: p.items.map(i =>
                i.item_id === data.item_id
                  ? {
                    ...i,
                    estado: (data.estado || 'pendiente') as EstadoItem,
                    pase: data.pase ?? i.pase,
                    device_id: undefined,
                    device_color: undefined,
                    device_nombre: undefined,
                    preparando_at: data.preparando_at || undefined
                  }
                  : i
              )
            }
            : p
        )
      }));
    })
  );

  // cocina.pedido_listo → pedido completado, quitar de pantalla con delay
  cleanups.push(
    mqttSubscribe('cocina.pedido_listo', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.pedido_id) return;

      // Marcar como listo visualmente
      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.map(p =>
          p.pedido_id === data.pedido_id
            ? { ...p, estado: 'listo', listo_at: data.listo_at, tiempo_preparacion: data.tiempo_preparacion }
            : p
        )
      }));

      // Remover después de 3s (fade out en CSS)
      setTimeout(() => {
        cocinaStore.update(s => ({
          ...s,
          pedidos: s.pedidos.filter(p => p.pedido_id !== data.pedido_id)
        }));
      }, 3000);
    })
  );

  // pedido.cancelado → quitar inmediatamente
  cleanups.push(
    mqttSubscribe('pedido.cancelado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.pedido_id) return;

      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.filter(p => p.pedido_id !== data.pedido_id)
      }));
    })
  );

  // glovo.pedido_aceptado → marcar como confirmado (sync multi-pantalla)
  cleanups.push(
    mqttSubscribe('glovo.pedido_aceptado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      glovoConfirmados.add(data.cuenta_id);
      // Forzar re-render
      cocinaStore.update(s => ({ ...s, pedidos: [...s.pedidos] }));
    })
  );

  // glovo.pedido_rechazado → quitar de cola cocina (sync multi-pantalla)
  cleanups.push(
    mqttSubscribe('glovo.pedido_rechazado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.filter(p => p.cuenta_id !== data.cuenta_id)
      }));
    })
  );

  // cocina.device_registered / cocina.device_updated → sync device list
  cleanups.push(
    mqttSubscribe('cocina.device_registered', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.device_id) return;
      // Reload devices list
      loadPedidosActivos();
    })
  );
  cleanups.push(
    mqttSubscribe('cocina.device_unregistered', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.device_id) return;
      cocinaStore.update(s => ({
        ...s,
        devices: s.devices.filter(d => d.device_id !== data.device_id)
      }));
    })
  );

  // Recargar datos completos cuando MQTT reconecta (tras pérdida de conexión)
  const unsubReconnect = onReconnect(() => {
    console.log('[Cocina] MQTT reconnected — reloading pedidos and metrics');
    loadPedidosActivos();
    loadMetrics();
    registerDevice(); // Re-register device
  });
  cleanups.push(unsubReconnect);

  // Recargar cuando la pestaña vuelve a ser visible (usuario vuelve del background)
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      console.log('[Cocina] Tab visible — recargando pedidos');
      loadPedidosActivos();
      loadMetrics();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Cargar impresora desde localStorage antes de registrar
  const savedImpresora = loadImpresoraFromStorage();
  if (savedImpresora) {
    cocinaStore.update(s => ({ ...s, impresora: savedImpresora }));
  }

  // Carga inicial + register device + tipos estación
  loadPedidosActivos();
  loadMetrics();
  loadTiposEstacion();
  registerDevice();

  // Refrescar métricas cada 30s
  const metricsInterval = setInterval(loadMetrics, 30000);

  return () => {
    for (const cleanup of cleanups) cleanup();
    clearInterval(metricsInterval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
