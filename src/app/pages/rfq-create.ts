import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {Router, RouterLink} from '@angular/router';
import type {SupplierApplication} from '../../shared/srm.types';
import {SrmApi} from '../core/srm-api';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-rfq-create',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6 max-w-6xl">
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 text-xs text-slate-500">
            <a routerLink="/rfqs" class="hover:text-slate-900">RFQ Management</a>
            <span aria-hidden="true">/</span>
            <span>Create RFQ</span>
          </div>
          <h1 class="font-display text-2xl font-semibold text-slate-900 mt-1">
            Create Request for Quotation
          </h1>
        </div>
      </div>

      @if (errorMsg()) {
        <div class="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {{ errorMsg() }}
        </div>
      }

      <form [formGroup]="rfqForm" class="space-y-6">
        <!-- Header Information -->
        <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h2 class="font-display text-base font-semibold text-slate-900">1. RFQ Header & Commercial Terms</h2>
          <div class="grid sm:grid-cols-3 gap-4 text-xs">
            <label class="block sm:col-span-2">
              <span class="block font-medium text-slate-700 mb-1">RFQ Title *</span>
              <input type="text" formControlName="title" placeholder="e.g. Precision CNC Machined Gearbox Housing" class="w-full px-3 py-2 border border-slate-300 rounded-md" />
            </label>
            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Project / Program *</span>
              <input type="text" formControlName="project" class="w-full px-3 py-2 border border-slate-300 rounded-md" />
            </label>

            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Plant</span>
              <select formControlName="plantId" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                <option value="PLT-1010">PLT-1010 · Pune Chakan Powertrain</option>
                <option value="PLT-1020">PLT-1020 · Chennai Oragadam Chassis</option>
                <option value="PLT-1030">PLT-1030 · Sanand EV Systems</option>
              </select>
            </label>
            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Department</span>
              <select formControlName="departmentId" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                <option value="DEPT-PC">Powertrain Sourcing</option>
                <option value="DEPT-CH">Chassis & Forgings</option>
                <option value="DEPT-EV">EV Electronics & Thermal</option>
              </select>
            </label>
            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Material Category</span>
              <select formControlName="materialCategory" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                <option value="CNC Machined Castings">CNC Machined Castings</option>
                <option value="Powertrain Forgings">Powertrain Forgings</option>
                <option value="EV Extrusions">EV Extrusions</option>
                <option value="Elastomer Seals & Gaskets">Elastomer Seals & Gaskets</option>
                <option value="Stator Laminations">Stator Laminations</option>
              </select>
            </label>

            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Quotation Deadline *</span>
              <input type="date" formControlName="quotationDeadline" class="w-full px-3 py-2 font-mono border border-slate-300 rounded-md" />
            </label>
            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Required Delivery Date *</span>
              <input type="date" formControlName="requiredDeliveryDate" class="w-full px-3 py-2 font-mono border border-slate-300 rounded-md" />
            </label>
            <div>
              <span class="block font-medium text-slate-700 mb-1">Currency & Payment Terms</span>
              <div class="grid grid-cols-2 gap-2">
                <select formControlName="currency" aria-label="Currency" class="px-2 py-2 border border-slate-300 rounded-md bg-white">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
                <select formControlName="paymentTerms" aria-label="Payment Terms" class="px-2 py-2 border border-slate-300 rounded-md bg-white">
                  <option value="NET45">NET45</option>
                  <option value="NET30">NET30</option>
                  <option value="NET60">NET60</option>
                  <option value="MSME45">MSME45</option>
                </select>
              </div>
            </div>

            <label class="block">
              <span class="block font-medium text-slate-700 mb-1">Incoterms</span>
              <select formControlName="incoterms" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                <option value="DAP">DAP (Plant Gate)</option>
                <option value="DDP">DDP</option>
                <option value="EXW">EXW</option>
                <option value="FOB">FOB</option>
              </select>
            </label>
            <label class="block sm:col-span-2">
              <span class="block font-medium text-slate-700 mb-1">Delivery Location</span>
              <input type="text" formControlName="deliveryLocation" class="w-full px-3 py-2 border border-slate-300 rounded-md" />
            </label>

            <label class="block sm:col-span-3">
              <span class="block font-medium text-slate-700 mb-1">General Terms & Quality Requirements</span>
              <textarea rows="2" formControlName="termsAndConditions" class="w-full px-3 py-2 border border-slate-300 rounded-md"></textarea>
            </label>

            <div class="sm:col-span-3 flex flex-wrap gap-6 pt-2">
              <label class="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" formControlName="allowRevisions" /> Allow quotation revisions prior to deadline
              </label>
              <label class="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" formControlName="requireTechEvalFirst" /> Enforce Technical Evaluation before Commercial Ranking
              </label>
            </div>
          </div>
        </div>

        <!-- Line Items -->
        <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="font-display text-base font-semibold text-slate-900">2. RFQ Line Items & Engineering Specs</h2>
            <button
              type="button"
              (click)="addLineItem()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700"
            >
              <mat-icon class="text-[16px]">add</mat-icon>
              <span>Add Line Item</span>
            </button>
          </div>

          <div formArrayName="items" class="space-y-4">
            @for (itemGroup of itemsArray.controls; track $index; let idx = $index) {
              <div [formGroupName]="idx" class="p-4 rounded-md border border-slate-200 bg-slate-50/40 space-y-3 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-mono font-semibold text-slate-700">Line {{ (idx + 1) * 10 }}</span>
                  @if (itemsArray.length > 1) {
                    <button type="button" (click)="removeLineItem(idx)" class="text-red-700 hover:underline">
                      Remove
                    </button>
                  }
                </div>
                <div class="grid sm:grid-cols-4 gap-3">
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Material / Part Code *</span>
                    <input type="text" formControlName="materialCode" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="block text-slate-600 mb-1">Description *</span>
                    <input type="text" formControlName="description" class="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white" />
                  </label>
                  <div>
                    <span class="block text-slate-600 mb-1">Drawing No & Rev</span>
                    <div class="grid grid-cols-2 gap-1.5">
                      <input type="text" formControlName="drawingNumber" aria-label="Drawing Number" placeholder="DRW-..." class="px-2 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                      <input type="text" formControlName="revisionNumber" aria-label="Revision Number" placeholder="Rev 01" class="px-2 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                    </div>
                  </div>
                  <div>
                    <span class="block text-slate-600 mb-1">Quantity & UOM</span>
                    <div class="grid grid-cols-2 gap-1.5">
                      <input type="number" formControlName="quantity" aria-label="Quantity" class="px-2 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                      <select formControlName="uom" aria-label="Unit of Measure" class="px-2 py-1.5 border border-slate-300 rounded bg-white">
                        <option value="NOS">NOS</option>
                        <option value="SET">SET</option>
                        <option value="KG">KG</option>
                      </select>
                    </div>
                  </div>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Benchmark Rate (₹)</span>
                    <input type="number" formControlName="benchmarkRate" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Prev Purchase Rate (₹)</span>
                    <input type="number" formControlName="previousPurchaseRate" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Technical Specs</span>
                    <input type="text" formControlName="technicalSpecs" class="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white" />
                  </label>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Eligible Active Suppliers Selection -->
        <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 class="font-display text-base font-semibold text-slate-900">
                3. Select Eligible Active Suppliers
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">
                Only suppliers with ACTIVE status are eligible for RFQ invitation.
              </p>
            </div>
            <input
              type="text"
              [formControl]="supplierFilterControl"
              placeholder="Filter by category, city, or name..."
              class="px-3 py-1.5 text-xs border border-slate-300 rounded-md w-64"
            />
          </div>

          <div class="divide-y divide-slate-100 border border-slate-200 rounded-md">
            @for (sup of eligibleSuppliers(); track sup.id) {
              <label class="p-3 flex items-center justify-between gap-4 hover:bg-slate-50 cursor-pointer text-xs">
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    [checked]="selectedSupplierIds().includes(sup.id)"
                    (change)="toggleSupplier(sup.id)"
                  />
                  <div>
                    <p class="font-semibold text-slate-900">{{ sup.companyName }}</p>
                    <p class="text-slate-500">
                      {{ sup.supplierRegNo }} · {{ sup.supplierCategory }} · {{ sup.city }}
                    </p>
                  </div>
                </div>
                <div class="text-right font-mono tabular-nums text-slate-700">
                  <div>Quality {{ sup.qualityScore }}/100</div>
                  <div class="text-[11px] text-emerald-700">ACTIVE</div>
                </div>
              </label>
            }
          </div>
        </div>

        <div class="flex items-center justify-end gap-3">
          <a routerLink="/rfqs" class="px-4 py-2 rounded-md border border-slate-300 text-xs font-medium text-slate-700">
            Cancel
          </a>
          <button
            type="button"
            [disabled]="submitting()"
            (click)="saveRfq(false)"
            class="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800"
          >
            Save as Draft
          </button>
          <button
            type="button"
            [disabled]="submitting()"
            (click)="saveRfq(true)"
            class="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
          >
            <mat-icon class="text-[16px]">send</mat-icon>
            <span>Validate & Submit for RFQ Approval</span>
          </button>
        </div>
      </form>
    </div>
  `,
})
export class RfqCreate implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly router = inject(Router);

  readonly allSuppliers = signal<SupplierApplication[]>([]);
  readonly selectedSupplierIds = signal<string[]>([]);
  readonly supplierQuery = signal('');
  readonly supplierFilterControl = new FormControl('', {nonNullable: true});
  readonly errorMsg = signal('');
  readonly submitting = signal(false);

  readonly eligibleSuppliers = computed(() => {
    const q = this.supplierQuery().trim().toLowerCase();
    return this.allSuppliers()
      .filter((s) => s.status === 'ACTIVE')
      .filter((s) => {
        if (!q) return true;
        return `${s.companyName} ${s.supplierCategory} ${s.city}`.toLowerCase().includes(q);
      });
  });

  readonly rfqForm = new FormGroup({
    title: new FormControl('', {nonNullable: true, validators: [Validators.required]}),
    project: new FormControl('PRJ-X7 Powertrain', {nonNullable: true}),
    plantId: new FormControl('PLT-1010', {nonNullable: true}),
    departmentId: new FormControl('DEPT-PC', {nonNullable: true}),
    materialCategory: new FormControl('CNC Machined Castings', {nonNullable: true}),
    quotationDeadline: new FormControl(this.futureDateInput(10), {nonNullable: true}),
    requiredDeliveryDate: new FormControl(this.futureDateInput(45), {nonNullable: true}),
    currency: new FormControl('INR', {nonNullable: true}),
    paymentTerms: new FormControl('NET45', {nonNullable: true}),
    incoterms: new FormControl('DAP', {nonNullable: true}),
    deliveryLocation: new FormControl('Pune Chakan Plant 1010 – Gate 4', {nonNullable: true}),
    termsAndConditions: new FormControl(
      'PPAP Level 3 required prior to SOP. 100% CMM inspection report mandatory.',
      {nonNullable: true},
    ),
    allowRevisions: new FormControl(true, {nonNullable: true}),
    requireTechEvalFirst: new FormControl(true, {nonNullable: true}),
    items: new FormArray([this.buildLineGroup()]),
  });

  get itemsArray(): FormArray<FormGroup> {
    return this.rfqForm.controls.items as unknown as FormArray<FormGroup>;
  }

  private futureDateInput(days: number): string {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  }

  private buildLineGroup(): FormGroup {
    return new FormGroup({
      materialCode: new FormControl('MAT-PT-60101', {nonNullable: true}),
      description: new FormControl('CNC Machined Flywheel Housing', {nonNullable: true}),
      drawingNumber: new FormControl('DRW-PT-60101', {nonNullable: true}),
      revisionNumber: new FormControl('Rev 01', {nonNullable: true}),
      quantity: new FormControl(500, {nonNullable: true}),
      uom: new FormControl('NOS', {nonNullable: true}),
      benchmarkRate: new FormControl(1650, {nonNullable: true}),
      previousPurchaseRate: new FormControl(1720, {nonNullable: true}),
      technicalSpecs: new FormControl('AlSi12Cu1; CMM bore tolerance H7', {nonNullable: true}),
    });
  }

  ngOnInit(): void {
    this.supplierFilterControl.valueChanges.subscribe((v) => this.supplierQuery.set(v));
    void this.loadSuppliers();
  }

  async loadSuppliers(): Promise<void> {
    const list = await this.api.getSuppliers();
    this.allSuppliers.set(list);
    const activeIds = list.filter((s) => s.status === 'ACTIVE').slice(0, 2).map((s) => s.id);
    this.selectedSupplierIds.set(activeIds);
  }

  addLineItem(): void {
    this.itemsArray.push(this.buildLineGroup());
  }

  removeLineItem(idx: number): void {
    this.itemsArray.removeAt(idx);
  }

  toggleSupplier(id: string): void {
    this.selectedSupplierIds.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  async saveRfq(submitForApproval: boolean): Promise<void> {
    this.errorMsg.set('');
    const val = this.rfqForm.getRawValue();
    if (!val.title.trim()) {
      this.errorMsg.set('RFQ Title is required.');
      return;
    }
    this.submitting.set(true);
    try {
      const res = await this.api.createRfq({
        title: val.title,
        project: val.project,
        plantId: val.plantId,
        departmentId: val.departmentId,
        purchasingGroup: val.plantId === 'PLT-1030' ? 'PG-03' : 'PG-01',
        materialCategory: val.materialCategory,
        currency: val.currency,
        quotationDeadline: new Date(`${val.quotationDeadline}T18:00:00Z`).toISOString(),
        requiredDeliveryDate: new Date(`${val.requiredDeliveryDate}T18:00:00Z`).toISOString(),
        deliveryLocation: val.deliveryLocation,
        paymentTerms: val.paymentTerms,
        incoterms: val.incoterms,
        termsAndConditions: val.termsAndConditions,
        allowRevisions: val.allowRevisions,
        requireTechEvalFirst: val.requireTechEvalFirst,
        invitedSupplierIds: this.selectedSupplierIds(),
        items: val.items.map((it, idx) => ({
          id: `ITEM-${Date.now()}-${idx + 1}`,
          lineNo: (idx + 1) * 10,
          materialCode: String(it['materialCode'] || ''),
          description: String(it['description'] || ''),
          drawingNumber: String(it['drawingNumber'] || ''),
          revisionNumber: String(it['revisionNumber'] || 'Rev 01'),
          quantity: Number(it['quantity'] || 1),
          uom: String(it['uom'] || 'NOS'),
          targetDeliveryDate: new Date(`${val.requiredDeliveryDate}T18:00:00Z`).toISOString(),
          plantId: val.plantId,
          storageLocation: `SL-${val.plantId.replace('PLT-', '')}`,
          benchmarkRate: Number(it['benchmarkRate'] || 0),
          previousPurchaseRate: Number(it['previousPurchaseRate'] || 0),
          technicalSpecs: String(it['technicalSpecs'] || ''),
        })),
        submitForApproval,
      });
      void this.router.navigate(['/rfqs', res.rfq.id]);
    } catch (err: unknown) {
      const httpErr = err as {error?: {error?: string}};
      this.errorMsg.set(httpErr?.error?.error || 'Failed to save RFQ');
    } finally {
      this.submitting.set(false);
    }
  }
}
