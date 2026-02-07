import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-button',
  imports: [CommonModule],
  templateUrl: './button.html',
  styleUrl: './button.css',
})
export class Button {
  @Input() label: string = '';
  @Input() variant: 'primary' | 'secondary' | 'danger' | 'outline' = 'primary';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled: boolean = false;
  @Input() icon: boolean = false;
  @Output() onClick = new EventEmitter<Event>();

  get classes(): string {
    const base = this.icon
      ? 'p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center aspect-square'
      : 'px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
    // Updated variants for new palette (Indigo/Slate)
    const variants = {
      primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover focus:ring-brand-primary',
      secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300 focus:ring-slate-400 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600',
      danger: 'bg-brand-danger text-white hover:bg-red-600 focus:ring-red-500',
      outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50 focus:ring-brand-primary dark:border-white/20 dark:text-gray-300 dark:hover:bg-white/5'
    };
    const disabledState = this.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

    return `${base} ${variants[this.variant]} ${disabledState}`;
  }
}
