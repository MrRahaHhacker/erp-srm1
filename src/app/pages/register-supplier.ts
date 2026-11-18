import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {SrmApi} from '../core/srm-api';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-register-supplier',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="min-h-screen bg-slate-50 py-10 px-4 sm:px-8">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between gap-4 mb-6">
          <div>
            <p class="text-xs font-medium text-slate-500">AutoCorp Precision Ltd. · Supplier Onboarding Portal</p>
            <h1 class="font-display text-2xl font-semibold text-slate-900 mt-1">
              New Supplier Registration Application
            </h1>
          </div>
          <a
            routerLink="/login"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap"
          >
            <mat-icon class="text-[16px]">arrow_back</mat-icon>
            <span>Back to Login</span>
          </a>
        </div>

        @if (submittedResult()) {
          <div class="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
            <div class="flex items-center gap-3 text-emerald-700">
              <mat-icon class="text-[28px]">check_circle</mat-icon>
              <h2 class="font-display text-xl font-semibold text-slate-900">
                Application {{ submittedResult()?.status === 'DRAFT' ? 'Saved as Draft' : 'Submitted for Approval' }}
              </h2>
            </div>
            <p class="text-sm text-slate-600">
              Application Reference: <span class="font-mono font-semibold text-slate-900">{{ submittedResult()?.applicationNumber }}</span>
              · Status: <span class="font-medium text-slate-900">{{ submittedResult()?.status }}</span>
            </p>
            <div class="p-4 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-700 space-y-1">
              <p class="font-medium text-slate-900">Supplier Portal Credentials Provisioned</p>
              <p>Username: <span class="font-mono font-semibold">{{ submittedResult()?.portalUsername }}</span></p>
              <p>Password: Use the password you configured during registration.</p>
            </div>
            <a
              routerLink="/login"
              class="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 text-white text-sm font-medium"
            >
              <mat-icon class="text-[18px]">login</mat-icon>
              <span>Proceed to Supplier Sign In</span>
            </a>
          </div>
        } @else {
          <!-- Step Indicator -->
          <div class="bg-white border border-slate-200 rounded-lg p-4 mb-6 grid grid-cols-4 gap-3 text-xs">
            @for (s of steps; track s.num) {
              <button
                type="button"
                (click)="step.set(s.num)"
                class="text-left px-3 py-2 rounded border transition-colors"
                [class.border-slate-900]="step() === s.num"
                [class.bg-slate-900]="step() === s.num"
                [class.text-white]="step() === s.num"
                [class.border-slate-200]="step() !== s.num"
                [class.text-slate-600]="step() !== s.num"
              >
                <span class="font-mono">0{{ s.num }}</span> · {{ s.label }}
              </button>
            }
          </div>

          @if (errorMsg()) {
            <div class="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
              {{ errorMsg() }}
            </div>
          }

          <form [formGroup]="regForm" class="bg-white border border-slate-200 rounded-lg p-6 sm:p-8 space-y-6">
            @if (step() === 1) {
              <div class="space-y-4">
                <h2 class="font-display text-lg font-semibold text-slate-900">1. Account & OTP Verification</h2>
                <div class="grid sm:grid-cols-2 gap-4">
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Company Legal Name *</span>
                    <input type="text" formControlName="companyName" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Legal Entity Type</span>
                    <select formControlName="legalEntityType" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white">
                      <option value="Private Limited">Private Limited</option>
                      <option value="Public Limited">Public Limited</option>
                      <option value="Partnership Firm">Partnership Firm</option>
                      <option value="LLP">LLP</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Official Email *</span>
                    <input type="email" formControlName="email" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Mobile Number *</span>
                    <input type="text" formControlName="mobile" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Portal Password *</span>
                    <input type="password" formControlName="password" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Primary Contact Name *</span>
                    <input type="text" formControlName="primaryContactName" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                </div>

                <div class="p-4 rounded-md bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p class="text-xs font-semibold text-slate-900">Email & Mobile Verification</p>
                    <p class="text-xs text-slate-500 mt-0.5">
                      @if (otpHint()) {
                        OTP dispatched. Demo verification code: <span class="font-mono font-semibold text-slate-900">{{ otpHint() }}</span>
                      } @else {
                        Request a 6-digit verification code to validate supplier identity.
                      }
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      (click)="requestOtp()"
                      class="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800 whitespace-nowrap"
                    >
                      Send OTP
                    </button>
                    <input
                      type="text"
                      formControlName="otpCode"
                      placeholder="Enter OTP"
                      class="w-28 px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white"
                    />
                  </div>
                </div>
              </div>
            }

            @if (step() === 2) {
              <div class="space-y-4">
                <h2 class="font-display text-lg font-semibold text-slate-900">2. Statutory Tax & Address Profile</h2>
                <div class="grid sm:grid-cols-2 gap-4">
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">GSTIN Number *</span>
                    <input type="text" formControlName="gstNumber" class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">PAN Number *</span>
                    <input type="text" formControlName="panNumber" class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">MSME Category</span>
                    <select formControlName="msmeCategory" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white">
                      <option value="NONE">Non-MSME</option>
                      <option value="MICRO">Micro Enterprise</option>
                      <option value="SMALL">Small Enterprise</option>
                      <option value="MEDIUM">Medium Enterprise</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">MSME / Udyam Registration No.</span>
                    <input type="text" formControlName="msmeNumber" class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md" />
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Registered Factory Address *</span>
                    <input type="text" formControlName="registeredAddress" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">City</span>
                    <input type="text" formControlName="city" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">State</span>
                    <input type="text" formControlName="state" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                </div>
              </div>
            }

            @if (step() === 3) {
              <div class="space-y-4">
                <h2 class="font-display text-lg font-semibold text-slate-900">3. Capabilities & Quality Systems</h2>
                <div class="grid sm:grid-cols-2 gap-4">
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Supplier Category</span>
                    <select formControlName="supplierCategory" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white">
                      <option value="Tier-1 Machining & Forgings">Tier-1 Machining & Forgings</option>
                      <option value="Tier-1 Machining & Die Casting">Tier-1 Machining & Die Casting</option>
                      <option value="Tier-2 Precision Turned Parts">Tier-2 Precision Turned Parts</option>
                      <option value="EV Thermal & Cooling">EV Thermal & Cooling</option>
                      <option value="Rubber, Seals & Gaskets">Rubber, Seals & Gaskets</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Annual Turnover (₹ Crores)</span>
                    <input type="number" formControlName="annualTurnoverCr" class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md" />
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Manufacturing Capabilities & Machinery</span>
                    <textarea rows="3" formControlName="manufacturingCapabilities" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"></textarea>
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Quality Certifications (comma separated)</span>
                    <input type="text" formControlName="qualityCertsText" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                </div>
              </div>
            }

            @if (step() === 4) {
              <div class="space-y-4">
                <h2 class="font-display text-lg font-semibold text-slate-900">4. Bank Mandate & Document Attachments</h2>
                <div class="grid sm:grid-cols-2 gap-4">
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Bank Name *</span>
                    <input type="text" formControlName="bankName" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Branch Name</span>
                    <input type="text" formControlName="branchName" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Account Number *</span>
                    <input type="text" formControlName="accountNumber" class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">IFSC Code *</span>
                    <input type="text" formControlName="ifscCode" class="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md" />
                  </label>
                </div>

                <div class="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                  <p class="text-xs font-semibold text-slate-900">Mandatory Document Checklist</p>
                  <div class="grid sm:grid-cols-2 gap-2 text-xs text-slate-700">
                    <label class="flex items-center gap-2">
                      <input type="checkbox" formControlName="docGst" /> GST Registration Certificate (PDF)
                    </label>
                    <label class="flex items-center gap-2">
                      <input type="checkbox" formControlName="docPan" /> Corporate PAN Card (PDF)
                    </label>
                    <label class="flex items-center gap-2">
                      <input type="checkbox" formControlName="docCheque" /> Cancelled Cheque / Bank Mandate
                    </label>
                    <label class="flex items-center gap-2">
                      <input type="checkbox" formControlName="docIso" /> IATF 16949 / ISO 9001 Certificate
                    </label>
                  </div>
                </div>
              </div>
            }

            <div class="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                @if (step() > 1) {
                  <button
                    type="button"
                    (click)="step.set(step() - 1)"
                    class="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                }
                @if (step() < 4) {
                  <button
                    type="button"
                    (click)="step.set(step() + 1)"
                    class="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
                  >
                    Next Step
                  </button>
                }
              </div>

              @if (step() === 4) {
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    [disabled]="submitting()"
                    (click)="submitApplication(false)"
                    class="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    [disabled]="submitting()"
                    (click)="submitApplication(true)"
                    class="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                  >
                    <mat-icon class="text-[18px]">send</mat-icon>
                    <span>Submit Application</span>
                  </button>
                </div>
              }
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class RegisterSupplier {
  private readonly api = inject(SrmApi);

  readonly step = signal(1);
  readonly otpId = signal('');
  readonly otpHint = signal('');
  readonly submitting = signal(false);
  readonly errorMsg = signal('');
  readonly submittedResult = signal<{
    applicationNumber: string;
    status: string;
    portalUsername: string;
  } | null>(null);

  readonly steps = [
    {num: 1, label: 'Account & OTP'},
    {num: 2, label: 'Tax & Address'},
    {num: 3, label: 'Capabilities'},
    {num: 4, label: 'Bank & Docs'},
  ];

  readonly regForm = new FormGroup({
    companyName: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    legalEntityType: new FormControl('Private Limited', {nonNullable: true}),
    email: new FormControl('', {nonNullable: true, validators: [Validators.required, Validators.email]}),
    mobile: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    password: new FormControl('Srm@2026!', {nonNullable: true}),
    primaryContactName: new FormControl('', {nonNullable: true}),
    otpCode: new FormControl('', {nonNullable: true}),
    gstNumber: new FormControl('', {nonNullable: true}),
    panNumber: new FormControl('', {nonNullable: true}),
    msmeCategory: new FormControl<'NONE' | 'MICRO' | 'SMALL' | 'MEDIUM'>('SMALL', {nonNullable: true}),
    msmeNumber: new FormControl('', {nonNullable: true}),
    registeredAddress: new FormControl('', {nonNullable: true}),
    city: new FormControl('', {nonNullable: true}),
    state: new FormControl('', {nonNullable: true}),
    supplierCategory: new FormControl('Tier-1 Machining & Forgings', {nonNullable: true}),
    annualTurnoverCr: new FormControl(45, {nonNullable: true}),
    manufacturingCapabilities: new FormControl('', {nonNullable: true}),
    qualityCertsText: new FormControl('IATF 16949:2016, ISO 9001:2015', {nonNullable: true}),
    bankName: new FormControl('', {nonNullable: true}),
    branchName: new FormControl('', {nonNullable: true}),
    accountNumber: new FormControl('', {nonNullable: true}),
    ifscCode: new FormControl('', {nonNullable: true}),
    docGst: new FormControl(true, {nonNullable: true}),
    docPan: new FormControl(true, {nonNullable: true}),
    docCheque: new FormControl(true, {nonNullable: true}),
    docIso: new FormControl(true, {nonNullable: true}),
  });

  async requestOtp(): Promise<void> {
    this.errorMsg.set('');
    const {email, mobile} = this.regForm.getRawValue();
    if (!email || !mobile) {
      this.errorMsg.set('Enter email and mobile number before requesting OTP.');
      return;
    }
    try {
      const res = await this.api.sendSupplierRegistrationOtp(email, mobile);
      this.otpId.set(res.otpId);
      this.otpHint.set(res.demoOtpHint);
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.errorMsg.set(httpErr?.error?.error || 'Failed to send OTP');
    }
  }

  async submitApplication(submitNow: boolean): Promise<void> {
    this.errorMsg.set('');
    const val = this.regForm.getRawValue();
    if (!this.otpId() || !val.otpCode) {
      this.errorMsg.set('Please complete Step 1 OTP verification before submitting.');
      this.step.set(1);
      return;
    }
    if (submitNow && (!val.gstNumber || !val.panNumber || !val.accountNumber || !val.ifscCode)) {
      this.errorMsg.set('GSTIN, PAN, Bank Account Number, and IFSC Code are mandatory for submission.');
      return;
    }

    this.submitting.set(true);
    try {
      const now = new Date().toISOString();
      const documents = [];
      if (val.docGst) documents.push({id: 'D1', docType: 'GST_CERTIFICATE', fileName: 'GST_Registration.pdf', fileSize: '380 KB', uploadedAt: now, verified: false});
      if (val.docPan) documents.push({id: 'D2', docType: 'PAN_CARD', fileName: 'Company_PAN.pdf', fileSize: '210 KB', uploadedAt: now, verified: false});
      if (val.docCheque) documents.push({id: 'D3', docType: 'CANCELLED_CHEQUE', fileName: 'Cancelled_Cheque.pdf', fileSize: '290 KB', uploadedAt: now, verified: false});
      if (val.docIso) documents.push({id: 'D4', docType: 'ISO_CERTIFICATE', fileName: 'ISO_IATF_Certificate.pdf', fileSize: '940 KB', uploadedAt: now, verified: false});

      const res = await this.api.registerSupplierPublic({
        otpId: this.otpId(),
        otpCode: val.otpCode,
        submitNow,
        companyName: val.companyName,
        legalEntityType: val.legalEntityType,
        email: val.email,
        mobile: val.mobile,
        password: val.password,
        primaryContactName: val.primaryContactName || val.companyName,
        gstNumber: val.gstNumber,
        panNumber: val.panNumber,
        msmeCategory: val.msmeCategory,
        msmeNumber: val.msmeNumber,
        registeredAddress: val.registeredAddress,
        city: val.city,
        state: val.state,
        supplierCategory: val.supplierCategory,
        annualTurnoverCr: val.annualTurnoverCr,
        manufacturingCapabilities: val.manufacturingCapabilities,
        qualityCertifications: val.qualityCertsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        bankDetails: {
          bankName: val.bankName,
          branchName: val.branchName,
          accountNumber: val.accountNumber,
          ifscCode: val.ifscCode,
          accountType: 'Current Account',
          beneficiaryName: val.companyName,
        },
        documents,
      });

      this.submittedResult.set({
        applicationNumber: res.supplier.applicationNumber,
        status: res.supplier.status,
        portalUsername: res.portalUsername,
      });
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.errorMsg.set(httpErr?.error?.error || 'Submission failed');
    } finally {
      this.submitting.set(false);
    }
  }
}
