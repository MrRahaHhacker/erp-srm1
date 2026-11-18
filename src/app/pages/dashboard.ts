import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {Router, RouterLink} from '@angular/router';
import {AuthStore} from '../core/auth.store';
import {
  formatDateShort,
  formatDateTime,
  formatInr,
  humanStatus,
  statusColorClass,
} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

interface DashboardData {
  role: string;
  approverType?: string;
  adminMetrics: {
    totalUsers: number;
    activeUsers: number;
    totalSuppliers: number;
    activeSuppliers: number;
    pendingSupplierApprovals: number;
    openRfqs: number;
    pendingApprovals: number;
    failedNotifications: number;
    supplierStatusCounts: Record<string, number>;
    rfqStatusCounts: Record<string, number>;
    recentWorkflows: {id: string; ref: string; title: string; stage: string; updatedAt: string}[];
    recentLoginActivities: {
      id: string;
      username: string;
      role?: string;
      status: string;
      ip: string;
      timestamp: string;
    }[];
    auditExceptions: {
      rfqId: string;
      rfqNumber: string;
      supplierName: string;
      reason: string;
      value: number;
    }[];
  };
  buyerMetrics: {
    draftRfqs: number;
    pendingApprovalRfqs: number;
    publishedRfqs: number;
    responsePendingCount: number;
    underEvaluation: number;
    negotiationsInProgress: number;
    rateApprovalsPending: number;
    awardedRfqs: number;
    overdueActivities: number;
    upcomingDeadlines: {
      id: string;
      rfqNumber: string;
      title: string;
      deadline: string;
      quotedCount: number;
      invitedCount: number;
    }[];
    recentResponses: {
      rfqId: string;
      rfqNumber: string;
      supplierName: string;
      totalLandedCost: number;
      submittedAt: string;
      techStatus: string;
    }[];
    totalSavings: number;
    totalAwardedValue: number;
    participationRate: number;
    approvalAging: {rfqId: string; rfqNumber: string; stage: string; hoursPending: number}[];
  };
  approverMetrics: {
    supplierApprovalsPending: number;
    totalSupplierPending: number;
    rfqApprovalsPending: number;
    technicalApprovalsPending: number;
    rateApprovalsPending: number;
    awardedContractsCount: number;
    evaluationFeedback: {
      rfqId: string;
      rfqNumber: string;
      supplierName: string;
      status: string;
      score?: number;
      remarks?: string;
    }[];
  };
  supplierMetrics: {
    profile?: {
      id: string;
      applicationNumber: string;
      supplierRegNo?: string;
      companyName: string;
      status: string;
      sapVendorCode?: string;
      permittedCorrectionSections: string[];
    };
    invitedRfqsCount: number;
    openRfqsCount: number;
    submittedQuotesCount: number;
    activeNegotiationsCount: number;
    awardedCount: number;
  };
  recentAuditLogs: {
    id: string;
    timestamp: string;
    userName: string;
    userRole: string;
    action: string;
    module: string;
    entityNumber: string;
    remarks?: string;
  }[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [RouterLink, MatIconModule],
  template: `
    @if (loading()) {
      <div class="space-y-4">
        <div class="h-8 w-64 bg-slate-200 rounded animate-pulse"></div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="h-24 bg-white border border-slate-200 rounded-lg animate-pulse"></div>
          }
        </div>
      </div>
    } @else if (data(); as d) {
      <div class="space-y-6">
        <!-- Header Row -->
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p class="text-xs font-medium text-slate-500">
              AutoCorp Precision Manufacturing · {{ roleHeading() }}
            </p>
            <h1 class="font-display text-2xl font-semibold text-slate-900 mt-1">
              {{ dashboardTitle() }}
            </h1>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            @if (role() === 'ADMIN' || role() === 'SUPER_ADMIN') {
              <a routerLink="/admin" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap">
                <mat-icon class="text-[16px]">person_add</mat-icon>
                <span>Create User</span>
              </a>
              <a routerLink="/admin" [queryParams]="{tab: 'workflow'}" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap">
                <mat-icon class="text-[16px]">account_tree</mat-icon>
                <span>Configure Workflow</span>
              </a>
              <a routerLink="/suppliers" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap">
                <mat-icon class="text-[16px]">factory</mat-icon>
                <span>Manage Suppliers</span>
              </a>
            } @else if (role() === 'BUYER') {
              <a routerLink="/suppliers" [queryParams]="{new: '1'}" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap">
                <mat-icon class="text-[16px]">domain_add</mat-icon>
                <span>Register Supplier</span>
              </a>
              <a routerLink="/reports" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap">
                <mat-icon class="text-[16px]">download</mat-icon>
                <span>Download Report</span>
              </a>
              <a routerLink="/rfqs/new" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium whitespace-nowrap">
                <mat-icon class="text-[16px]">add</mat-icon>
                <span>Create RFQ</span>
              </a>
            } @else if (role() === 'APPROVER') {
              <a routerLink="/approvals" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap">
                <mat-icon class="text-[16px]">verified_user</mat-icon>
                <span>Open Approvals Queue</span>
              </a>
            } @else if (role() === 'SUPPLIER') {
              <a routerLink="/rfqs" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium whitespace-nowrap">
                <mat-icon class="text-[16px]">request_quote</mat-icon>
                <span>View Invited RFQs</span>
              </a>
            }
          </div>
        </div>

        <!-- ADMIN / SUPER ADMIN / AUDITOR DASHBOARD -->
        @if (role() === 'ADMIN' || role() === 'SUPER_ADMIN' || role() === 'AUDITOR') {
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Users (Active / Total)</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.adminMetrics.activeUsers }} / {{ d.adminMetrics.totalUsers }}
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Suppliers (Active / Total)</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.adminMetrics.activeSuppliers }} / {{ d.adminMetrics.totalSuppliers }}
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Pending Approvals</p>
              <p class="font-mono text-2xl font-semibold text-amber-700 mt-1 tabular-nums">
                {{ d.adminMetrics.pendingApprovals }}
              </p>
              <p class="text-xs text-slate-500 mt-1 tabular-nums">
                {{ d.adminMetrics.pendingSupplierApprovals }} supplier · {{ d.buyerMetrics.rateApprovalsPending }} rate
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Open RFQs / Failed Alerts</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.adminMetrics.openRfqs }} <span class="text-base text-red-700">/ {{ d.adminMetrics.failedNotifications }}</span>
              </p>
            </div>
          </div>

          <!-- Quick Actions Strip for Admin -->
          @if (role() !== 'AUDITOR') {
            <div class="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-3">
              <span class="text-xs font-semibold text-slate-500 mr-2">Quick Actions</span>
              <a routerLink="/admin" [queryParams]="{tab: 'users'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Create User</a>
              <a routerLink="/admin" [queryParams]="{tab: 'users'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Manage Roles</a>
              <a routerLink="/admin" [queryParams]="{tab: 'workflow'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Configure Workflow</a>
              <a routerLink="/admin" [queryParams]="{tab: 'master'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Add Master Data</a>
              <a routerLink="/audit-logs" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">View Audit Logs</a>
              <a routerLink="/suppliers" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Manage Suppliers</a>
            </div>
          }

          <!-- Status Distribution Charts (Clean Proportional Bars) -->
          <div class="grid lg:grid-cols-2 gap-6">
            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <h2 class="font-display text-sm font-semibold text-slate-900 mb-4">
                Supplier Lifecycle Distribution
              </h2>
              <div class="space-y-3">
                @for (entry of objectEntries(d.adminMetrics.supplierStatusCounts); track entry[0]) {
                  <div>
                    <div class="flex justify-between text-xs mb-1">
                      <span class="text-slate-700 font-medium">{{ humanStatus(entry[0]) }}</span>
                      <span class="font-mono text-slate-900 tabular-nums">{{ entry[1] }}</span>
                    </div>
                    <div class="h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        class="h-full bg-slate-800 rounded"
                        [style.width.%]="percentOf(entry[1], d.adminMetrics.totalSuppliers)"
                      ></div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <h2 class="font-display text-sm font-semibold text-slate-900 mb-4">
                RFQ Pipeline Breakdown
              </h2>
              <div class="space-y-3">
                @for (entry of objectEntries(d.adminMetrics.rfqStatusCounts); track entry[0]) {
                  <div>
                    <div class="flex justify-between text-xs mb-1">
                      <span class="text-slate-700 font-medium">{{ humanStatus(entry[0]) }}</span>
                      <span class="font-mono text-slate-900 tabular-nums">{{ entry[1] }}</span>
                    </div>
                    <div class="h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        class="h-full bg-blue-600 rounded"
                        [style.width.%]="percentOf(entry[1], totalRfqsCount())"
                      ></div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>

          <div class="grid lg:grid-cols-2 gap-6">
            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <div class="flex items-center justify-between mb-3">
                <h2 class="font-display text-sm font-semibold text-slate-900">Recently Updated Workflows</h2>
                <a routerLink="/approvals" class="text-xs font-medium text-blue-700 hover:underline">Open Queue</a>
              </div>
              <div class="divide-y divide-slate-100">
                @for (wf of d.adminMetrics.recentWorkflows; track wf.id + wf.ref) {
                  <div class="py-2.5 flex items-center justify-between gap-4 text-xs">
                    <div class="min-w-0">
                      <p class="font-medium text-slate-900 truncate">{{ wf.title }}</p>
                      <p class="text-slate-500 mt-0.5 font-mono">{{ wf.ref }} · {{ humanStatus(wf.stage) }}</p>
                    </div>
                    <span class="text-slate-400 tabular-nums whitespace-nowrap">{{ formatDate(wf.updatedAt) }}</span>
                  </div>
                }
              </div>
            </div>

            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <div class="flex items-center justify-between mb-3">
                <h2 class="font-display text-sm font-semibold text-slate-900">Audit Exceptions (Non-L1 Awards)</h2>
                <a routerLink="/audit-logs" class="text-xs font-medium text-blue-700 hover:underline">Full Audit Trail</a>
              </div>
              @if (d.adminMetrics.auditExceptions.length === 0) {
                <p class="text-xs text-slate-500">No non-L1 exception awards recorded.</p>
              } @else {
                <div class="divide-y divide-slate-100">
                  @for (ex of d.adminMetrics.auditExceptions; track ex.rfqId) {
                    <div class="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div class="min-w-0">
                        <a [routerLink]="['/rfqs', ex.rfqId]" class="font-medium text-blue-700 hover:underline font-mono">
                          {{ ex.rfqNumber }}
                        </a>
                        <span class="text-slate-700"> · {{ ex.supplierName }}</span>
                        <p class="text-amber-700 mt-0.5">Justification: {{ ex.reason }}</p>
                      </div>
                      <span class="font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {{ formatInr(ex.value) }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-5">
            <h2 class="font-display text-sm font-semibold text-slate-900 mb-3">User Login Activity Summary</h2>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500">
                    <th class="py-2 pr-4 font-medium">User</th>
                    <th class="py-2 pr-4 font-medium">Role</th>
                    <th class="py-2 pr-4 font-medium">Outcome</th>
                    <th class="py-2 pr-4 font-medium">Source IP</th>
                    <th class="py-2 font-medium text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (log of d.adminMetrics.recentLoginActivities; track log.id) {
                    <tr class="hover:bg-slate-50">
                      <td class="py-2 pr-4 font-mono text-slate-900">{{ log.username }}</td>
                      <td class="py-2 pr-4 text-slate-600">{{ log.role ? humanStatus(log.role) : '—' }}</td>
                      <td class="py-2 pr-4 font-medium" [class]="statusClass(log.status)">{{ log.status }}</td>
                      <td class="py-2 pr-4 font-mono text-slate-500">{{ log.ip }}</td>
                      <td class="py-2 text-right font-mono text-slate-500 tabular-nums">{{ formatTime(log.timestamp) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- BUYER DASHBOARD -->
        @if (role() === 'BUYER') {
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Published / Draft RFQs</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.buyerMetrics.publishedRfqs }} <span class="text-base text-slate-400">/ {{ d.buyerMetrics.draftRfqs }}</span>
              </p>
              <p class="text-xs text-slate-500 mt-1 tabular-nums">
                {{ d.buyerMetrics.pendingApprovalRfqs }} pending publish approval
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Evaluation & Negotiation</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.buyerMetrics.underEvaluation + d.buyerMetrics.negotiationsInProgress }}
              </p>
              <p class="text-xs text-slate-500 mt-1 tabular-nums">
                {{ d.buyerMetrics.responsePendingCount }} supplier responses pending
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Negotiated Savings</p>
              <p class="font-mono text-2xl font-semibold text-emerald-700 mt-1 tabular-nums">
                {{ formatInr(d.buyerMetrics.totalSavings) }}
              </p>
              <p class="text-xs text-slate-500 mt-1 tabular-nums">
                {{ d.buyerMetrics.awardedRfqs }} awarded · {{ d.buyerMetrics.rateApprovalsPending }} rate approvals
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Supplier Participation</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.buyerMetrics.participationRate }}%
              </p>
              <p class="text-xs mt-1 tabular-nums" [class]="d.buyerMetrics.overdueActivities > 0 ? 'text-red-700' : 'text-slate-500'">
                {{ d.buyerMetrics.overdueActivities }} overdue deadlines
              </p>
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-3">
            <span class="text-xs font-semibold text-slate-500 mr-2">Buyer Quick Actions</span>
            <a routerLink="/rfqs/new" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Create RFQ</a>
            <a routerLink="/suppliers" [queryParams]="{new: '1'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Register Supplier</a>
            <a routerLink="/rfqs/RFQ-102" [queryParams]="{tab: 'comparison'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Open Comparison</a>
            <a routerLink="/rfqs/RFQ-102" [queryParams]="{tab: 'negotiation'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Start Negotiation</a>
            <a routerLink="/rfqs/RFQ-103" [queryParams]="{tab: 'approval'}" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Track Rate Approval</a>
            <a routerLink="/reports" class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700">Download Report</a>
          </div>

          <div class="grid lg:grid-cols-2 gap-6">
            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <h2 class="font-display text-sm font-semibold text-slate-900 mb-3">Upcoming RFQ Deadlines</h2>
              @if (d.buyerMetrics.upcomingDeadlines.length === 0) {
                <p class="text-xs text-slate-500">No published RFQs awaiting deadline.</p>
              } @else {
                <div class="divide-y divide-slate-100">
                  @for (item of d.buyerMetrics.upcomingDeadlines; track item.id) {
                    <div class="py-3 flex items-center justify-between gap-4 text-xs">
                      <div class="min-w-0">
                        <a [routerLink]="['/rfqs', item.id]" class="font-semibold text-blue-700 hover:underline font-mono">
                          {{ item.rfqNumber }}
                        </a>
                        <p class="text-slate-700 truncate mt-0.5">{{ item.title }}</p>
                      </div>
                      <div class="text-right shrink-0">
                        <p class="font-mono text-slate-900 tabular-nums">{{ formatDate(item.deadline) }}</p>
                        <p class="text-slate-500 tabular-nums">{{ item.quotedCount }}/{{ item.invitedCount }} quoted</p>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="bg-white border border-slate-200 rounded-lg p-5">
              <h2 class="font-display text-sm font-semibold text-slate-900 mb-3">Approval Aging & Escalations</h2>
              @if (d.buyerMetrics.approvalAging.length === 0) {
                <p class="text-xs text-slate-500">No rate recommendations pending approval.</p>
              } @else {
                <div class="divide-y divide-slate-100">
                  @for (ag of d.buyerMetrics.approvalAging; track ag.rfqId) {
                    <div class="py-3 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <a [routerLink]="['/rfqs', ag.rfqId]" [queryParams]="{tab: 'approval'}" class="font-semibold text-blue-700 hover:underline font-mono">
                          {{ ag.rfqNumber }}
                        </a>
                        <p class="text-slate-600 mt-0.5">Stage: {{ ag.stage }}</p>
                      </div>
                      <span class="font-mono font-semibold text-amber-700 tabular-nums">
                        {{ ag.hoursPending }}h pending
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-5">
            <h2 class="font-display text-sm font-semibold text-slate-900 mb-3">Recent Supplier Quotation Responses</h2>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500">
                    <th class="py-2 pr-4 font-medium">RFQ</th>
                    <th class="py-2 pr-4 font-medium">Supplier</th>
                    <th class="py-2 pr-4 font-medium">Technical Status</th>
                    <th class="py-2 pr-4 font-medium text-right">Landed Cost</th>
                    <th class="py-2 font-medium text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (resp of d.buyerMetrics.recentResponses; track resp.rfqId + resp.supplierName) {
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 pr-4 font-mono">
                        <a [routerLink]="['/rfqs', resp.rfqId]" class="text-blue-700 hover:underline">{{ resp.rfqNumber }}</a>
                      </td>
                      <td class="py-2.5 pr-4 font-medium text-slate-900">{{ resp.supplierName }}</td>
                      <td class="py-2.5 pr-4" [class]="statusClass(resp.techStatus)">{{ humanStatus(resp.techStatus) }}</td>
                      <td class="py-2.5 pr-4 text-right font-mono font-semibold text-slate-900 tabular-nums">{{ formatInr(resp.totalLandedCost) }}</td>
                      <td class="py-2.5 text-right font-mono text-slate-500 tabular-nums">{{ formatDate(resp.submittedAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- APPROVER DASHBOARD -->
        @if (role() === 'APPROVER') {
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <a routerLink="/approvals" class="bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-4 transition-colors">
              <p class="text-xs text-slate-500">Supplier Approvals Pending</p>
              <p class="font-mono text-2xl font-semibold text-amber-700 mt-1 tabular-nums">
                {{ d.approverMetrics.totalSupplierPending }}
              </p>
              <p class="text-xs text-slate-500 mt-1 tabular-nums">
                {{ d.approverMetrics.supplierApprovalsPending }} assigned to your stage
              </p>
            </a>
            <a routerLink="/approvals" class="bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-4 transition-colors">
              <p class="text-xs text-slate-500">RFQ Publishing Approvals</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.approverMetrics.rfqApprovalsPending }}
              </p>
            </a>
            <a routerLink="/approvals" class="bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-4 transition-colors">
              <p class="text-xs text-slate-500">Technical Evaluations Pending</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.approverMetrics.technicalApprovalsPending }}
              </p>
            </a>
            <a routerLink="/approvals" class="bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-4 transition-colors">
              <p class="text-xs text-slate-500">Rate / Award Approvals</p>
              <p class="font-mono text-2xl font-semibold text-blue-700 mt-1 tabular-nums">
                {{ d.approverMetrics.rateApprovalsPending }}
              </p>
              <p class="text-xs text-slate-500 mt-1 tabular-nums">
                {{ d.approverMetrics.awardedContractsCount }} awards completed
              </p>
            </a>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-5">
            <h2 class="font-display text-sm font-semibold text-slate-900 mb-3">Recent Technical Evaluation Feedback</h2>
            <div class="divide-y divide-slate-100">
              @for (ev of d.approverMetrics.evaluationFeedback; track ev.rfqId + ev.supplierName) {
                <div class="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <a [routerLink]="['/rfqs', ev.rfqId]" [queryParams]="{tab: 'technical'}" class="font-mono font-semibold text-blue-700 hover:underline">
                      {{ ev.rfqNumber }}
                    </a>
                    <span class="font-medium text-slate-900"> · {{ ev.supplierName }}</span>
                    <p class="text-slate-500 mt-0.5">{{ ev.remarks || 'No remarks' }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="font-medium" [class]="statusClass(ev.status)">{{ humanStatus(ev.status) }}</p>
                    @if (ev.score) {
                      <p class="font-mono text-slate-500 tabular-nums">Score: {{ ev.score }}/100</p>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- SUPPLIER DASHBOARD -->
        @if (role() === 'SUPPLIER') {
          @if (d.supplierMetrics.profile; as prof) {
            <div class="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p class="text-xs text-slate-500">
                  {{ prof.applicationNumber }}
                  @if (prof.supplierRegNo) { · {{ prof.supplierRegNo }} }
                  @if (prof.sapVendorCode) { · SAP Vendor {{ prof.sapVendorCode }} }
                </p>
                <h2 class="font-display text-lg font-semibold text-slate-900 mt-0.5">{{ prof.companyName }}</h2>
                <p class="text-xs mt-1 font-medium" [class]="statusClass(prof.status)">
                  Onboarding Status: {{ humanStatus(prof.status) }}
                </p>
              </div>
              <a
                [routerLink]="['/suppliers', prof.id]"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap"
              >
                <mat-icon class="text-[16px]">business</mat-icon>
                <span>Manage Company Profile</span>
              </a>
            </div>
          }

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Invited RFQs</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.supplierMetrics.invitedRfqsCount }}
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Open for Bidding</p>
              <p class="font-mono text-2xl font-semibold text-blue-700 mt-1 tabular-nums">
                {{ d.supplierMetrics.openRfqsCount }}
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Submitted Quotations</p>
              <p class="font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {{ d.supplierMetrics.submittedQuotesCount }}
              </p>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-4">
              <p class="text-xs text-slate-500">Awarded Contracts</p>
              <p class="font-mono text-2xl font-semibold text-emerald-700 mt-1 tabular-nums">
                {{ d.supplierMetrics.awardedCount }}
              </p>
            </div>
          </div>
        }

        <!-- Shared Recent Audit Trail Preview (Internal Roles) -->
        @if (role() !== 'SUPPLIER') {
          <div class="bg-white border border-slate-200 rounded-lg p-5">
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-display text-sm font-semibold text-slate-900">Recent Governance Audit Trail</h2>
              <a routerLink="/audit-logs" class="text-xs font-medium text-blue-700 hover:underline">View All Logs</a>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500">
                    <th class="py-2 pr-4 font-medium">Timestamp</th>
                    <th class="py-2 pr-4 font-medium">Actor</th>
                    <th class="py-2 pr-4 font-medium">Module</th>
                    <th class="py-2 pr-4 font-medium">Action</th>
                    <th class="py-2 pr-4 font-medium">Reference</th>
                    <th class="py-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (log of d.recentAuditLogs.slice(0, 6); track log.id) {
                    <tr class="hover:bg-slate-50">
                      <td class="py-2 pr-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">{{ formatTime(log.timestamp) }}</td>
                      <td class="py-2 pr-4 text-slate-900 font-medium whitespace-nowrap">{{ log.userName }}</td>
                      <td class="py-2 pr-4 text-slate-600 whitespace-nowrap">{{ log.module }}</td>
                      <td class="py-2 pr-4 font-mono text-slate-800 whitespace-nowrap">{{ log.action }}</td>
                      <td class="py-2 pr-4 font-mono text-slate-700 whitespace-nowrap">{{ log.entityNumber }}</td>
                      <td class="py-2 text-slate-500 truncate max-w-xs">{{ log.remarks || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class Dashboard implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly data = signal<DashboardData | null>(null);
  readonly role = this.auth.role;

  readonly roleHeading = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
    return u.approverType ? `${humanStatus(u.role)} · ${humanStatus(u.approverType)}` : humanStatus(u.role);
  });

  readonly dashboardTitle = computed(() => {
    const r = this.role();
    if (r === 'SUPER_ADMIN' || r === 'ADMIN') return 'System Administration & Governance';
    if (r === 'BUYER') return 'Strategic Sourcing & RFQ Control Tower';
    if (r === 'APPROVER') return 'Approver & Reviewer Workspace';
    if (r === 'SUPPLIER') return 'Supplier Collaboration Portal';
    return 'Audit & Compliance Overview';
  });

  readonly totalRfqsCount = computed(() => {
    const counts = this.data()?.adminMetrics?.rfqStatusCounts || {};
    return Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res = (await this.api.getDashboard()) as unknown as DashboardData;
      this.data.set(res);
    } catch {
      void this.router.navigateByUrl('/login');
    } finally {
      this.loading.set(false);
    }
  }

  objectEntries(obj: Record<string, number>): [string, number][] {
    return Object.entries(obj || {});
  }

  percentOf(value: number, total: number): number {
    if (!total) return 0;
    return Math.min(100, Math.round((value / total) * 100));
  }

  formatInr = formatInr;
  formatDate = formatDateShort;
  formatTime = formatDateTime;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
