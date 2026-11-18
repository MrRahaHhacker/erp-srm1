import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {formatDateTime, formatInr, humanStatus} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

interface InboxData {
  supplierTasks: {
    id: string;
    referenceNumber: string;
    title: string;
    stage: string;
    assignedApproverType: string;
    updatedAt: string;
  }[];
  rfqTasks: {
    id: string;
    referenceNumber: string;
    title: string;
    stage: string;
    assignedApproverType: string;
    updatedAt: string;
  }[];
  techEvalTasks: {
    id: string;
    rfqId: string;
    referenceNumber: string;
    title: string;
    stage: string;
    assignedApproverType: string;
    updatedAt: string;
  }[];
  rateTasks: {
    id: string;
    referenceNumber: string;
    title: string;
    stage: string;
    assignedApproverType: string;
    isL1: boolean;
    totalBusinessValue: number;
    updatedAt: string;
  }[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-approvals',
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <div>
        <p class="text-xs text-slate-500">Multi-Stage Governance Queue</p>
        <h1 class="font-display text-2xl font-semibold text-slate-900 mt-0.5">Approvals Inbox</h1>
      </div>

      @if (loading()) {
        <div class="p-8 text-sm text-slate-500">Loading assigned approvals...</div>
      } @else if (inbox(); as data) {
        <div class="grid lg:grid-cols-2 gap-6">
          <!-- Rate & Award Approvals -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="font-display text-base font-semibold text-slate-900">
                Rate & Award Approvals ({{ data.rateTasks.length }})
              </h2>
            </div>
            @if (data.rateTasks.length === 0) {
              <p class="text-xs text-slate-500">No pending rate recommendations.</p>
            } @else {
              <div class="divide-y divide-slate-100">
                @for (t of data.rateTasks; track t.id) {
                  <div class="py-3 flex items-center justify-between gap-4 text-xs">
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-900 truncate">{{ t.title }}</p>
                      <p class="text-slate-500 mt-0.5 font-mono">
                        {{ t.referenceNumber }} · {{ t.stage }} · {{ t.isL1 ? 'L1' : 'Non-L1 Exception' }}
                      </p>
                      <p class="text-slate-400 mt-0.5">Role: {{ humanStatus(t.assignedApproverType) }}</p>
                    </div>
                    <div class="text-right shrink-0 space-y-1">
                      <p class="font-mono font-semibold text-slate-900 tabular-nums">{{ formatInr(t.totalBusinessValue) }}</p>
                      <a
                        [routerLink]="['/rfqs', t.id]"
                        [queryParams]="{tab: 'approval'}"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-white font-medium"
                      >
                        <span>Review</span>
                        <mat-icon class="text-[14px]">arrow_forward</mat-icon>
                      </a>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Supplier Onboarding Approvals -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h2 class="font-display text-base font-semibold text-slate-900">
              Supplier Onboarding Approvals ({{ data.supplierTasks.length }})
            </h2>
            @if (data.supplierTasks.length === 0) {
              <p class="text-xs text-slate-500">No supplier onboarding applications pending review.</p>
            } @else {
              <div class="divide-y divide-slate-100">
                @for (t of data.supplierTasks; track t.id) {
                  <div class="py-3 flex items-center justify-between gap-4 text-xs">
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-900 truncate">{{ t.title }}</p>
                      <p class="text-slate-500 mt-0.5 font-mono">
                        {{ t.referenceNumber }} · {{ humanStatus(t.stage) }}
                      </p>
                      <p class="text-slate-400 mt-0.5">Assigned: {{ humanStatus(t.assignedApproverType) }}</p>
                    </div>
                    <a
                      [routerLink]="['/suppliers', t.id]"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 font-medium text-slate-800 shrink-0"
                    >
                      <span>Open Dossier</span>
                      <mat-icon class="text-[14px]">chevron_right</mat-icon>
                    </a>
                  </div>
                }
              </div>
            }
          </div>

          <!-- RFQ Publishing Approvals -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h2 class="font-display text-base font-semibold text-slate-900">
              RFQ Publishing Approvals ({{ data.rfqTasks.length }})
            </h2>
            @if (data.rfqTasks.length === 0) {
              <p class="text-xs text-slate-500">No RFQs awaiting publishing approval.</p>
            } @else {
              <div class="divide-y divide-slate-100">
                @for (t of data.rfqTasks; track t.id) {
                  <div class="py-3 flex items-center justify-between gap-4 text-xs">
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-900 truncate">{{ t.title }}</p>
                      <p class="text-slate-500 mt-0.5 font-mono">{{ t.referenceNumber }} · {{ t.stage }}</p>
                    </div>
                    <a
                      [routerLink]="['/rfqs', t.id]"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 font-medium text-slate-800 shrink-0"
                    >
                      <span>Review RFQ</span>
                      <mat-icon class="text-[14px]">chevron_right</mat-icon>
                    </a>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Technical Evaluation Queue -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h2 class="font-display text-base font-semibold text-slate-900">
              Technical Evaluations Pending ({{ data.techEvalTasks.length }})
            </h2>
            @if (data.techEvalTasks.length === 0) {
              <p class="text-xs text-slate-500">No quotations pending technical review.</p>
            } @else {
              <div class="divide-y divide-slate-100">
                @for (t of data.techEvalTasks; track t.id) {
                  <div class="py-3 flex items-center justify-between gap-4 text-xs">
                    <div class="min-w-0">
                      <p class="font-semibold text-slate-900 truncate">{{ t.title }}</p>
                      <p class="text-slate-500 mt-0.5 font-mono">{{ t.referenceNumber }}</p>
                    </div>
                    <a
                      [routerLink]="['/rfqs', t.rfqId]"
                      [queryParams]="{tab: 'technical'}"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 font-medium text-slate-800 shrink-0"
                    >
                      <span>Evaluate</span>
                      <mat-icon class="text-[14px]">chevron_right</mat-icon>
                    </a>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class Approvals implements OnInit {
  private readonly api = inject(SrmApi);
  readonly loading = signal(true);
  readonly inbox = signal<InboxData | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res = (await this.api.getApprovalsInbox()) as unknown as InboxData;
      this.inbox.set(res);
    } finally {
      this.loading.set(false);
    }
  }

  formatInr = formatInr;
  formatTime = formatDateTime;
  humanStatus = humanStatus;
}
