import { writable, derived } from 'svelte/store';

export type ToastType = 'success' | 'warning' | 'danger' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  dismissible: boolean;
}

// Store
const toasts = writable<Toast[]>([]);

// Derived
export const toastList = derived(toasts, ($toasts) => $toasts);

/**
 * Show a toast notification
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  options: { duration?: number; dismissible?: boolean } = {}
) {
  const { duration = 5000, dismissible = true } = options;

  const toast: Toast = {
    id: `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    message,
    duration,
    dismissible
  };

  toasts.update(t => [...t, toast]);

  // Auto dismiss
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(toast.id);
    }, duration);
  }

  return toast.id;
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(id: string) {
  toasts.update(t => t.filter(toast => toast.id !== id));
}

/**
 * Dismiss all toasts
 */
export function dismissAllToasts() {
  toasts.set([]);
}

// Convenience methods
export const toast = {
  success: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
    showToast(message, 'success', options),
  warning: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
    showToast(message, 'warning', options),
  danger: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
    showToast(message, 'danger', options),
  error: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
    showToast(message, 'danger', options),
  info: (message: string, options?: { duration?: number; dismissible?: boolean }) =>
    showToast(message, 'info', options)
};
