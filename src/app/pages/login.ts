import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {Router, RouterLink} from '@angular/router';
import {AuthStore} from '../core/auth.store';
import {humanStatus} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

interface DemoAccount {
  username: string;
  email: string;
  fullName: string;
  role: string;
  approverType?: string;
  designation: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="min-h-screen grid lg:grid-cols-12 bg-white">
      <!-- Left Editorial Manufacturing Panel -->
      <div class="hidden lg:flex lg:col-span-6 relative bg-slate-950 text-white overflow-hidden flex-col justify-between p-12">
        <img
          src="/assets/images/automotive_precision_plant_1794919087320.jpg"
          alt="AutoCorp Precision CNC Automotive Manufacturing Facility"
          referrerpolicy="no-referrer"
          class="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/40"></div>

        <div class="relative z-10 flex items-center gap-3">
          <span class="w-10 h-10 rounded-md bg-blue-600 text-white flex items-center justify-center font-display font-bold text-base">
            SR
          </span>
          <div>
            <p class="font-display font-semibold text-lg tracking-tight text-white">AutoCorp Precision Ltd.</p>
            <p class="text-xs text-slate-300">Enterprise Procurement Governance</p>
          </div>
        </div>

        <div class="relative z-10 max-w-xl">
          <p class="text-xs font-medium tracking-wide text-blue-300 mb-3">
            Phase-1 Sourcing & Supplier Collaboration
          </p>
          <h1 class="font-display text-3xl xl:text-4xl font-semibold tracking-tight text-white leading-tight">
            SRM ERP – Supplier Relationship Management System
          </h1>
          <p class="mt-4 text-sm text-slate-200 leading-relaxed">
            Centralized automotive sourcing platform unifying supplier onboarding, multi-stage approvals, sealed-bid RFQs, automated L1/L2/L3 landed-cost comparison, structured negotiations, rate approvals, and SAP S/4HANA readiness.
          </p>

          <div class="mt-8 pt-6 border-t border-white/15 grid grid-cols-3 gap-6">
            <div>
              <p class="font-mono text-xl font-semibold text-white tabular-nums">30</p>
              <p class="text-xs text-slate-300 mt-0.5">Enterprise Modules</p>
            </div>
            <div>
              <p class="font-mono text-xl font-semibold text-white tabular-nums">100%</p>
              <p class="text-xs text-slate-300 mt-0.5">Sealed-Bid Isolation</p>
            </div>
            <div>
              <p class="font-mono text-xl font-semibold text-white tabular-nums">SAP</p>
              <p class="text-xs text-slate-300 mt-0.5">BAPI & OData Ready</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Authentication Form -->
      <div class="lg:col-span-6 flex flex-col justify-center px-6 py-10 sm:px-12 xl:px-20 bg-slate-50">
        <div class="w-full max-w-md mx-auto">
          <div class="lg:hidden flex items-center gap-2.5 mb-8">
            <span class="w-9 h-9 rounded-md bg-blue-600 text-white flex items-center justify-center font-display font-bold text-sm">
              SR
            </span>
            <span class="font-display font-semibold text-lg text-slate-900">SRM ERP</span>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-7 sm:p-8">
            <h2 class="font-display text-2xl font-semibold text-slate-900">Sign in to SRM ERP</h2>
            <p class="text-sm text-slate-500 mt-1">
              Enter your corporate or supplier portal credentials.
            </p>

            @if (errorMsg()) {
              <div class="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
                <mat-icon class="text-[18px] shrink-0 mt-0.5">error_outline</mat-icon>
                <span>{{ errorMsg() }}</span>
              </div>
            }

