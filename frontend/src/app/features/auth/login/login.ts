import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-brand-light dark:bg-transparent font-sans text-slate-900 dark:text-white transition-colors duration-300 flex items-center justify-center p-4 relative overflow-hidden">
      <!-- Background Orbs -->
      <div class="absolute -top-[20%] -right-[20%] w-[62.5rem] h-[62.5rem] bg-brand-primary opacity-5 rounded-full pointer-events-none z-0"></div>
      <div class="absolute -bottom-[20%] -left-[20%] w-[40rem] h-[40rem] bg-brand-primary opacity-5 rounded-full pointer-events-none z-0"></div>

      <div class="relative z-10 w-full max-w-md animate-scale-up">
        <div class="glass-panel p-8 md:p-10 rounded-3xl backdrop-blur-xl">
          <div class="flex flex-col items-center mb-8">
            <div class="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mb-4 text-brand-primary">
              <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 class="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Đăng Nhập Admin</h1>
            <p class="text-slate-500 dark:text-slate-400 text-center">Vui lòng đăng nhập để quản lý nội dung</p>
          </div>
          
          <form (submit)="onSubmit($event)" class="space-y-6">
            <div class="space-y-2">
              <label for="username" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">Tài khoản</label>
              <div class="relative group">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input 
                  type="text" 
                  id="username" 
                  [(ngModel)]="username" 
                  name="username" 
                  placeholder="Nhập tài khoản" 
                  required
                  class="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
                >
              </div>
            </div>
            
            <div class="space-y-2">
              <label for="password" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">Mật khẩu</label>
              <div class="relative group">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input 
                  [type]="showPassword ? 'text' : 'password'" 
                  id="password" 
                  [(ngModel)]="password" 
                  name="password" 
                  placeholder="Nhập mật khẩu" 
                  required
                  class="w-full pl-12 pr-12 py-3.5 bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
                >
                <button 
                  type="button"
                  (click)="showPassword = !showPassword"
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-primary transition-colors p-1"
                >
                  <svg *ngIf="!showPassword" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg *ngIf="showPassword" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.04m5.813 5.119a3 3 0 114.243 4.243m4.545-4.545l-4.545 4.545M9.875 18.825A10.05 10.05 0 0112 19c4.478 0 8.268-2.943 9.542-7a9.97 9.97 0 01-1.563-3.04M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div *ngIf="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 p-4 rounded-2xl text-sm font-medium animate-fade-in flex items-center gap-3">
              <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{{ error }}</span>
            </div>
            
            <button 
              type="submit" 
              [disabled]="loading"
              class="w-full py-4 bg-brand-primary hover:bg-brand-secondary text-white rounded-2xl font-bold text-lg shadow-lg shadow-brand-primary/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
            >
              <ng-container *ngIf="!loading">
                <span>Đăng Nhập</span>
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </ng-container>
              <ng-container *ngIf="loading">
                <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Vui lòng đợi...</span>
              </ng-container>
            </button>
          </form>
        </div>
        
        <p class="mt-8 text-center text-slate-500 dark:text-slate-400 text-sm">
          ADSPLAY Signage Solution &bull; &copy; {{ currentYear }}
        </p>
      </div>
    </div>
  `,
  styles: []
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  loading = false;
  error = '';
  showPassword = false;
  currentYear = new Date().getFullYear();

  onSubmit(event: Event) {
    event.preventDefault();
    if (!this.username || !this.password) return;

    this.loading = true;
    this.error = '';

    this.authService.login(this.username, this.password).subscribe({
      next: () => {
        this.router.navigate(['/admin']);
      },
      error: (err) => {
        console.error('Login failed', err);
        this.error = 'Tài khoản hoặc mật khẩu không chính xác';
        this.loading = false;
      }
    });
  }
}
