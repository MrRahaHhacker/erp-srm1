import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import type {Rfq} from '../../shared/srm.types';
import {AuthStore} from '../core/auth.store';
import {formatDateShort, humanStatus, statusColorClass} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-rfqs-list',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p class="text-xs text-slate-500">Phase-1 Strategic Sourcing Pipeline</p>
          <h1 class="font-display text-2xl font-semibold text-slate-900 mt-0.5">RFQ Management</h1>
        </div>
        @if (canCreate()) {
          <a
            routerLink="/rfqs/new"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium whitespace-nowrap"
          >
            <mat-icon class="text-[18px]">add_circle_outline</mat-icon>
            <span>Create New RFQ</span>
          </a>
        }
      </div>

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
            placeholder="Search RFQ number, title, project, or part code..."
            class="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          />
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-sm text-slate-500">Loading RFQs...</div>
        } @else if (filteredRfqs().length === 0) {
          <div class="p-10 text-center">
            <p class="text-sm font-medium text-slate-900">No RFQs match the selected filter</p>
            <p class="text-xs text-slate-500 mt-1">Try switching status filters or create a new sourcing event.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th class="py-3 px-4 font-medium">RFQ Number</th>
                  <th class="py-3 px-4 font-medium">Title & Project</th>
                  <th class="py-3 px-4 font-medium">Category & Plant</th>
                  <th class="py-3 px-4 font-medium text-right">Line Items</th>
                  <th class="py-3 px-4 font-medium">Deadline</th>
                  <th class="py-3 px-4 font-medium">Stage Status</th>
                  <th class="py-3 px-4 font-medium text-right">Workspace</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (r of filteredRfqs(); track r.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      <a [routerLink]="['/rfqs', r.id]" class="text-blue-700 hover:underline">{{ r.rfqNumber }}</a>
                      @if (r.awardNumber) {
                        <div class="text-[11px] text-emerald-700">{{ r.awardNumber }}</div>
                      }
                    </td>
                    <td class="py-3 px-4">
                      <a [routerLink]="['/rfqs', r.id]" class="font-semibold text-slate-900 hover:text-blue-700">
                        {{ r.title }}
                      </a>
                      <div class="text-[11px] text-slate-500">{{ r.project }} · {{ r.incoterms }} · {{ r.paymentTerms }}</div>
                    </td>
                    <td class="py-3 px-4 text-slate-600">
                      <div>{{ r.materialCategory }}</div>
                      <div class="text-[11px] text-slate-500 font-mono">{{ r.plantId }} · {{ r.purchasingGroup }}</div>
                    </td>
                    <td class="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {{ r.items.length }} items
                    </td>
                    <td class="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {{ formatDate(r.quotationDeadline) }}
                    </td>
                    <td class="py-3 px-4 font-medium whitespace-nowrap" [class]="statusClass(r.status)">
                      {{ humanStatus(r.status) }}
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <a
                        [routerLink]="['/rfqs', r.id]"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700"
                      >
                        <span>Open RFQ</span>
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
  `,
})
export class RfqsList implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly auth = inject(AuthStore);

  readonly loading = signal(true);
  readonly rfqs = signal<Rfq[]>([]);
  readonly statusFilter = signal('ALL');
  readonly searchTerm = signal('');
  readonly searchControl = new FormControl('', {nonNullable: true});

  readonly statusTabs = [
    {key: 'ALL', label: 'All RFQs'},
    {key: 'DRAFT', label: 'Draft / Pending'},
    {key: 'PUBLISHED', label: 'Published / Open'},
    {key: 'ACTIVE_SOURCING', label: 'Evaluation & Negotiation'},
    {key: 'RATE_APPROVAL', label: 'Rate Approval'},
    {key: 'AWARDED', label: 'Awarded / Closed'},
  ];

  readonly canCreate = computed(() => {
    const r = this.auth.role();
    return r === 'BUYER' || r === 'ADMIN' || r === 'SUPER_ADMIN';
  });

  readonly filteredRfqs = computed(() => {
    const f = this.statusFilter();
    const q = this.searchTerm().trim().toLowerCase();
    return this.rfqs().filter((r) => {
      if (f === 'DRAFT' && !['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(r.status)) return false;
      if (f === 'PUBLISHED' && r.status !== 'PUBLISHED') return false;
      if (f === 'ACTIVE_SOURCING' && !['EVALUATION', 'NEGOTIATION'].includes(r.status)) return false;
      if (f === 'RATE_APPROVAL' && !['RATE_APPROVAL', 'AWARD_APPROVED'].includes(r.status)) return false;
      if (f === 'AWARDED' && !['AWARDED', 'CLOSED'].includes(r.status)) return false;
      if (q) {
        const hay = `${r.rfqNumber} ${r.title} ${r.project} ${r.materialCategory} ${r.items.map((i) => i.materialCode).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.searchTerm.set(v));
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rfqs.set(await this.api.getRfqs());
    } finally {
      this.loading.set(false);
    }
  }

  formatDate = formatDateShort;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
