/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        "./src/**/*.{html,ts}",
    ],
    future: {
        hoverOnlyWhenSupported: true,
    },
    theme: {
        extend: {
            colors: {
                // Semantic Colors (mapped to CSS Variables)
                brand: {
                    primary: 'rgb(var(--color-primary) / <alpha-value>)',
                    secondary: 'rgb(var(--color-secondary) / <alpha-value>)',

                    // Backgrounds
                    light: 'rgb(var(--color-bg) / <alpha-value>)', // Page BG
                    surface: 'rgb(var(--color-surface) / <alpha-value>)', // Card/Sidebar BG

                    // Specific Tokens from User Map
                    'aqua-island': '#9bdad9',
                    'teal-blue': '#00839b',
                    'peacock-blue': '#006e96',
                    'deep-sapphire': '#082567',
                    'pastel-coral': '#ffb3ba',

                    // Functional
                    success: 'rgb(var(--color-success) / <alpha-value>)',
                    warning: 'rgb(var(--color-warning) / <alpha-value>)',
                    danger: 'rgb(var(--color-danger) / <alpha-value>)',
                },
            },
            // Keep animations...
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'scale-up': 'scaleUp 0.3s ease-out',
                'spin-slow': 'spin 3s linear infinite',
                'pulse-glow': 'pulseGlow 2s infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                scaleUp: {
                    '0%': { transform: 'scale(0.95)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                pulseGlow: {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.5)' }, // Updated to Indigo
                    '50%': { boxShadow: '0 0 40px rgba(99, 102, 241, 0.8)' },
                }
            }
        },
    },
    plugins: [],
}
