import {
    HttpContextToken,
    HttpErrorResponse,
    HttpHandlerFn,
    HttpInterceptorFn,
    HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const PUBLIC_API_REQUEST = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
    const authService = inject(AuthService);
    const token = authService.getToken();
    const isPublicRequest = req.context.get(PUBLIC_API_REQUEST);
    const isAuthRequest = req.url.includes('/api/auth/');

    const request = !isPublicRequest && token
        ? req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        })
        : req;

    return next(request).pipe(
        catchError((error: unknown) => {
            if (
                !isPublicRequest &&
                !isAuthRequest &&
                error instanceof HttpErrorResponse &&
                (error.status === 401 || error.status === 403)
            ) {
                authService.handleAuthFailure();
            }

            return throwError(() => error);
        }),
    );
};
