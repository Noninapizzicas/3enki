// credential-manager UI components
// Triple interaction: tap (select) / double tap (add) / long press (config)

/** @deprecated Use CredentialButton instead */
export { default as CredentialSelector } from './CredentialSelector.svelte';

// New components (UI-SYSTEM-PLAN.md compliant)
export { default as CredentialButton } from './CredentialButton.svelte';
export { default as CredentialAddPanel } from './CredentialAddPanel.svelte';
export { default as CredentialConfigPanel } from './CredentialConfigPanel.svelte';

// Re-export types
export type { Credential } from './CredentialConfigPanel.svelte';
