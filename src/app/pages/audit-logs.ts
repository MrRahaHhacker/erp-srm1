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
import type {AuditLog, LoginActivity} from '../../shared/srm.types';
import {downloadCsv, formatDateTime, humanStatus, statusColorClass} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-audit-logs',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p class="text-xs text-slate-500">SOX & Statutory Procurement Governance</p>
          <h1 class="font-display text-2xl font-semibold text-slate-900 mt-0.5">
            Audit Trail & Login Security Logs
          </h1>
        </div>
        <button
          type="button"
          (click)="exportLogs()"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap"
        >
          <mat-icon class="text-[16px]">download</mat-icon>
          <span>Export Audit CSV</span>
        </button>
      </div>

      <div class="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            (click)="viewMode.set('AUDIT')"
            class="px-3 py-1.5 text-xs font-medium rounded"
            [class.bg-white]="viewMode() === 'AUDIT'"
            [class.text-slate-900]="viewMode() === 'AUDIT'"
            [class.text-slate-600]="viewMode() !== 'AUDIT'"
          >
            Transaction Audit Trail ({{ filteredAudit().length }})
          </button>
          <button
            type="button"
            (click)="viewMode.set('LOGIN')"
            class="px-3 py-1.5 text-xs font-medium rounded"
            [class.bg-white]="viewMode() === 'LOGIN'"
            [class.text-slate-900]="viewMode() === 'LOGIN'"
            [class.text-slate-600]="viewMode() !== 'LOGIN'"
          >
            Login Activity History ({{ loginLogs().length }})
          </button>
        </div>

        <input
          type="text"
          [formControl]="searchControl"
          placeholder="Filter by user, action, module, or reference..."
          class="px-3 py-1.5 text-xs border border-slate-300 rounded-md w-72"
        />
      </div>

      @if (viewMode() === 'AUDIT') {
        <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th class="py-3 px-4 font-medium">Timestamp</th>
                  <th class="py-3 px-4 font-medium">Actor & Role</th>
                  <th class="py-3 px-4 font-medium">Module</th>
                  <th class="py-3 px-4 font-medium">Action</th>
                  <th class="py-3 px-4 font-medium">Reference</th>
                  <th class="py-3 px-4 font-medium">Transition</th>
                  <th class="py-3 px-4 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (log of filteredAudit(); track log.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">{{ formatTime(log.timestamp) }}</td>
                    <td class="py-2.5 px-4">
                      <div class="font-medium text-slate-900">{{ log.userName }}</div>
                      <div class="text-[11px] text-slate-500">{{ humanStatus(log.userRole) }}</div>
                    </td>
                    <td class="py-2.5 px-4 text-slate-700 whitespace-nowrap">{{ log.module }}</td>
                    <td class="py-2.5 px-4 font-mono text-slate-900 whitespace-nowrap">{{ log.action }}</td>
                    <td class="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">{{ log.entityNumber }}</td>
                    <td class="py-2.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {{ log.previousState || '—' }} → {{ log.newState || '—' }}
                    </td>
                    <td class="py-2.5 px-4 text-slate-600 max-w-xs truncate">{{ log.remarks || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th class="py-3 px-4 font-medium">Timestamp</th>
                  <th class="py-3 px-4 font-medium">Username / Email</th>
                  <th class="py-3 px-4 font-medium">Role</th>
                  <th class="py-3 px-4 font-medium">Status</th>
                  <th class="py-3 px-4 font-medium">IP Address</th>
                  <th class="py-3 px-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (l of loginLogs(); track l.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">{{ formatTime(l.timestamp) }}</td>
                    <td class="py-2.5 px-4 font-mono text-slate-900">{{ l.username }}</td>
                    <td class="py-2.5 px-4 text-slate-600">{{ l.role ? humanStatus(l.role) : '—' }}</td>
                    <td class="py-2.5 px-4 font-medium" [class]="statusClass(l.status)">{{ l.status }}</td>
                    <td class="py-2.5 px-4 font-mono text-slate-500">{{ l.ip }}</td>
                    <td class="py-2.5 px-4 text-slate-600">{{ l.reason || l.userAgent }}</td>
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
export class AuditLogs implements OnInit {
  private readonly api = inject(SrmApi);
  readonly viewMode = signal<'AUDIT' | 'LOGIN'>('AUDIT');
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly loginLogs = signal<LoginActivity[]>([]);
  readonly searchTerm = signal('');
  readonly searchControl = new FormControl('', {nonNullable: true});

  readonly filteredAudit = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    if (!q) return this.auditLogs();
    return this.auditLogs().filter((l) =>
      `${l.userName} ${l.action} ${l.module} ${l.entityNumber} ${l.remarks || ''}`
        .toLowerCase()
        .includes(q),
    );
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.searchTerm.set(v));
    void this.load();
  }

  async load(): Promise<void> {
    const [audits, logins] = await Promise.all([
      this.api.getAuditLogs(),
      this.api.getLoginActivities(),
    ]);
    this.auditLogs.set(audits);
    this.loginLogs.set(logins);
  }

  exportLogs(): void {
    downloadCsv(
      'SRM_Audit_Trail.csv',
      ['Timestamp', 'Actor', 'Role', 'Module', 'Action', 'Entity', 'Prev State', 'New State', 'Remarks', 'IP'],
      this.filteredAudit().map((l) => [
        l.timestamp,
        l.userName,
        l.userRole,
        l.module,
        l.action,
        l.entityNumber,
        l.previousState || '',
        l.newState || '',
        l.remarks || '',
        l.ipAddress,
      ]),
    );
  }

  formatTime = formatDateTime;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
