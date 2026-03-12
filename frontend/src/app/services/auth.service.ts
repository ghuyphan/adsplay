import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';
import { Router } from '@angular/router';

const TOKEN_STORAGE_KEY = 'token';

const readStoredToken = () => {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    return localStorage.getItem(TOKEN_STORAGE_KEY);
};

const writeStoredToken = (token: string | null) => {
    if (typeof localStorage === 'undefined') {
        return;
    }

    if (!token) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private http = inject(HttpClient);
    private router = inject(Router);
    private tokenSubject = new BehaviorSubject<string | null>(readStoredToken());

    isLoggedIn$ = new BehaviorSubject<boolean>(!!readStoredToken());

    login(username: string, password: string) {
        return this.http.post<{ token: string }>('/api/auth/login', { username, password })
            .pipe(
                tap(res => {
                    this.setSession(res.token);
                })
            );
    }

    logout() {
        this.clearSession();
        this.navigateToLogin();
    }

    handleAuthFailure() {
        this.clearSession();
        this.navigateToLogin();
    }

    getToken() {
        return this.tokenSubject.value;
    }

    get isLoggedIn() {
        return !!this.getToken();
    }

    private setSession(token: string | null) {
        writeStoredToken(token);
        this.tokenSubject.next(token);
        this.isLoggedIn$.next(!!token);
    }

    private clearSession() {
        this.setSession(null);
    }

    private navigateToLogin() {
        if (this.router.url !== '/login') {
            void this.router.navigate(['/login']);
        }
    }
}
