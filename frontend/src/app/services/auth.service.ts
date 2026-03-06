import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private http = inject(HttpClient);
    private router = inject(Router);
    private tokenSubject = new BehaviorSubject<string | null>(localStorage.getItem('token'));

    isLoggedIn$ = new BehaviorSubject<boolean>(!!localStorage.getItem('token'));

    login(username: string, password: string) {
        return this.http.post<{ token: string }>('/api/auth/login', { username, password })
            .pipe(
                tap(res => {
                    localStorage.setItem('token', res.token);
                    this.tokenSubject.next(res.token);
                    this.isLoggedIn$.next(true);
                })
            );
    }

    logout() {
        localStorage.removeItem('token');
        this.tokenSubject.next(null);
        this.isLoggedIn$.next(false);
        this.router.navigate(['/login']);
    }

    getToken() {
        return this.tokenSubject.value;
    }

    get isLoggedIn() {
        return !!this.getToken();
    }
}
