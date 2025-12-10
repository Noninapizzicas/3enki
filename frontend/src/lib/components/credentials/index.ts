// credential-manager UI components (uisis = UI System compliant)
// Triple interaction: tap (select) / double tap (add) / long press (config)

/** @deprecated Use CredentialButton instead */
export { default as CredentialSelector } from './CredentialSelector.svelte';

// New components (UI-SYSTEM-PLAN.md compliant)
export { default as CredentialButton } from './uisis-CredentialButton.svelte';
export { default as CredentialAddPanel } from './uisis-CredentialAddPanel.svelte';
export { default as CredentialConfigPanel } from './uisis-CredentialConfigPanel.svelte';

// Re-export types
export type { Credential } from './uisis-CredentialConfigPanel.svelte';
