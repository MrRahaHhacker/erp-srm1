import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {AuthStore} from './auth.store';
import type {UserRole} from '../../shared/srm.types';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  const allowedRoles = route.data?.['roles'] as UserRole[] | undefined;
  const userRole = auth.role();
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
