import { Component, PLATFORM_ID, Inject, signal, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
    selector: 'app-theme-toggle',
    standalone: true,
    imports: [CommonModule],
    template: `
    <button (click)="toggleTheme()" 
      class="p-2 rounded-lg bg-brand-surface border border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary"
      [attr.aria-label]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
      
      <!-- Sun Icon (Light Mode) -->
      <svg *ngIf="!isDark()" class="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>

      <!-- Moon Icon (Dark Mode) -->
      <svg *ngIf="isDark()" class="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    </button>
  `
})
export class ThemeToggle {
    isDark = signal<boolean>(false); // Default to light

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        if (isPlatformBrowser(this.platformId)) {
            // Init from local storage or system preference
            // Init from local storage or system preference
            const saved = localStorage.getItem('theme');
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

            if (saved === 'dark') {
                this.isDark.set(true);
            } else if (saved === 'light') {
                this.isDark.set(false);
            } else {
                // Default to light if nothing saved, regardless of system for now based on request
                // OR honor system if user wants?
                // User request: "make sure it default to light mode" usually implies overriding system default if no user choice exists.
                this.isDark.set(false);
            }

            this.applyTheme();
        }
    }

    toggleTheme() {
        this.isDark.update(d => !d);
        this.applyTheme();
    }

    private applyTheme() {
        if (!isPlatformBrowser(this.platformId)) return;

        if (this.isDark()) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }
}
