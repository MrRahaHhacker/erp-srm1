import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import type {SupplierApplication} from '../../shared/srm.types';
import {AuthStore} from '../core/auth.store';
import {formatDateShort, humanStatus, statusColorClass} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-suppliers-list',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p class="text-xs text-slate-500">Supplier Master & Onboarding Pipeline</p>
          <h1 class="font-display text-2xl font-semibold text-slate-900 mt-0.5">Suppliers</h1>
        </div>
        @if (canInitiate()) {
          <button
            type="button"
            (click)="showCreateModal.set(true)"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap"
          >
            <mat-icon class="text-[18px]">domain_add</mat-icon>
            <span>Initiate Supplier Onboarding</span>
          </button>
        }
      </div>

      <!-- Filters -->
      <div class="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          @for (tab of statusTabs; track tab.key) {
            <button
              type="button"
              (click)="statusFilter.set(tab.key)"
              class="px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap"
              [class.bg-white]="statusFilter() === tab.key"
              [class.text-slate-900]="statusFilter() === tab.key"
              [class.shadow-xs]="statusFilter() === tab.key"
              [class.text-slate-600]="statusFilter() !== tab.key"
            >
              {{ tab.label }}
            </button>
          }
        </div>
        <div class="flex-1 min-w-[220px]">
          <input
            type="text"
            [formControl]="searchControl"
            placeholder="Search company, GST, registration no, or city..."
            class="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          />
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-sm text-slate-500">Loading supplier directory...</div>
        } @else if (filteredSuppliers().length === 0) {
          <div class="p-10 text-center">
            <p class="text-sm font-medium text-slate-900">No suppliers match the current filter</p>
            <p class="text-xs text-slate-500 mt-1">Adjust your status filter or initiate a new supplier onboarding.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th class="py-3 px-4 font-medium">App / Reg No</th>
                  <th class="py-3 px-4 font-medium">Supplier Name</th>
                  <th class="py-3 px-4 font-medium">Category & Location</th>
                  <th class="py-3 px-4 font-medium">GST / SAP Vendor</th>
                  <th class="py-3 px-4 font-medium text-right">Quality</th>
                  <th class="py-3 px-4 font-medium">Lifecycle Status</th>
                  <th class="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (s of filteredSuppliers(); track s.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="py-3 px-4 font-mono text-slate-900 whitespace-nowrap">
                      <div>{{ s.applicationNumber }}</div>
                      @if (s.supplierRegNo) {
                        <div class="text-[11px] text-slate-500">{{ s.supplierRegNo }}</div>
                      }
                    </td>
                    <td class="py-3 px-4">
                      <a [routerLink]="['/suppliers', s.id]" class="font-semibold text-slate-900 hover:text-blue-700">
                        {{ s.companyName }}
                      </a>
                      <div class="text-[11px] text-slate-500">{{ s.primaryContactName }} · {{ s.email }}</div>
                    </td>
                    <td class="py-3 px-4 text-slate-600">
                      <div>{{ s.supplierCategory }}</div>
                      <div class="text-[11px] text-slate-500">{{ s.city }}, {{ s.state }}</div>
                    </td>
                    <td class="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      <div>{{ s.gstNumber || '—' }}</div>
                      <div class="text-[11px] text-slate-500">SAP: {{ s.sapVendorCode || 'Pending' }}</div>
                    </td>
                    <td class="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {{ s.qualityScore }}/100
                    </td>
                    <td class="py-3 px-4 font-medium whitespace-nowrap" [class]="statusClass(s.status)">
                      {{ humanStatus(s.status) }}
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <a
                        [routerLink]="['/suppliers', s.id]"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700"
                      >
                        <span>Open Dossier</span>
                        <mat-icon class="text-[14px]">chevron_right</mat-icon>
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    <!-- Initiate Supplier Onboarding Modal -->
    @if (showCreateModal()) {
      <div class="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
        <div class="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-display text-lg font-semibold text-slate-900">Initiate Supplier Onboarding</h2>
            <button type="button" (click)="showCreateModal.set(false)" class="text-slate-400 hover:text-slate-700">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          @if (formError()) {
            <div class="mb-3 p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">{{ formError() }}</div>
          }
          <form [formGroup]="createForm" class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-3">
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">Company Legal Name *</span>
                <input type="text" formControlName="companyName" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">Supplier Category</span>
                <select formControlName="supplierCategory" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white">
                  <option value="Tier-1 Machining & Forgings">Tier-1 Machining & Forgings</option>
                  <option value="Tier-1 Machining & Die Casting">Tier-1 Machining & Die Casting</option>
                  <option value="Tier-2 Precision Turned Parts">Tier-2 Precision Turned Parts</option>
                  <option value="EV Thermal & Cooling">EV Thermal & Cooling</option>
                  <option value="Rubber, Seals & Gaskets">Rubber, Seals & Gaskets</option>
                </select>
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">Official Email *</span>
                <input type="email" formControlName="email" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">Mobile *</span>
                <input type="text" formControlName="mobile" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">GSTIN</span>
                <input type="text" formControlName="gstNumber" class="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">PAN Number</span>
                <input type="text" formControlName="panNumber" class="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">City</span>
                <input type="text" formControlName="city" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">State</span>
                <input type="text" formControlName="state" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md" />
              </label>
              <label class="block">
                <span class="block text-xs font-medium text-slate-700 mb-1">Bank Name</span>
                <input type="text" formControlName="bankName" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-md" />
              </label>
              <div>
                <span class="block text-xs font-medium text-slate-700 mb-1">Account Number / IFSC</span>
                <div class="grid grid-cols-2 gap-2">
                  <input type="text" formControlName="accountNumber" placeholder="Account No" aria-label="Account Number" class="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-md" />
                  <input type="text" formControlName="ifscCode" placeholder="IFSC" aria-label="IFSC Code" class="px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-md" />
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                (click)="createSupplier(false)"
                class="px-3.5 py-2 rounded-md border border-slate-300 text-xs font-medium text-slate-700"
              >
                Save Draft
              </button>
              <button
                type="button"
                (click)="createSupplier(true)"
                class="px-4 py-2 rounded-md bg-slate-900 text-white text-xs font-medium"
              >
                Create & Submit to SCM Review
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class SuppliersList implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly suppliers = signal<SupplierApplication[]>([]);
  readonly statusFilter = signal('ALL');
  readonly searchTerm = signal('');
  readonly showCreateModal = signal(false);
  readonly formError = signal('');

  readonly searchControl = new FormControl('', {nonNullable: true});
  readonly createForm = new FormGroup({
    companyName: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    supplierCategory: new FormControl('Tier-1 Machining & Forgings', {nonNullable: true}),
    email: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    mobile: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    gstNumber: new FormControl('27AAACS1234M1Z5', {nonNullable: true}),
    panNumber: new FormControl('AAACS1234M', {nonNullable: true}),
    city: new FormControl('Pune', {nonNullable: true}),
    state: new FormControl('Maharashtra', {nonNullable: true}),
    bankName: new FormControl('HDFC Bank', {nonNullable: true}),
    accountNumber: new FormControl('50200099112233', {nonNullable: true}),
    ifscCode: new FormControl('HDFC0001822', {nonNullable: true}),
  });

  readonly statusTabs = [
    {key: 'ALL', label: 'All'},
    {key: 'ACTIVE', label: 'Active'},
    {key: 'APPROVED', label: 'Approved (Pending Activation)'},
    {key: 'REVIEW', label: 'In Review'},
    {key: 'CORRECTION', label: 'Correction / Hold'},
  ];

  readonly canInitiate = computed(() => {
    const r = this.auth.role();
    return r === 'BUYER' || r === 'ADMIN' || r === 'SUPER_ADMIN';
  });

  readonly filteredSuppliers = computed(() => {
    const f = this.statusFilter();
    const q = this.searchTerm().trim().toLowerCase();
    return this.suppliers().filter((s) => {
      if (f === 'ACTIVE' && s.status !== 'ACTIVE') return false;
      if (f === 'APPROVED' && s.status !== 'APPROVED') return false;
      if (
        f === 'REVIEW' &&
        !['SUBMITTED', 'SCM_REVIEW', 'FINANCE_REVIEW', 'QUALITY_REVIEW', 'FINAL_APPROVAL'].includes(
          s.status,
        )
      ) {
        return false;
      }
      if (
        f === 'CORRECTION' &&
        !['CORRECTION_REQUIRED', 'ON_HOLD', 'INFO_REQUESTED', 'DRAFT', 'REJECTED', 'BLOCKED'].includes(
          s.status,
        )
      ) {
        return false;
      }
      if (q) {
        const hay = `${s.companyName} ${s.applicationNumber} ${s.supplierRegNo || ''} ${s.gstNumber} ${s.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.searchTerm.set(v));
    if (this.route.snapshot.queryParamMap.get('new') === '1' && this.canInitiate()) {
      this.showCreateModal.set(true);
    }
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.suppliers.set(await this.api.getSuppliers());
    } finally {
      this.loading.set(false);
    }
  }

  async createSupplier(submitNow: boolean): Promise<void> {
    if (this.createForm.invalid) {
      this.formError.set('Company name, email, and mobile are required.');
      return;
    }
    const v = this.createForm.getRawValue();
    try {
      const created = await this.api.createSupplier({
        submitNow,
        companyName: v.companyName,
        supplierCategory: v.supplierCategory,
        email: v.email,
        mobile: v.mobile,
        gstNumber: v.gstNumber,
        panNumber: v.panNumber,
        city: v.city,
        state: v.state,
        registeredAddress: `${v.city}, ${v.state}`,
        primaryContactName: v.companyName.split(' ')[0] + ' Representative',
        bankDetails: {
          bankName: v.bankName,
          branchName: v.city,
          accountNumber: v.accountNumber,
          ifscCode: v.ifscCode,
          accountType: 'Current Account',
          beneficiaryName: v.companyName,
        },
      });
      this.showCreateModal.set(false);
      void this.router.navigate(['/suppliers', created.id]);
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.formError.set(httpErr?.error?.error || 'Failed to create supplier');
    }
  }

  formatDate = formatDateShort;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
