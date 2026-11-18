import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {downloadCsv, formatInr, humanStatus, statusColorClass} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

interface ReportsData {
  savingsReport: {
    rfqNumber: string;
    title: string;
    plantId: string;
    supplierName: string;
    isL1: boolean;
    nonL1Justification: string;
    originalQuotedTotal: number;
    finalSettledTotal: number;
    absoluteSaving: number;
    savingPercent: number;
    benchmarkVariancePercent: number;
    status: string;
  }[];
  supplierPerformance: {
    supplierRegNo: string;
    companyName: string;
    category: string;
    status: string;
    qualityScore: number;
    performanceScore: number;
    sapVendorCode: string;
    rfqsInvited: number;
    quotesSubmitted: number;
  }[];
  summary: {
    totalOriginalValue: number;
    totalSettledValue: number;
    totalSavings: number;
    nonL1Count: number;
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-reports',
  imports: [MatIconModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p class="text-xs text-slate-500">Executive Procurement Analytics</p>
          <h1 class="font-display text-2xl font-semibold text-slate-900 mt-0.5">Reports & Savings</h1>
        </div>
        @if (data()) {
          <button
            type="button"
            (click)="exportSavingsCsv()"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap"
          >
            <mat-icon class="text-[16px]">download</mat-icon>
            <span>Export Savings CSV</span>
          </button>
        }
      </div>

      @if (data(); as d) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs text-slate-500">Original Quoted Value</p>
            <p class="font-mono text-xl font-semibold text-slate-900 tabular-nums mt-1">{{ formatInr(d.summary.totalOriginalValue) }}</p>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs text-slate-500">Final Settled Value</p>
            <p class="font-mono text-xl font-semibold text-slate-900 tabular-nums mt-1">{{ formatInr(d.summary.totalSettledValue) }}</p>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs text-slate-500">Total Negotiated Savings</p>
            <p class="font-mono text-xl font-semibold text-emerald-700 tabular-nums mt-1">{{ formatInr(d.summary.totalSavings) }}</p>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs text-slate-500">Non-L1 Exception Awards</p>
            <p class="font-mono text-xl font-semibold text-amber-700 tabular-nums mt-1">{{ d.summary.nonL1Count }}</p>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-lg p-5">
          <h2 class="font-display text-base font-semibold text-slate-900 mb-3">Sourcing Savings & Benchmark Variance Report</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500">
                  <th class="py-2 pr-4 font-medium">RFQ</th>
                  <th class="py-2 pr-4 font-medium">Recommended Supplier</th>
                  <th class="py-2 pr-4 font-medium">Selection</th>
                  <th class="py-2 pr-4 font-medium text-right">Original</th>
                  <th class="py-2 pr-4 font-medium text-right">Settled</th>
                  <th class="py-2 pr-4 font-medium text-right">Saving</th>
                  <th class="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 tabular-nums">
                @for (r of d.savingsReport; track r.rfqNumber) {
                  <tr>
                    <td class="py-2.5 pr-4 font-mono font-semibold text-slate-900">{{ r.rfqNumber }}</td>
                    <td class="py-2.5 pr-4 text-slate-900">{{ r.supplierName }}</td>
                    <td class="py-2.5 pr-4">
                      @if (r.isL1) {
                        <span class="text-emerald-700 font-medium">L1</span>
                      } @else {
                        <span class="text-amber-700 font-medium">Non-L1 ({{ r.nonL1Justification }})</span>
                      }
                    </td>
                    <td class="py-2.5 pr-4 text-right font-mono">{{ formatInr(r.originalQuotedTotal) }}</td>
                    <td class="py-2.5 pr-4 text-right font-mono font-semibold">{{ formatInr(r.finalSettledTotal) }}</td>
                    <td class="py-2.5 pr-4 text-right font-mono text-emerald-700">{{ formatInr(r.absoluteSaving) }} ({{ r.savingPercent }}%)</td>
                    <td class="py-2.5 text-right font-medium" [class]="statusClass(r.status)">{{ humanStatus(r.status) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-lg p-5">
          <h2 class="font-display text-base font-semibold text-slate-900 mb-3">Supplier Participation & Performance Matrix</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500">
                  <th class="py-2 pr-4 font-medium">Reg No</th>
                  <th class="py-2 pr-4 font-medium">Company</th>
                  <th class="py-2 pr-4 font-medium">Category</th>
                  <th class="py-2 pr-4 font-medium">SAP Vendor</th>
                  <th class="py-2 pr-4 font-medium text-right">Quality</th>
                  <th class="py-2 pr-4 font-medium text-right">RFQs / Quotes</th>
                  <th class="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 tabular-nums">
                @for (sp of d.supplierPerformance; track sp.supplierRegNo) {
                  <tr>
                    <td class="py-2.5 pr-4 font-mono text-slate-700">{{ sp.supplierRegNo }}</td>
                    <td class="py-2.5 pr-4 font-medium text-slate-900">{{ sp.companyName }}</td>
                    <td class="py-2.5 pr-4 text-slate-600">{{ sp.category }}</td>
                    <td class="py-2.5 pr-4 font-mono text-slate-700">{{ sp.sapVendorCode }}</td>
                    <td class="py-2.5 pr-4 text-right font-mono">{{ sp.qualityScore }}/100</td>
                    <td class="py-2.5 pr-4 text-right font-mono">{{ sp.rfqsInvited }} / {{ sp.quotesSubmitted }}</td>
                    <td class="py-2.5 text-right font-medium" [class]="statusClass(sp.status)">{{ humanStatus(sp.status) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class Reports implements OnInit {
  private readonly api = inject(SrmApi);
  readonly data = signal<ReportsData | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const res = (await this.api.getReports()) as unknown as ReportsData;
    this.data.set(res);
  }

  exportSavingsCsv(): void {
    const d = this.data();
    if (!d) return;
    downloadCsv(
      'SRM_Savings_Report.csv',
      ['RFQ Number', 'Supplier', 'L1/Non-L1', 'Justification', 'Original Quoted', 'Final Settled', 'Absolute Saving', 'Saving %', 'Status'],
      d.savingsReport.map((r) => [
        r.rfqNumber,
        r.supplierName,
        r.isL1 ? 'L1' : 'Non-L1',
        r.nonL1Justification,
        r.originalQuotedTotal,
        r.finalSettledTotal,
        r.absoluteSaving,
        r.savingPercent,
        r.status,
      ]),
    );
  }

  formatInr = formatInr;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
