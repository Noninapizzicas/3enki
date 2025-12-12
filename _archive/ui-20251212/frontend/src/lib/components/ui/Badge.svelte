<script lang="ts">
  export let variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' = 'default';
  export let size: 'sm' | 'md' = 'md';

  const variantClasses = {
    default: 'bg-bg-hover text-text-muted',
    primary: 'bg-primary/20 text-primary',
    success: 'bg-success/20 text-success',
    warning: 'bg-warning/20 text-warning',
    danger: 'bg-danger/20 text-danger',
    info: 'bg-info/20 text-info'
  };

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm'
  };
</script>

<span class="inline-flex items-center rounded-full font-medium {variantClasses[variant]} {sizeClasses[size]}">
  <slot />
</span>
