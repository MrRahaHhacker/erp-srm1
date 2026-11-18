import {isPlatformBrowser} from '@angular/common';
import {HttpClient, HttpInterceptorFn} from '@angular/common/http';
import {computed, inject, Injectable, PLATFORM_ID, signal} from '@angular/core';
import {Router} from '@angular/router';
import {catchError, firstValueFrom, from, switchMap, throwError} from 'rxjs';
import type {PublicUser} from '../../shared/srm.types';

const TOKEN_KEY = 'srm_access_token';
const REFRESH_KEY = 'srm_refresh_token';
const USER_KEY = 'srm_user_profile';

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: PublicUser;
  mfaRequired?: boolean;
  otpId?: string;
  demoOtpHint?: string;
  userId?: string;
}

@Injectable({providedIn: 'root'})
export class AuthStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<PublicUser | null>(this.loadStoredUser());
  private readonly _token = signal<string | null>(this.loadStorage(TOKEN_KEY));
  private readonly _refreshToken = signal<string | null>(this.loadStorage(REFRESH_KEY));

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this._user() && this._token()));
  readonly role = computed(() => this._user()?.role ?? null);
  readonly isReadOnly = computed(() => this._user()?.role === 'AUDITOR');

  private loadStorage(key: string): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private loadStoredUser(): PublicUser | null {
    const raw = this.loadStorage(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PublicUser;
    } catch {
      return null;
    }
  }

  private persistSession(accessToken: string, refreshToken: string, user: PublicUser): void {
    this._token.set(accessToken);
    this._refreshToken.set(refreshToken);
    this._user.set(user);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_KEY, refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  }

  clearSession(): void {
    this._token.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  async login(payload: {
    identifier: string;
    password: string;
    rememberMe: boolean;
    captchaId?: string;
    captchaAnswer?: string;
  }): Promise<LoginResponse> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', payload),
    );
    if (res.accessToken && res.refreshToken && res.user) {
      this.persistSession(res.accessToken, res.refreshToken, res.user);
    }
    return res;
  }

  async verifyMfa(payload: {
    otpId: string;
    code: string;
    rememberMe: boolean;
  }): Promise<LoginResponse> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/verify-mfa', payload),
    );
    if (res.accessToken && res.refreshToken && res.user) {
      this.persistSession(res.accessToken, res.refreshToken, res.user);
    }
    return res;
  }

  async refreshSession(): Promise<string | null> {
    const rt = this._refreshToken();
    if (!rt) return null;
    try {
      const res = await firstValueFrom(
        this.http.post<{accessToken: string; refreshToken: string; user: PublicUser}>(
          '/api/auth/refresh',
          {refreshToken: rt},
        ),
      );
      this.persistSession(res.accessToken, res.refreshToken, res.user);
      return res.accessToken;
    } catch {
      this.clearSession();
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this._token()) {
        await firstValueFrom(this.http.post('/api/auth/logout', {}));
      }
    } catch {
      // ignore network error on logout
    } finally {
      this.clearSession();
      void this.router.navigateByUrl('/login');
    }
  }

  getRefreshToken(): string | null {
    return this._refreshToken();
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const token = auth.token();

  if (!req.url.startsWith('/api') || req.url.startsWith('/api/auth/login') || req.url.startsWith('/api/auth/refresh')) {
    return next(req);
  }

  const authedReq = token
    ? req.clone({setHeaders: {Authorization: `Bearer ${token}`}})
    : req;

  return next(authedReq).pipe(
    catchError((err) => {
      if (err.status === 401 && auth.getRefreshToken()) {
        return from(auth.refreshSession()).pipe(
          switchMap((newToken) => {
            if (!newToken) {
              auth.clearSession();
              void router.navigateByUrl('/login');
              return throwError(() => err);
            }
            return next(
              req.clone({setHeaders: {Authorization: `Bearer ${newToken}`}}),
            );
          }),
        );
      }
      if (err.status === 401) {
        auth.clearSession();
        void router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};
