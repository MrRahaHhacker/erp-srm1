import {JsonPipe} from '@angular/common';
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
import {ActivatedRoute} from '@angular/router';
import type {
  Company,
  MasterItem,
  NumberRange,
  Plant,
  PublicUser,
  SapIntegrationRecord,
  SecuritySettings,
  WorkflowConfiguration,
} from '../../shared/srm.types';
import {AuthStore} from '../core/auth.store';
import {formatDateTime, humanStatus, statusColorClass} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

interface AdminOverview {
  users: PublicUser[];
  securitySettings: SecuritySettings;
  companies: Company[];
  plants: Plant[];
  materialCategories: MasterItem[];
  supplierCategories: MasterItem[];
  taxes: MasterItem[];
  currencies: MasterItem[];
  uoms: MasterItem[];
  incoterms: MasterItem[];
  paymentTerms: MasterItem[];
  numberRanges: NumberRange[];
  workflowConfig: WorkflowConfiguration;
  sapIntegrations: SapIntegrationRecord[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin',
  imports: [ReactiveFormsModule, MatIconModule, JsonPipe],
  template: `
    <div class="space-y-6">
      <div>
        <p class="text-xs text-slate-500">Enterprise Administration, Master Data & SAP Integration</p>
        <h1 class="font-display text-2xl font-semibold text-slate-900 mt-0.5">
          System Configuration & SAP Layer
        </h1>
      </div>

      @if (feedback()) {
        <div class="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900">
          {{ feedback() }}
        </div>
      }

      <div class="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
        @for (t of tabs; track t.key) {
          <button
            type="button"
            (click)="activeTab.set(t.key)"
            class="px-3.5 py-2 rounded-md text-xs font-medium whitespace-nowrap shrink-0"
            [class.bg-white]="activeTab() === t.key"
            [class.text-slate-900]="activeTab() === t.key"
            [class.text-slate-600]="activeTab() !== t.key"
          >
            {{ t.label }}
          </button>
        }
      </div>

      @if (overview(); as data) {
        <!-- TAB 1: USERS & ACCESS -->
        @if (activeTab() === 'users') {
          <div class="space-y-6">
            @if (!isAuditor()) {
              <form [formGroup]="userForm" (ngSubmit)="createUser()" class="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <h2 class="font-display text-base font-semibold text-slate-900">Provision New User Account</h2>
                <div class="grid sm:grid-cols-4 gap-3 text-xs">
                  <input type="text" formControlName="fullName" placeholder="Full Name *" class="px-3 py-2 border border-slate-300 rounded-md" />
                  <input type="text" formControlName="username" placeholder="Username *" class="px-3 py-2 font-mono border border-slate-300 rounded-md" />
                  <input type="email" formControlName="email" placeholder="Corporate Email *" class="px-3 py-2 border border-slate-300 rounded-md" />
                  <select formControlName="role" class="px-3 py-2 border border-slate-300 rounded-md bg-white">
                    <option value="BUYER">BUYER</option>
                    <option value="APPROVER">APPROVER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="AUDITOR">AUDITOR</option>
                    <option value="SUPPLIER">SUPPLIER</option>
                  </select>
                  @if (userForm.controls.role.value === 'APPROVER') {
                    <select formControlName="approverType" class="px-3 py-2 border border-slate-300 rounded-md bg-white">
                      <option value="SCM_REVIEWER">SCM Reviewer</option>
                      <option value="FINANCE_REVIEWER">Finance Reviewer</option>
                      <option value="QUALITY_REVIEWER">Quality Reviewer</option>
                      <option value="TECHNICAL_REVIEWER">Technical Reviewer</option>
                      <option value="COSTING_REVIEWER">Costing Reviewer</option>
                      <option value="SCM_MANAGER">SCM Manager</option>
                      <option value="PURCHASE_HEAD">Purchase Head</option>
                      <option value="MANAGEMENT_APPROVER">Management Approver</option>
                    </select>
                  }
                  <input type="text" formControlName="designation" placeholder="Designation" class="px-3 py-2 border border-slate-300 rounded-md" />
                  <button type="submit" class="px-4 py-2 rounded-md bg-slate-900 text-white font-medium">
                    Create User
                  </button>
                </div>
              </form>
            }

            <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th class="py-3 px-4 font-medium">Name & Designation</th>
                      <th class="py-3 px-4 font-medium">Username / Email</th>
                      <th class="py-3 px-4 font-medium">Role & Authority</th>
                      <th class="py-3 px-4 font-medium">Plants</th>
                      <th class="py-3 px-4 font-medium">Status</th>
                      <th class="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (u of data.users; track u.id) {
                      <tr>
                        <td class="py-2.5 px-4">
                          <div class="font-medium text-slate-900">{{ u.fullName }}</div>
                          <div class="text-[11px] text-slate-500">{{ u.designation }}</div>
                        </td>
                        <td class="py-2.5 px-4 font-mono text-slate-700">
                          <div>{{ u.username }}</div>
                          <div class="text-[11px] text-slate-500">{{ u.email }}</div>
                        </td>
                        <td class="py-2.5 px-4 text-slate-800">
                          {{ humanStatus(u.role) }}
                          @if (u.approverType) { · {{ humanStatus(u.approverType) }} }
                        </td>
                        <td class="py-2.5 px-4 font-mono text-[11px] text-slate-600">{{ u.plantIds.join(', ') || 'All' }}</td>
                        <td class="py-2.5 px-4 font-medium" [class]="statusClass(u.status)">{{ u.status }}</td>
                        <td class="py-2.5 px-4 text-right">
                          @if (!isAuditor() && u.status === 'LOCKED') {
                            <button type="button" (click)="unlockUser(u.id)" class="px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50">
                              Unlock
                            </button>
                          } @else {
                            <span class="text-slate-400">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }

        <!-- TAB 2: MASTER DATA & PLANTS -->
        @if (activeTab() === 'master') {
          <div class="grid lg:grid-cols-2 gap-6">
            @if (!isAuditor()) {
              <form [formGroup]="masterForm" (ngSubmit)="addMaster()" class="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-end gap-3 text-xs">
                <label class="block">
                  <span class="block text-slate-600 mb-1">Master Data Table</span>
                  <select formControlName="type" class="px-3 py-2 border border-slate-300 rounded-md bg-white">
                    <option value="materialCategories">Material Categories</option>
                    <option value="supplierCategories">Supplier Categories</option>
                    <option value="plants">Plants</option>
                    <option value="taxes">Tax Masters</option>
                    <option value="currencies">Currencies</option>
                    <option value="uoms">UOMs</option>
                    <option value="incoterms">Incoterms</option>
                    <option value="paymentTerms">Payment Terms</option>
                  </select>
                </label>
                <label class="block">
                  <span class="block text-slate-600 mb-1">Code *</span>
                  <input type="text" formControlName="code" placeholder="e.g. 1040 or NET90" class="px-3 py-2 font-mono border border-slate-300 rounded-md" />
                </label>
                <label class="block flex-1 min-w-[200px]">
                  <span class="block text-slate-600 mb-1">Name *</span>
                  <input type="text" formControlName="name" placeholder="Description / Title" class="w-full px-3 py-2 border border-slate-300 rounded-md" />
                </label>
                <button type="submit" class="px-4 py-2 rounded-md bg-slate-900 text-white font-medium">
                  Add Master Record
                </button>
              </form>
            }

            <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-2">
              <h2 class="font-display text-sm font-semibold text-slate-900">Plants ({{ data.plants.length }})</h2>
              @for (p of data.plants; track p.id) {
                <div class="py-2 border-b border-slate-100 last:border-b-0 flex justify-between">
                  <span><span class="font-mono font-semibold">{{ p.code }}</span> · {{ p.name }}</span>
                  <span class="text-slate-500">{{ p.city }}, {{ p.state }}</span>
                </div>
              }
            </div>

            <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-2">
              <h2 class="font-display text-sm font-semibold text-slate-900">Number Ranges</h2>
              @for (nr of data.numberRanges; track nr.id) {
                <div class="py-2 border-b border-slate-100 last:border-b-0 flex justify-between font-mono">
                  <span class="text-slate-700">{{ nr.objectType }}</span>
                  <span class="text-slate-900">{{ nr.prefix }} (Next #{{ nr.currentNumber }})</span>
                </div>
              }
            </div>

            <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-2">
              <h2 class="font-display text-sm font-semibold text-slate-900">Material Categories</h2>
              @for (m of data.materialCategories; track m.id) {
                <div class="py-1.5 flex justify-between border-b border-slate-100 last:border-b-0">
                  <span class="font-medium text-slate-900">{{ m.name }}</span>
                  <span class="font-mono text-slate-500">{{ m.code }}</span>
                </div>
              }
            </div>

            <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-2">
              <h2 class="font-display text-sm font-semibold text-slate-900">Payment Terms & Incoterms</h2>
              @for (pt of data.paymentTerms; track pt.id) {
                <div class="py-1.5 flex justify-between border-b border-slate-100 last:border-b-0">
                  <span>{{ pt.name }}</span>
                  <span class="font-mono text-slate-500">{{ pt.code }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- TAB 3: CONFIGURABLE WORKFLOW & APPROVAL MATRIX -->
        @if (activeTab() === 'workflow') {
          <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-6 text-xs">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-display text-base font-semibold text-slate-900">Configurable Approval Matrix</h2>
                <p class="text-slate-500 mt-0.5">Dynamic value thresholds, non-L1 exception rules, and workflow policies.</p>
              </div>
              @if (!isAuditor()) {
                <button type="button" (click)="saveWorkflowToggles()" class="px-4 py-2 rounded-md bg-slate-900 text-white font-medium">
                  Save Workflow Rules
                </button>
              }
            </div>

            <form [formGroup]="workflowForm" class="flex flex-wrap gap-6 p-4 rounded bg-slate-50 border border-slate-200">
              <label class="inline-flex items-center gap-2 text-slate-800">
                <input type="checkbox" formControlName="requireRfqApprovalBeforePublish" />
                Require Internal RFQ Approval Before Publishing
              </label>
              <label class="inline-flex items-center gap-2 text-slate-800">
                <input type="checkbox" formControlName="requireTechnicalEvalBeforeCommercial" />
                Require Technical Evaluation Before Commercial L1 Ranking
              </label>
              <label class="inline-flex items-center gap-2 text-slate-800">
                <input type="checkbox" formControlName="allowQuotationRevisions" />
                Permit Supplier Quotation Revisions Prior to Deadline
              </label>
            </form>

            <div class="space-y-3">
              <h3 class="font-semibold text-slate-900">Value-Based Rate Approval Thresholds</h3>
              @for (rule of data.workflowConfig.rateApprovalRules; track rule.id) {
                <div class="p-4 rounded border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p class="font-semibold text-slate-900">{{ rule.name }}</p>
                    <p class="text-slate-500 font-mono mt-0.5">
                      Min: ₹{{ rule.minAmount.toLocaleString('en-IN') }} · Max: {{ rule.maxAmount ? '₹' + rule.maxAmount.toLocaleString('en-IN') : 'Unlimited' }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    @for (st of rule.stages; track st.stageOrder) {
                      <span class="font-mono text-[11px] text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
                        0{{ st.stageOrder }}. {{ st.label }}
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- TAB 4: SECURITY SETTINGS -->
        @if (activeTab() === 'security') {
          <form [formGroup]="securityForm" (ngSubmit)="saveSecurity()" class="bg-white border border-slate-200 rounded-lg p-6 space-y-5 text-xs max-w-3xl">
            <h2 class="font-display text-base font-semibold text-slate-900">Authentication & Session Policies</h2>
            <div class="grid sm:grid-cols-2 gap-4">
              <label class="block">
                <span class="block text-slate-600 mb-1">Max Failed Attempts Before Lock</span>
                <input type="number" formControlName="maxFailedAttempts" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
              </label>
              <label class="block">
                <span class="block text-slate-600 mb-1">Account Lock Duration (Minutes)</span>
                <input type="number" formControlName="lockDurationMinutes" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
              </label>
              <label class="block">
                <span class="block text-slate-600 mb-1">Password Expiry (Days)</span>
                <input type="number" formControlName="passwordExpiryDays" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
              </label>
              <label class="block">
                <span class="block text-slate-600 mb-1">Session Timeout (Minutes)</span>
                <input type="number" formControlName="sessionTimeoutMinutes" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
              </label>
              <label class="block">
                <span class="block text-slate-600 mb-1">Max Concurrent Sessions</span>
                <input type="number" formControlName="maxConcurrentSessions" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
              </label>
              <label class="block">
                <span class="block text-slate-600 mb-1">CAPTCHA Trigger Threshold</span>
                <input type="number" formControlName="captchaThreshold" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
              </label>
            </div>
            <div class="flex flex-col gap-2">
              <label class="inline-flex items-center gap-2 text-slate-800">
                <input type="checkbox" formControlName="enforceMfaForAdmins" /> Enforce OTP MFA for Admin & Super Admin Sign-ins
              </label>
              <label class="inline-flex items-center gap-2 text-slate-800">
                <input type="checkbox" formControlName="allowSupplierSelfRegistration" /> Enable Public Supplier Self-Registration Portal
              </label>
            </div>
            @if (!isAuditor()) {
              <button type="submit" class="px-4 py-2 rounded-md bg-slate-900 text-white font-medium">
                Update Security Policy
              </button>
            }
          </form>
        }

        <!-- TAB 5: SAP ERP INTEGRATION LAYER -->
        @if (activeTab() === 'sap') {
          <div class="space-y-4">
            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <h2 class="font-display text-base font-semibold text-slate-900">
                SAP S/4HANA Integration Readiness Layer (Phase-2 Handoff Queue)
              </h2>
              <p class="text-xs text-slate-500 mt-1">
                Vendor Master (BP/XK01), Purchasing Info Records (ME11), Outline Contracts (ME31K), and PO Handoff payloads staged for SAP BAPI/OData connectors.
              </p>
            </div>

            @for (sap of data.sapIntegrations; track sap.id) {
              <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span class="font-mono font-semibold text-slate-900">{{ sap.objectType }}</span>
                    <span class="text-slate-500"> · T-Code {{ sap.tcode }} · {{ sap.bapiOrService }}</span>
                    <p class="text-slate-600 mt-0.5">
                      SRM Ref: <span class="font-mono">{{ sap.entityNumber }}</span>
                      @if (sap.sapObjectId) { · SAP Doc ID: <span class="font-mono font-semibold">{{ sap.sapObjectId }}</span> }
                    </p>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="font-semibold" [class]="statusClass(sap.status)">{{ sap.status }}</span>
                    @if (!isAuditor() && sap.status !== 'SYNCED') {
                      <button
                        type="button"
                        (click)="syncSap(sap.id)"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 text-white font-medium"
                      >
                        <mat-icon class="text-[15px]">sync</mat-icon>
                        <span>Trigger SAP Sync</span>
                      </button>
                    }
                  </div>
                </div>
                <p class="text-slate-500">{{ sap.lastMessage }}</p>
                <pre class="p-3 rounded bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto">{{ sap.payloadPreview | json }}</pre>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class Admin implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);

  readonly activeTab = signal<'users' | 'master' | 'workflow' | 'security' | 'sap'>('users');
  readonly overview = signal<AdminOverview | null>(null);
  readonly feedback = signal('');
  readonly isAuditor = computed(() => this.auth.role() === 'AUDITOR');

  readonly tabs = [
    {key: 'users' as const, label: 'Users & Access'},
    {key: 'master' as const, label: 'Org & Master Data'},
    {key: 'workflow' as const, label: 'Workflow & Approval Matrix'},
    {key: 'security' as const, label: 'Security & Auth Policies'},
    {key: 'sap' as const, label: 'SAP Integration Layer'},
  ];

  readonly userForm = new FormGroup({
    fullName: new FormControl('', {nonNullable: true}),
    username: new FormControl('', {nonNullable: true}),
    email: new FormControl('', {nonNullable: true}),
    role: new FormControl<'BUYER' | 'APPROVER' | 'ADMIN' | 'AUDITOR' | 'SUPPLIER'>('BUYER', {nonNullable: true}),
    approverType: new FormControl('SCM_REVIEWER', {nonNullable: true}),
    designation: new FormControl('Procurement Specialist', {nonNullable: true}),
  });

  readonly masterForm = new FormGroup({
    type: new FormControl('materialCategories', {nonNullable: true}),
    code: new FormControl('', {nonNullable: true}),
    name: new FormControl('', {nonNullable: true}),
  });

  readonly workflowForm = new FormGroup({
    requireRfqApprovalBeforePublish: new FormControl(true, {nonNullable: true}),
    requireTechnicalEvalBeforeCommercial: new FormControl(true, {nonNullable: true}),
    allowQuotationRevisions: new FormControl(true, {nonNullable: true}),
  });

  readonly securityForm = new FormGroup({
    maxFailedAttempts: new FormControl(5, {nonNullable: true}),
    lockDurationMinutes: new FormControl(15, {nonNullable: true}),
    passwordExpiryDays: new FormControl(90, {nonNullable: true}),
    sessionTimeoutMinutes: new FormControl(60, {nonNullable: true}),
    maxConcurrentSessions: new FormControl(3, {nonNullable: true}),
    captchaThreshold: new FormControl(3, {nonNullable: true}),
    enforceMfaForAdmins: new FormControl(false, {nonNullable: true}),
    allowSupplierSelfRegistration: new FormControl(true, {nonNullable: true}),
  });

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab') as
      | 'users'
      | 'master'
      | 'workflow'
      | 'security'
      | 'sap'
      | null;
    if (tab) this.activeTab.set(tab);
    void this.load();
  }

  async load(): Promise<void> {
    const data = (await this.api.getAdminOverview()) as unknown as AdminOverview;
    this.overview.set(data);
    this.workflowForm.patchValue({
      requireRfqApprovalBeforePublish: data.workflowConfig.requireRfqApprovalBeforePublish,
      requireTechnicalEvalBeforeCommercial: data.workflowConfig.requireTechnicalEvalBeforeCommercial,
      allowQuotationRevisions: data.workflowConfig.allowQuotationRevisions,
    });
    this.securityForm.patchValue(data.securitySettings);
  }

  async createUser(): Promise<void> {
    const v = this.userForm.getRawValue();
    if (!v.fullName || !v.username || !v.email) {
      this.feedback.set('Full Name, Username, and Email are required.');
      return;
    }
    await this.api.createUser({
      fullName: v.fullName,
      username: v.username,
      email: v.email,
      role: v.role,
      approverType: v.role === 'APPROVER' ? (v.approverType as PublicUser['approverType']) : undefined,
      designation: v.designation,
    });
    this.userForm.reset({role: 'BUYER', approverType: 'SCM_REVIEWER', designation: 'Procurement Specialist'});
    this.feedback.set(`User "${v.username}" provisioned with default password Srm@2026!.`);
    await this.load();
  }

  async unlockUser(id: string): Promise<void> {
    await this.api.unlockUser(id);
    this.feedback.set('User account unlocked.');
    await this.load();
  }

  async addMaster(): Promise<void> {
    const v = this.masterForm.getRawValue();
    if (!v.code || !v.name) return;
    await this.api.addMasterItem(v.type, {code: v.code, name: v.name});
    this.masterForm.patchValue({code: '', name: ''});
    this.feedback.set(`Master record ${v.code} added.`);
    await this.load();
  }

  async saveWorkflowToggles(): Promise<void> {
    const current = this.overview()?.workflowConfig;
    if (!current) return;
    const v = this.workflowForm.getRawValue();
    await this.api.updateWorkflowConfig({
      ...current,
      ...v,
    });
    this.feedback.set('Workflow and approval matrix policies updated.');
    await this.load();
  }

  async saveSecurity(): Promise<void> {
    await this.api.updateSecuritySettings(this.securityForm.getRawValue());
    this.feedback.set('Authentication & session security policies saved.');
    await this.load();
  }

  async syncSap(id: string): Promise<void> {
    const res = await this.api.syncSapRecord(id);
    this.feedback.set(`SAP S/4HANA Sync Completed: ${res.sapObjectId}`);
    await this.load();
  }

  formatTime = formatDateTime;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
