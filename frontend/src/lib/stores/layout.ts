// Layout Store - Control de layout global
import { writable } from 'svelte/store';

interface LayoutState {
  hideGlobalHeader: boolean;
  hideGlobalSidebar: boolean;
}

const defaultState: LayoutState = {
  hideGlobalHeader: false,
  hideGlobalSidebar: false
};

export const layoutState = writable<LayoutState>(defaultState);

// Helper para ocultar header global (usado por páginas como menu-generator)
export function setHideGlobalHeader(hide: boolean) {
  layoutState.update(state => ({ ...state, hideGlobalHeader: hide }));
}

// Helper para ocultar sidebar global
export function setHideGlobalSidebar(hide: boolean) {
  layoutState.update(state => ({ ...state, hideGlobalSidebar: hide }));
}

// Reset a valores por defecto
export function resetLayout() {
  layoutState.set(defaultState);
}
