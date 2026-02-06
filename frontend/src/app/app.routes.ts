import { Routes } from '@angular/router';
import { Admin } from './pages/admin/admin';
import { Player } from './pages/player/player';

export const routes: Routes = [
    { path: 'admin', component: Admin },
    { path: 'player', component: Player },
    { path: 'player/:profileName', component: Player },
    { path: '', redirectTo: '/admin', pathMatch: 'full' }
];
