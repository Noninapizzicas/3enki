/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // Colores desde auto-ui/config/theme.json
      colors: {
        bg: {
          DEFAULT: '#0f1216',
          card: '#1a1d24',
          hover: '#252a33',
          input: '#0d0f12'
        },
        primary: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb'
        },
        success: {
          DEFAULT: '#22c55e',
          hover: '#16a34a'
        },
        warning: {
          DEFAULT: '#f59e0b',
          hover: '#d97706'
        },
        danger: {
          DEFAULT: '#ef4444',
          hover: '#dc2626'
        },
        info: {
          DEFAULT: '#06b6d4'
        },
        border: {
          DEFAULT: '#374151',
          focus: '#3b82f6'
        },
        text: {
          DEFAULT: '#ffffff',
          muted: '#9ca3af',
          disabled: '#6b7280'
        }
      },
      // Spacing desde theme.json
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px'
      },
      // Border radius desde theme.json
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px'
      },
      // Tipografía desde theme.json
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      fontSize: {
        'xs': '0.75rem',
        'sm': '0.875rem',
        'base': '1rem',
        'lg': '1.25rem',
        'xl': '1.5rem',
        '2xl': '2rem'
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700'
      },
      // Sombras desde theme.json
      boxShadow: {
        'sm': '0 1px 2px rgba(0,0,0,0.3)',
        'md': '0 4px 6px rgba(0,0,0,0.4)',
        'lg': '0 10px 15px rgba(0,0,0,0.5)',
        'xl': '0 20px 25px rgba(0,0,0,0.6)'
      },
      // Transiciones desde theme.json
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '350ms'
      },
      // Z-index desde theme.json
      zIndex: {
        'dropdown': '100',
        'modal': '200',
        'toast': '300',
        'tooltip': '400'
      },
      // Breakpoints personalizados
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px'
      },
      // Anchos específicos para componentes
      width: {
        'sidebar': '280px',
        'sidebar-collapsed': '64px',
        'modal': '500px'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms')
  ]
}
