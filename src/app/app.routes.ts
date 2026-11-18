import {Routes} from '@angular/router';
import {authGuard} from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login').then((m) => m.Login),
  },
  {
    path: 'register-supplier',
    loadComponent: () =>
      import('./pages/register-supplier').then((m) => m.RegisterSupplier),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./pages/suppliers-list').then((m) => m.SuppliersList),
      },
      {
        path: 'suppliers/:id',
        loadComponent: () =>
          import('./pages/supplier-detail').then((m) => m.SupplierDetail),
      },
      {
        path: 'rfqs',
        loadComponent: () => import('./pages/rfqs-list').then((m) => m.RfqsList),
      },
      {
        path: 'rfqs/new',
        loadComponent: () => import('./pages/rfq-create').then((m) => m.RfqCreate),
        canActivate: [authGuard],
        data: {roles: ['BUYER', 'ADMIN', 'SUPER_ADMIN']},
      },
      {
        path: 'rfqs/:id',
        loadComponent: () => import('./pages/rfq-detail').then((m) => m.RfqDetail),
      },
      {
        path: 'approvals',
        loadComponent: () => import('./pages/approvals').then((m) => m.Approvals),
        canActivate: [authGuard],
        data: {roles: ['APPROVER', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR']},
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports').then((m) => m.Reports),
        canActivate: [authGuard],
        data: {roles: ['BUYER', 'APPROVER', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR']},
      },
      {
        path: 'audit-logs',
        loadComponent: () => import('./pages/audit-logs').then((m) => m.AuditLogs),
        canActivate: [authGuard],
        data: {roles: ['APPROVER', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR']},
      },
      {
        path: 'admin',
        loadComponent: () => import('./pages/admin').then((m) => m.Admin),
        canActivate: [authGuard],
        data: {roles: ['ADMIN', 'SUPER_ADMIN', 'AUDITOR']},
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