            @if (!mfaStep()) {
              <form [formGroup]="loginForm" (ngSubmit)="submitLogin()" class="mt-6 space-y-4">
                <div>
                  <label for="identifier" class="block text-xs font-medium text-slate-700 mb-1.5">
                    Email or Username
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    formControlName="identifier"
                    placeholder="e.g. buyer or rajesh.kulkarni@autocorp-srm.com"
                    class="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white"
                  />
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label for="password" class="block text-xs font-medium text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      (click)="activeModal.set('FORGOT')"
                      class="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    formControlName="password"
                    placeholder="Enter your password"
                    class="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 bg-white"
                  />
                </div>

                @if (captchaChallenge()) {
                  <div class="p-3 rounded-md bg-amber-50 border border-amber-200 space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-medium text-amber-900">
                        Security Verification (CAPTCHA)
                      </span>
                      <button
                        type="button"
                        (click)="refreshCaptcha()"
                        class="text-xs text-blue-700 hover:underline"
                      >
                        Refresh
                      </button>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="font-mono text-sm font-semibold px-3 py-1.5 bg-white border border-amber-300 rounded text-slate-900">
                        {{ captchaChallenge()?.question }}
                      </span>
                      <input
                        type="text"
                        formControlName="captchaAnswer"
                        placeholder="Answer"
                        class="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
                      />
                    </div>
                  </div>
                }

                <div class="flex items-center justify-between pt-1">
                  <label class="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      formControlName="rememberMe"
                      class="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Remember me for 7 days</span>
                  </label>
                </div>

                <button
                  type="submit"
                  [disabled]="loading()"
                  class="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium transition-colors"
                >
                  <mat-icon class="text-[18px]">login</mat-icon>
                  <span>{{ loading() ? 'Authenticating...' : 'Sign In' }}</span>
                </button>
              </form>
            } @else {
              <form [formGroup]="mfaForm" (ngSubmit)="submitMfa()" class="mt-6 space-y-4">
                <div class="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900">
                  MFA verification enabled. Enter the 6-digit OTP code (Demo code:
                  <span class="font-mono font-semibold">{{ mfaHint() }}</span>).
                </div>
                <div>
                  <label for="mfaCode" class="block text-xs font-medium text-slate-700 mb-1.5">
                    Verification Code
                  </label>
                  <input
                    id="mfaCode"
                    type="text"
                    formControlName="code"
                    placeholder="6-digit OTP"
                    class="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div class="flex items-center gap-3">
                  <button
                    type="submit"
                    class="flex-1 py-2.5 px-4 rounded-md bg-slate-900 text-white text-sm font-medium"
                  >
                    Verify & Continue
                  </button>
                  <button
                    type="button"
                    (click)="mfaStep.set(false)"
                    class="py-2.5 px-4 rounded-md border border-slate-300 text-sm text-slate-700"
                  >
                    Back
                  </button>
                </div>
              </form>
            }

            <div class="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <a
                routerLink="/register-supplier"
                class="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"
              >
                <mat-icon class="text-[16px]">app_registration</mat-icon>
                <span>New Supplier Registration Portal</span>
              </a>
              <div class="flex items-center gap-3 text-slate-500">
                <button type="button" (click)="activeModal.set('SUPPORT')" class="hover:text-slate-900">
                  Contact Support
                </button>
                <span aria-hidden="true">·</span>
                <button type="button" (click)="activeModal.set('TERMS')" class="hover:text-slate-900">
                  Terms & Privacy
                </button>
              </div>
            </div>
          </div>

          <!-- Role Directory for Instant Multi-Role Testing -->
          <div class="mt-5 bg-white border border-slate-200 rounded-lg p-5">
            <div class="flex items-center justify-between gap-2">
              <div>
                <h3 class="text-xs font-semibold text-slate-900">
                  Role-Based Access Directory
                </h3>
                <p class="text-xs text-slate-500 mt-0.5">
                  Select any role to auto-fill credentials (Password: <span class="font-mono text-slate-700">{{ demoPassword() }}</span>)
                </p>
              </div>
              <button
                type="button"
                (click)="showDirectory.set(!showDirectory())"
                class="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
              >
                {{ showDirectory() ? 'Hide Roles' : 'Browse All Roles' }}
              </button>
            </div>

            <!-- Quick Primary Roles -->
            <div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              @for (acc of primaryQuickAccounts(); track acc.username) {
                <button
                  type="button"
                  (click)="quickFillAndLogin(acc.username)"
                  class="text-left px-2.5 py-2 rounded border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <p class="text-xs font-semibold text-slate-900 truncate">{{ acc.label }}</p>
                  <p class="text-[11px] text-slate-500 font-mono truncate">{{ acc.username }}</p>
                </button>
              }
            </div>

