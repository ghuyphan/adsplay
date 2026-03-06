import { Routes } from '@angular/router';
import { Admin } from './features/dashboard/admin';
import { Player } from './features/player/player';
import { Login } from './features/auth/login/login';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
    { path: 'login', component: Login },
    { path: 'admin', component: Admin, canActivate: [authGuard] },
    { path: 'player', component: Player },
    { path: 'player/:profileName', component: Player },
    { path: '', redirectTo: '/admin', pathMatch: 'full' }
];
