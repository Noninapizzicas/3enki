/**
 * UI Store - Estado de la interfaz
 *
 * Gestiona:
 * - Panel activo (re-exportado del registry)
 * - WorkBar expandida/colapsada
 * - Notificaciones
 * - Persistencia automática
 */

import { writable, derived } from 'svelte/store';
import {
  activePanel as lazyActivePanel,
  openPanel as lazyOpenPanel,
  closePanel as lazyClosePanel
} from '$lib/ui-core/lazy-registry';
import { saveUI, getState } from './persistence';
import { generateUUID } from '$lib/utils';

// ============================================================================
// PANEL ACTIVO (delegado al lazy-registry — fuente única de verdad)
// ============================================================================

export const activePanel = lazyActivePanel;

export function openPanel(panelId: string): void {
  lazyOpenPanel(panelId);
}

export function closePanel(): void {
  lazyClosePanel();
}

export const isPanelOpen = derived(activePanel, ($panel) => $panel !== null);

// ============================================================================
// WORK BAR
// ============================================================================

// Inicializar desde persistencia
const persistedUI = getState().ui;
export const workBarExpanded = writable<boolean>(persistedUI.workBarExpanded);

export function toggleWorkBar(): void {
  workBarExpanded.update(v => {
    const newValue = !v;
    saveUI({ workBarExpanded: newValue });
    return newValue;
  });
}

export function expandWorkBar(): void {
  workBarExpanded.set(true);
  saveUI({ workBarExpanded: true });
}

export function collapseWorkBar(): void {
  workBarExpanded.set(false);
  saveUI({ workBarExpanded: false });
}

// ============================================================================
// NOTIFICACIONES
// ============================================================================

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export const notifications = writable<Notification[]>([]);

// Derived: contador de notificaciones
export const notificationCount = derived(notifications, ($notifications) => $notifications.length);

export function addNotification(type: Notification['type'], message: string): void {
  const notification: Notification = {
    id: generateUUID(),
    type,
    message,
    timestamp: new Date().toISOString()
  };

  notifications.update(list => [...list, notification]);

  // Auto-remove después de 5 segundos
  setTimeout(() => {
    removeNotification(notification.id);
  }, 5000);
}

export function removeNotification(id: string): void {
  notifications.update(list => list.filter(n => n.id !== id));
}

export function clearNotifications(): void {
  notifications.set([]);
}

// Helpers
export function notifySuccess(message: string): void {
  addNotification('success', message);
}

export function notifyError(message: string): void {
  addNotification('error', message);
}

export function notifyWarning(message: string): void {
  addNotification('warning', message);
}

export function notifyInfo(message: string): void {
  addNotification('info', message);
}
