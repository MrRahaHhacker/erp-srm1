import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {ActivatedRoute, RouterLink} from '@angular/router';
import type {SupplierApplication} from '../../shared/srm.types';
import {AuthStore} from '../core/auth.store';
import {formatDateTime, humanStatus, statusColorClass} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-supplier-detail',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    @if (loading()) {
      <div class="p-8 text-sm text-slate-500">Loading supplier dossier...</div>
    } @else if (supplier(); as sup) {
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <a routerLink="/suppliers" class="hover:text-slate-900">Suppliers</a>
              <span aria-hidden="true">/</span>
              <span class="font-mono text-slate-700">{{ sup.applicationNumber }}</span>
              @if (sup.supplierRegNo) {
                <span aria-hidden="true">·</span>
                <span class="font-mono text-slate-700">{{ sup.supplierRegNo }}</span>
              }
              @if (sup.sapVendorCode) {
                <span aria-hidden="true">·</span>
                <span class="font-mono text-slate-700">SAP {{ sup.sapVendorCode }}</span>
              }
            </div>
            <h1 class="font-display text-2xl font-semibold text-slate-900 mt-1">
              {{ sup.companyName }}
            </h1>
            <p class="text-xs font-semibold mt-1" [class]="statusClass(sup.status)">
              Status: {{ humanStatus(sup.status) }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            @if (isAdmin() && sup.status === 'APPROVED') {
              <button
                type="button"
                (click)="activate()"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium"
              >
                <mat-icon class="text-[16px]">verified</mat-icon>
                <span>Activate & Generate SAP Vendor</span>
              </button>
            }
            @if (isAdmin() && sup.status === 'ACTIVE') {
              <button
                type="button"
                (click)="blockOrReopen('BLOCK')"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium"
              >
                <mat-icon class="text-[16px]">block</mat-icon>
                <span>Block Supplier</span>
              </button>
            }
            @if (isAdmin() && (sup.status === 'REJECTED' || sup.status === 'BLOCKED')) {
              <button
                type="button"
                (click)="blockOrReopen('REOPEN')"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium"
              >
                <mat-icon class="text-[16px]">refresh</mat-icon>
                <span>Reopen Application</span>
              </button>
            }
          </div>
        </div>

        @if (feedbackMsg()) {
          <div class="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900">
            {{ feedbackMsg() }}
          </div>
        }

        @if (sup.status === 'REJECTED' && sup.rejectionReason) {
          <div class="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
            <span class="font-semibold">Rejection Reason:</span> {{ sup.rejectionReason }}
          </div>
        }

        @if (sup.status === 'CORRECTION_REQUIRED') {
          <div class="p-4 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
            <p class="font-semibold">Correction Requested by Internal Reviewer</p>
            <p>Permitted editable sections: <span class="font-mono">{{ sup.permittedCorrectionSections.join(', ') }}</span>. Update required fields below and resubmit.</p>
          </div>
        }

        <!-- Onboarding Stage Pipeline -->
        <div class="bg-white border border-slate-200 rounded-lg p-5">
          <h2 class="text-xs font-semibold text-slate-500 mb-3">Approval Workflow Progress</h2>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            @for (stage of onboardingStages; track stage.idx) {
              <div
                class="p-3 rounded border"
                [class.border-emerald-300]="sup.currentStageIndex > stage.idx || sup.status === 'ACTIVE'"
                [class.bg-emerald-50]="sup.currentStageIndex > stage.idx || sup.status === 'ACTIVE'"
                [class.border-slate-900]="sup.currentStageIndex === stage.idx && sup.status !== 'ACTIVE'"
                [class.border-slate-200]="sup.currentStageIndex < stage.idx && sup.status !== 'ACTIVE'"
              >
                <p class="font-mono text-[11px] text-slate-500">0{{ stage.idx + 1 }}</p>
                <p class="font-semibold text-slate-900 mt-0.5">{{ stage.label }}</p>
              </div>
            }
          </div>
        </div>

        <div class="grid lg:grid-cols-3 gap-6">
          <!-- Main Dossier Details (2 cols) -->
          <div class="lg:col-span-2 space-y-6">
            <form [formGroup]="editForm" class="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
              <div class="flex items-center justify-between">
                <h2 class="font-display text-base font-semibold text-slate-900">Company, Tax & Banking Profile</h2>
                @if (canEditDossier()) {
                  <button
                    type="button"
                    (click)="saveAndResubmit(false)"
                    class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700"
                  >
                    Save Changes
                  </button>
                }
              </div>

              <div class="grid sm:grid-cols-2 gap-4 text-xs">
                <label class="block">
                  <span class="block text-slate-500 mb-1">GSTIN</span>
                  <input type="text" formControlName="gstNumber" [readonly]="!canEditDossier()" class="w-full px-3 py-2 font-mono border border-slate-200 rounded bg-slate-50/50" />
                </label>
                <label class="block">
                  <span class="block text-slate-500 mb-1">PAN Number</span>
                  <input type="text" formControlName="panNumber" [readonly]="!canEditDossier()" class="w-full px-3 py-2 font-mono border border-slate-200 rounded bg-slate-50/50" />
                </label>
                <label class="block">
                  <span class="block text-slate-500 mb-1">MSME / Udyam</span>
                  <input type="text" formControlName="msmeNumber" [readonly]="!canEditDossier()" class="w-full px-3 py-2 font-mono border border-slate-200 rounded bg-slate-50/50" />
                </label>
                <label class="block">
                  <span class="block text-slate-500 mb-1">Supplier Category</span>
                  <input type="text" formControlName="supplierCategory" [readonly]="!canEditDossier()" class="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50/50" />
                </label>
                <label class="block sm:col-span-2">
                  <span class="block text-slate-500 mb-1">Registered Address</span>
                  <input type="text" formControlName="registeredAddress" [readonly]="!canEditDossier()" class="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50/50" />
                </label>
                <label class="block sm:col-span-2">
                  <span class="block text-slate-500 mb-1">Manufacturing Capabilities</span>
                  <textarea rows="2" formControlName="manufacturingCapabilities" [readonly]="!canEditDossier()" class="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50/50"></textarea>
                </label>
              </div>

              <div class="pt-4 border-t border-slate-200">
                <h3 class="text-xs font-semibold text-slate-900 mb-3">Bank Mandate Information</h3>
                <div class="grid sm:grid-cols-2 gap-4 text-xs">
                  <label class="block">
                    <span class="block text-slate-500 mb-1">Bank Name</span>
                    <input type="text" formControlName="bankName" [readonly]="!canEditBank()" class="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50/50" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-500 mb-1">Beneficiary Name</span>
                    <input type="text" formControlName="beneficiaryName" [readonly]="!canEditBank()" class="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50/50" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-500 mb-1">Account Number</span>
                    <input type="text" formControlName="accountNumber" [readonly]="!canEditBank()" class="w-full px-3 py-2 font-mono border border-slate-200 rounded bg-slate-50/50" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-500 mb-1">IFSC Code</span>
                    <input type="text" formControlName="ifscCode" [readonly]="!canEditBank()" class="w-full px-3 py-2 font-mono border border-slate-200 rounded bg-slate-50/50" />
                  </label>
                </div>
              </div>

              @if (canResubmit()) {
                <div class="pt-4 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    (click)="saveAndResubmit(true)"
                    class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                  >
                    <mat-icon class="text-[16px]">send</mat-icon>
                    <span>{{ sup.status === 'CORRECTION_REQUIRED' ? 'Resubmit Corrected Application' : 'Submit Application' }}</span>
                  </button>
                </div>
              }
            </form>

            <!-- Documents -->
            <div class="bg-white border border-slate-200 rounded-lg p-6">
              <h2 class="font-display text-base font-semibold text-slate-900 mb-3">Uploaded Compliance Documents</h2>
              @if (sup.documents.length === 0) {
                <p class="text-xs text-slate-500">No documents attached.</p>
              } @else {
                <div class="divide-y divide-slate-100 text-xs">
                  @for (doc of sup.documents; track doc.id) {
                    <div class="py-2.5 flex items-center justify-between gap-4">
                      <div>
                        <p class="font-medium text-slate-900">{{ doc.fileName }}</p>
                        <p class="text-slate-500">{{ humanStatus(doc.docType) }} · {{ doc.fileSize }}</p>
                      </div>
                      <span class="font-medium" [class]="doc.verified ? 'text-emerald-700' : 'text-amber-700'">
                        {{ doc.verified ? 'Verified' : 'Pending Verification' }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Right Column: Reviewer Actions & Audit History -->
          <div class="space-y-6">
            @if (canReview()) {
              <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <h2 class="font-display text-base font-semibold text-slate-900">Reviewer Decision</h2>
                <form [formGroup]="reviewForm" class="space-y-3">
                  <label class="block">
                    <span class="block text-xs font-medium text-slate-700 mb-1">Remarks (Mandatory) *</span>
                    <textarea
                      rows="3"
                      formControlName="remarks"
                      placeholder="Enter verification findings, compliance notes, or correction instructions..."
                      class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                    ></textarea>
                  </label>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      (click)="performReview('APPROVE')"
                      class="py-2 px-3 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium"
                    >
                      Approve Stage
                    </button>
                    <button
                      type="button"
                      (click)="performReview('SEND_BACK')"
                      class="py-2 px-3 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-medium"
                    >
                      Send Back
                    </button>
                    <button
                      type="button"
                      (click)="performReview('HOLD')"
                      class="py-2 px-3 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium"
                    >
                      Put On Hold
                    </button>
                    <button
                      type="button"
                      (click)="performReview('REQUEST_INFO')"
                      class="py-2 px-3 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium"
                    >
                      Request Info
                    </button>
                  </div>
                  <button
                    type="button"
                    (click)="performReview('REJECT')"
                    class="w-full py-2 px-3 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium"
                  >
                    Reject Application
                  </button>
                </form>
              </div>
            }

            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <h2 class="font-display text-base font-semibold text-slate-900 mb-3">Approval History</h2>
              <div class="space-y-3">
                @for (h of sup.approvalHistory; track h.id) {
                  <div class="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0 text-xs">
                    <div class="flex items-center justify-between">
                      <span class="font-semibold text-slate-900">{{ h.stageLabel }}</span>
                      <span class="font-mono text-[11px] text-slate-500">{{ h.action }}</span>
                    </div>
                    <p class="text-slate-600 mt-1">{{ h.remarks }}</p>
                    <p class="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {{ h.approverName }} ({{ humanStatus(h.approverRole) }}) · {{ formatTime(h.timestamp) }}
                    </p>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class SupplierDetail implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly supplier = signal<SupplierApplication | null>(null);
  readonly feedbackMsg = signal('');

  readonly onboardingStages = [
    {idx: 0, label: 'SCM Review'},
    {idx: 1, label: 'Finance Review'},
    {idx: 2, label: 'Quality Review'},
    {idx: 3, label: 'Purchase Head'},
    {idx: 4, label: 'SAP Activation'},
  ];

  readonly editForm = new FormGroup({
    gstNumber: new FormControl('', {nonNullable: true}),
    panNumber: new FormControl('', {nonNullable: true}),
    msmeNumber: new FormControl('', {nonNullable: true}),
    supplierCategory: new FormControl('', {nonNullable: true}),
    registeredAddress: new FormControl('', {nonNullable: true}),
    manufacturingCapabilities: new FormControl('', {nonNullable: true}),
    bankName: new FormControl('', {nonNullable: true}),
    beneficiaryName: new FormControl('', {nonNullable: true}),
    accountNumber: new FormControl('', {nonNullable: true}),
    ifscCode: new FormControl('', {nonNullable: true}),
  });

  readonly reviewForm = new FormGroup({
    remarks: new FormControl('', {nonNullable: true}),
  });

  readonly isAdmin = computed(() => {
    const r = this.auth.role();
    return r === 'ADMIN' || r === 'SUPER_ADMIN';
  });

  readonly canEditDossier = computed(() => {
    const sup = this.supplier();
    const r = this.auth.role();
    if (!sup || r === 'AUDITOR') return false;
    if (r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'BUYER') {
      return ['DRAFT', 'CORRECTION_REQUIRED', 'INFO_REQUESTED'].includes(sup.status);
    }
    if (r === 'SUPPLIER') {
      return ['DRAFT', 'CORRECTION_REQUIRED', 'INFO_REQUESTED'].includes(sup.status);
    }
    return false;
  });

  readonly canEditBank = computed(() => {
    const sup = this.supplier();
    if (!sup || !this.canEditDossier()) return false;
    if (sup.status === 'CORRECTION_REQUIRED' && sup.permittedCorrectionSections.length > 0) {
      return sup.permittedCorrectionSections.includes('bankDetails');
    }
    return true;
  });

  readonly canResubmit = computed(() => {
    const sup = this.supplier();
    const r = this.auth.role();
    if (!sup || r === 'AUDITOR') return false;
    return (
      ['DRAFT', 'CORRECTION_REQUIRED', 'INFO_REQUESTED'].includes(sup.status) &&
      (r === 'SUPPLIER' || r === 'BUYER' || r === 'ADMIN' || r === 'SUPER_ADMIN')
    );
  });

  readonly canReview = computed(() => {
    const sup = this.supplier();
    const r = this.auth.role();
    if (!sup) return false;
    return (
      (r === 'APPROVER' || r === 'ADMIN' || r === 'SUPER_ADMIN') &&
      ['SUBMITTED', 'SCM_REVIEW', 'FINANCE_REVIEW', 'QUALITY_REVIEW', 'FINAL_APPROVAL', 'ON_HOLD', 'INFO_REQUESTED'].includes(
        sup.status,
      )
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const id = this.route.snapshot.paramMap.get('id') || '';
      const sup = await this.api.getSupplier(id);
      this.supplier.set(sup);
      this.editForm.patchValue({
        gstNumber: sup.gstNumber,
        panNumber: sup.panNumber,
        msmeNumber: sup.msmeNumber || '',
        supplierCategory: sup.supplierCategory,
        registeredAddress: sup.registeredAddress,
        manufacturingCapabilities: sup.manufacturingCapabilities,
        bankName: sup.bankDetails.bankName,
        beneficiaryName: sup.bankDetails.beneficiaryName,
        accountNumber: sup.bankDetails.accountNumber,
        ifscCode: sup.bankDetails.ifscCode,
      });
    } finally {
      this.loading.set(false);
    }
  }

  async saveAndResubmit(resubmit: boolean): Promise<void> {
    const sup = this.supplier();
    if (!sup) return;
    const v = this.editForm.getRawValue();
    try {
      const updated = await this.api.updateSupplier(sup.id, {
        gstNumber: v.gstNumber,
        panNumber: v.panNumber,
        msmeNumber: v.msmeNumber,
        supplierCategory: v.supplierCategory,
        registeredAddress: v.registeredAddress,
        manufacturingCapabilities: v.manufacturingCapabilities,
        bankDetails: {
          ...sup.bankDetails,
          bankName: v.bankName,
          beneficiaryName: v.beneficiaryName,
          accountNumber: v.accountNumber,
          ifscCode: v.ifscCode,
        },
      });
      if (resubmit) {
        const submitted = await this.api.submitSupplier(
          sup.id,
          'Updated requested sections and resubmitted.',
        );
        this.supplier.set(submitted);
        this.feedbackMsg.set('Application resubmitted into approval workflow.');
      } else {
        this.supplier.set(updated);
        this.feedbackMsg.set('Draft changes saved.');
      }
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.feedbackMsg.set(httpErr?.error?.error || 'Update failed');
    }
  }

  async performReview(
    action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO',
  ): Promise<void> {
    const sup = this.supplier();
    if (!sup) return;
    const remarks = this.reviewForm.getRawValue().remarks.trim();
    if (!remarks) {
      this.feedbackMsg.set('Please enter reviewer remarks before taking action.');
      return;
    }
    try {
      const updated = await this.api.supplierWorkflowAction(sup.id, {
        action,
        remarks,
        permittedSections: action === 'SEND_BACK' ? ['bankDetails', 'documents'] : undefined,
      });
      this.supplier.set(updated);
      this.reviewForm.reset();
      this.feedbackMsg.set(`Action "${humanStatus(action)}" recorded successfully.`);
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.feedbackMsg.set(httpErr?.error?.error || 'Workflow action failed');
    }
  }

  async activate(): Promise<void> {
    const sup = this.supplier();
    if (!sup) return;
    const updated = await this.api.activateSupplier(sup.id);
    this.supplier.set(updated);
    this.feedbackMsg.set(`Supplier activated with SAP Vendor ${updated.sapVendorCode}.`);
  }

  async blockOrReopen(action: 'BLOCK' | 'REOPEN'): Promise<void> {
    const sup = this.supplier();
    if (!sup) return;
    const updated = await this.api.blockOrReopenSupplier(
      sup.id,
      action,
      action === 'BLOCK' ? 'Blocked by Administrator' : 'Reopened for re-evaluation',
    );
    this.supplier.set(updated);
    this.feedbackMsg.set(`Supplier status updated to ${updated.status}.`);
  }

  formatTime = formatDateTime;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