            @if (showDirectory()) {
              <div class="mt-3 pt-3 border-t border-slate-100 max-h-56 overflow-y-auto divide-y divide-slate-100">
                @for (acc of demoAccounts(); track acc.username) {
                  <div class="py-2 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-xs font-medium text-slate-900 truncate">
                        {{ acc.fullName }}
                      </p>
                      <p class="text-[11px] text-slate-500 truncate">
                        {{ formatRole(acc.role, acc.approverType) }} · <span class="font-mono">{{ acc.username }}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      (click)="quickFillAndLogin(acc.username)"
                      class="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-900 hover:text-white text-[11px] font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      Sign In
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Modals: Forgot Password / Support / Terms -->
    @if (activeModal()) {
      <div class="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
        <div class="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6">
          @if (activeModal() === 'FORGOT') {
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display text-lg font-semibold text-slate-900">Reset Password</h3>
              <button type="button" (click)="closeModal()" class="text-slate-400 hover:text-slate-700">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            @if (!forgotOtpId()) {
              <form [formGroup]="forgotForm" (ngSubmit)="sendResetOtp()" class="space-y-4">
                <p class="text-xs text-slate-600">
                  Enter your registered email address to receive a 6-digit password reset OTP.
                </p>
                <input
                  type="email"
                  formControlName="email"
                  placeholder="name@company.com"
                  class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
                <button
                  type="submit"
                  class="w-full py-2 px-4 rounded-md bg-slate-900 text-white text-sm font-medium"
                >
                  Send Reset OTP
                </button>
              </form>
            } @else {
              <form [formGroup]="resetForm" (ngSubmit)="confirmPasswordReset()" class="space-y-3">
                <p class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded">
                  OTP sent. Demo verification code: <span class="font-mono font-semibold">{{ forgotOtpHint() }}</span>
                </p>
                <input
                  type="text"
                  formControlName="code"
                  placeholder="6-digit OTP"
                  class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
                <input
                  type="password"
                  formControlName="newPassword"
                  placeholder="New password (min 8 chars)"
                  class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
                <button
                  type="submit"
                  class="w-full py-2 px-4 rounded-md bg-slate-900 text-white text-sm font-medium"
                >
                  Update Password
                </button>
              </form>
            }
            @if (modalStatus()) {
              <p class="mt-3 text-xs text-slate-700">{{ modalStatus() }}</p>
            }
          }

          @if (activeModal() === 'SUPPORT') {
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display text-lg font-semibold text-slate-900">Procurement Helpdesk</h3>
              <button type="button" (click)="closeModal()" class="text-slate-400 hover:text-slate-700">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="space-y-3 text-sm text-slate-600">
              <p>For supplier onboarding assistance, RFQ access, or account unlock requests:</p>
              <p class="font-mono text-xs bg-slate-50 border border-slate-200 p-3 rounded">
                Email: srm-helpdesk@autocorp-srm.com<br />
                Phone: +91 20 6712 4400 (Mon–Sat, 08:30–19:00 IST)
              </p>
            </div>
          }

          @if (activeModal() === 'TERMS') {
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display text-lg font-semibold text-slate-900">Terms & Privacy Governance</h3>
              <button type="button" (click)="closeModal()" class="text-slate-400 hover:text-slate-700">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <div class="space-y-2.5 text-xs text-slate-600 leading-relaxed">
              <p>
                All sourcing events, technical drawings, commercial quotations, and negotiation rounds are protected under AutoCorp Precision Ltd. confidentiality and ISO 27001 audit controls.
              </p>
              <p>
                Sealed-bid isolation prevents disclosure of competitor pricing or identity prior to deadline closure. All actions are immutably logged for SOX and statutory audit compliance.
              </p>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class Login implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(SrmApi);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly captchaChallenge = signal<{captchaId: string; question: string} | null>(null);
  readonly mfaStep = signal(false);
  readonly mfaOtpId = signal('');
  readonly mfaHint = signal('');
  readonly showDirectory = signal(false);
  readonly demoPassword = signal('Srm@2026!');
  readonly demoAccounts = signal<DemoAccount[]>([]);
  readonly activeModal = signal<'FORGOT' | 'SUPPORT' | 'TERMS' | null>(null);
  readonly forgotOtpId = signal('');
  readonly forgotOtpHint = signal('');
  readonly modalStatus = signal('');

  readonly primaryQuickAccounts = signal([
    {label: 'Super Admin', username: 'superadmin'},
    {label: 'System Admin', username: 'admin'},
    {label: 'Buyer (SCM)', username: 'buyer'},
    {label: 'Purchase Head', username: 'purchase.head'},
    {label: 'Supplier (Bharat)', username: 'supplier.bharat'},
    {label: 'Auditor', username: 'auditor'},
  ]);

  readonly loginForm = new FormGroup({
    identifier: new FormControl('buyer', {nonNullable: true, validators: [Validators.required]}),
    password: new FormControl('Srm@2026!', {nonNullable: true, validators: [Validators.required]}),
    rememberMe: new FormControl(false, {nonNullable: true}),
    captchaAnswer: new FormControl('', {nonNullable: true}),
  });

  readonly mfaForm = new FormGroup({
    code: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
  });

  readonly forgotForm = new FormGroup({
    email: new FormControl('', {nonNullable: true, validators: [Validators.required, Validators.email]}),
  });

  readonly resetForm = new FormGroup({
    code: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    newPassword: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
  });

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/dashboard');
      return;
    }
    void this.loadDemoAccounts();
  }

  async loadDemoAccounts(): Promise<void> {
    try {
      const data = await this.api.getDemoAccounts();
      this.demoPassword.set(data.defaultPassword);
      this.demoAccounts.set(data.accounts);
    } catch {
      // ignore
    }
  }

  async refreshCaptcha(): Promise<void> {
    const c = await this.api.getCaptcha();
    this.captchaChallenge.set(c);
  }

  async submitLogin(): Promise<void> {
    if (this.loginForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set('');
    const val = this.loginForm.getRawValue();
    try {
      const res = await this.auth.login({
        identifier: val.identifier,
        password: val.password,
        rememberMe: val.rememberMe,
        captchaId: this.captchaChallenge()?.captchaId,
        captchaAnswer: val.captchaAnswer,
      });
      if (res.mfaRequired && res.otpId) {
        this.mfaStep.set(true);
        this.mfaOtpId.set(res.otpId);
        this.mfaHint.set(res.demoOtpHint || '');
        return;
      }
      this.redirectByRole();
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string; requireCaptcha?: boolean; captcha?: {captchaId: string; question: string}}};
      this.errorMsg.set(httpErr?.error?.error || 'Authentication failed');
      if (httpErr?.error?.requireCaptcha && httpErr?.error?.captcha) {
        this.captchaChallenge.set(httpErr.error.captcha);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async submitMfa(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      await this.auth.verifyMfa({
        otpId: this.mfaOtpId(),
        code: this.mfaForm.getRawValue().code,
        rememberMe: this.loginForm.getRawValue().rememberMe,
      });
      this.redirectByRole();
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.errorMsg.set(httpErr?.error?.error || 'MFA verification failed');
    } finally {
      this.loading.set(false);
    }
  }

  quickFillAndLogin(username: string): void {
    this.loginForm.patchValue({
      identifier: username,
      password: this.demoPassword(),
    });
    void this.submitLogin();
  }

  private redirectByRole(): void {
    const role = this.auth.role();
    if (role === 'APPROVER') {
      void this.router.navigateByUrl('/approvals');
    } else {
      void this.router.navigateByUrl('/dashboard');
    }
  }

  async sendResetOtp(): Promise<void> {
    if (this.forgotForm.invalid) return;
    const res = await this.api.forgotPassword(this.forgotForm.getRawValue().email);
    this.forgotOtpId.set(res.otpId || 'SENT');
    this.forgotOtpHint.set(res.demoOtpHint || 'Check email');
    this.modalStatus.set(res.message);
  }

  async confirmPasswordReset(): Promise<void> {
    if (this.resetForm.invalid) return;
    try {
      const val = this.resetForm.getRawValue();
      await this.api.resetPassword({
        otpId: this.forgotOtpId(),
        code: val.code,
        newPassword: val.newPassword,
      });
      this.modalStatus.set('Password updated successfully. You may now sign in.');
      setTimeout(() => this.closeModal(), 1200);
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.modalStatus.set(httpErr?.error?.error || 'Reset failed');
    }
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.forgotOtpId.set('');
    this.modalStatus.set('');
  }

  formatRole(role: string, approverType?: string): string {
    return approverType ? `${humanStatus(role)} (${humanStatus(approverType)})` : humanStatus(role);
  }
}
