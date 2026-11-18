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
} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {AuthStore} from '../core/auth.store';
import {
  downloadCsv,
  formatDateShort,
  formatDateTime,
  formatInr,
  formatInrExact,
  humanStatus,
  statusColorClass,
} from '../core/formatters';
import {type RfqDetailResponse, SrmApi} from '../core/srm-api';

type WorkspaceTab =
  | 'overview'
  | 'quotation'
  | 'technical'
  | 'comparison'
  | 'negotiation'
  | 'approval';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-rfq-detail',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    @if (loading()) {
      <div class="p-8 text-sm text-slate-500">Loading RFQ workspace...</div>
    } @else if (detail(); as d) {
      <div class="space-y-6">
        <!-- Header & Lifecycle Actions -->
        <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <a routerLink="/rfqs" class="hover:text-slate-900">RFQ Management</a>
              <span aria-hidden="true">/</span>
              <span class="font-mono font-semibold text-slate-800">{{ d.rfq.rfqNumber }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ d.rfq.project }}</span>
              @if (d.rfq.awardNumber) {
                <span aria-hidden="true">·</span>
                <span class="font-mono font-semibold text-emerald-700">{{ d.rfq.awardNumber }}</span>
              }
            </div>
            <h1 class="font-display text-2xl font-semibold text-slate-900 mt-1">
              {{ d.rfq.title }}
            </h1>
            <p class="text-xs mt-1 font-medium" [class]="statusClass(d.rfq.status)">
              Stage: {{ humanStatus(d.rfq.status) }}
              <span class="text-slate-400 font-normal">
                · Deadline: {{ formatDate(d.rfq.quotationDeadline) }} · {{ d.rfq.plantId }} · {{ d.rfq.incoterms }} · {{ d.rfq.paymentTerms }}
              </span>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            @if (isBuyerOrAdmin() && d.rfq.status === 'DRAFT') {
              <button
                type="button"
                (click)="submitForApproval()"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
              >
                <mat-icon class="text-[16px]">send</mat-icon>
                <span>Submit for RFQ Approval</span>
              </button>
            }
            @if (isBuyerOrAdmin() && d.rfq.status === 'APPROVED') {
              <button
                type="button"
                (click)="publishRfq()"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium"
              >
                <mat-icon class="text-[16px]">publish</mat-icon>
                <span>Publish RFQ to Suppliers</span>
              </button>
            }
            @if (isBuyerOrAdmin() && d.rfq.status === 'PUBLISHED') {
              <button
                type="button"
                (click)="showExtendBox.set(!showExtendBox())"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
              >
                <mat-icon class="text-[16px]">schedule</mat-icon>
                <span>Extend Deadline</span>
              </button>
              <button
                type="button"
                (click)="startEvaluation()"
                class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
              >
                <mat-icon class="text-[16px]">fact_check</mat-icon>
                <span>Start Evaluation</span>
              </button>
            }
            @if (isBuyerOrAdmin() && d.rfq.status === 'AWARDED') {
              <button
                type="button"
                (click)="closeRfq()"
                class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800"
              >
                <mat-icon class="text-[16px]">lock</mat-icon>
                <span>Close Phase-1 RFQ</span>
              </button>
            }
          </div>
        </div>

        @if (statusMessage()) {
          <div class="p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900">
            {{ statusMessage() }}
          </div>
        }

        @if (errorMessage()) {
          <div class="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
            {{ errorMessage() }}
          </div>
        }

        <!-- Deadline Extension Inline Bar -->
        @if (showExtendBox()) {
          <form [formGroup]="extendForm" (ngSubmit)="submitExtendDeadline()" class="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-3 text-xs">
            <label class="block">
              <span class="block text-slate-600 mb-1">New Deadline Date</span>
              <input type="date" formControlName="newDeadline" class="px-3 py-1.5 font-mono border border-slate-300 rounded-md" />
            </label>
            <label class="block flex-1 min-w-[200px]">
              <span class="block text-slate-600 mb-1">Reason for Extension (notifies all invited suppliers)</span>
              <input type="text" formControlName="reason" placeholder="e.g. Drawing Rev 04 clarification issued" class="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
            </label>
            <button type="submit" class="px-4 py-1.5 rounded-md bg-slate-900 text-white font-medium">
              Confirm Extension
            </button>
          </form>
        }

        <!-- Segmented Workspace Tabs -->
        <div class="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          @for (t of visibleTabs(); track t.key) {
            <button
              type="button"
              (click)="activeTab.set(t.key)"
              class="px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              [class.bg-white]="activeTab() === t.key"
              [class.text-slate-900]="activeTab() === t.key"
              [class.shadow-xs]="activeTab() === t.key"
              [class.text-slate-600]="activeTab() !== t.key"
            >
              {{ t.label }}
            </button>
          }
        </div>

        <!-- TAB 1: OVERVIEW, APPROVALS & CLARIFICATIONS -->
        @if (activeTab() === 'overview') {
          <div class="grid lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
              <!-- RFQ Publishing Approval Banner (if PENDING_APPROVAL) -->
              @if (d.rfq.status === 'PENDING_APPROVAL' && isApproverOrAdmin()) {
                <div class="bg-white border border-amber-300 rounded-lg p-5 space-y-3">
                  <h2 class="font-display text-sm font-semibold text-slate-900">
                    RFQ Publishing Approval Required
                  </h2>
                  <p class="text-xs text-slate-600">
                    Stage: {{ d.rfq.rfqApprovalChain[d.rfq.currentRfqApprovalStep]?.label || 'SCM Review' }}
                  </p>
                  <div class="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      [formControl]="rfqApprovalRemarks"
                      placeholder="Approval or send-back remarks..."
                      class="flex-1 min-w-[200px] px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                    />
                    <button type="button" (click)="actOnRfqApproval('APPROVE')" class="px-3.5 py-1.5 rounded bg-emerald-700 text-white text-xs font-medium">Approve</button>
                    <button type="button" (click)="actOnRfqApproval('SEND_BACK')" class="px-3.5 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs font-medium">Send Back</button>
                    <button type="button" (click)="actOnRfqApproval('REJECT')" class="px-3.5 py-1.5 rounded border border-red-300 text-red-700 text-xs font-medium">Reject</button>
                  </div>
                </div>
              }

              <!-- Line Items Table -->
              <div class="bg-white border border-slate-200 rounded-lg p-5">
                <h2 class="font-display text-base font-semibold text-slate-900 mb-3">
                  RFQ Line Items & Engineering Scope
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 text-slate-500">
                        <th class="py-2 pr-3 font-medium">Line</th>
                        <th class="py-2 pr-3 font-medium">Material Code</th>
                        <th class="py-2 pr-3 font-medium">Description & Specs</th>
                        <th class="py-2 pr-3 font-medium">Drawing / Rev</th>
                        <th class="py-2 pr-3 font-medium text-right">Qty</th>
                        @if (!isSupplier()) {
                          <th class="py-2 pr-3 font-medium text-right">Benchmark</th>
                          <th class="py-2 font-medium text-right">Prev Rate</th>
                        }
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      @for (it of d.rfq.items; track it.id) {
                        <tr>
                          <td class="py-2.5 pr-3 font-mono text-slate-500">{{ it.lineNo }}</td>
                          <td class="py-2.5 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">{{ it.materialCode }}</td>
                          <td class="py-2.5 pr-3">
                            <div class="font-medium text-slate-900">{{ it.description }}</div>
                            <div class="text-[11px] text-slate-500">{{ it.technicalSpecs }}</div>
                          </td>
                          <td class="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">{{ it.drawingNumber }} · {{ it.revisionNumber }}</td>
                          <td class="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">{{ it.quantity }} {{ it.uom }}</td>
                          @if (!isSupplier()) {
                            <td class="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700">{{ formatInr(it.benchmarkRate) }}</td>
                            <td class="py-2.5 text-right font-mono tabular-nums text-slate-500">{{ formatInr(it.previousPurchaseRate) }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Clarifications Q&A -->
              <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <h2 class="font-display text-base font-semibold text-slate-900">Technical & Commercial Clarifications</h2>
                @if (d.rfq.clarifications.length === 0) {
                  <p class="text-xs text-slate-500">No clarifications raised on this RFQ yet.</p>
                } @else {
                  <div class="space-y-3">
                    @for (clr of d.rfq.clarifications; track clr.id) {
                      <div class="p-3.5 rounded-md border border-slate-200 bg-slate-50/50 text-xs space-y-1.5">
                        <div class="flex items-center justify-between">
                          <span class="font-semibold text-slate-900">{{ clr.supplierName }}</span>
                          <span class="font-mono text-[11px] text-slate-500">{{ clr.status }} · {{ formatTime(clr.raisedAt) }}</span>
                        </div>
                        <p class="text-slate-800">Q: {{ clr.question }}</p>
                        @if (clr.answer) {
                          <p class="text-emerald-800 pt-1 border-t border-slate-200">
                            A ({{ clr.answeredBy }}): {{ clr.answer }}
                          </p>
                        } @else if (!isSupplier() && !isAuditor()) {
                          <div class="flex gap-2 pt-2">
                            <input
                              type="text"
                              [formControl]="clarificationAnswerControl"
                              placeholder="Enter official clarification response..."
                              class="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                            <button
                              type="button"
                              (click)="answerClarification(clr.id)"
                              class="px-3 py-1.5 rounded bg-slate-900 text-white font-medium"
                            >
                              Reply
                            </button>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }

                @if (isSupplier()) {
                  <div class="pt-3 border-t border-slate-200 flex gap-2 text-xs">
                    <input
                      type="text"
                      [formControl]="clarificationQuestionControl"
                      placeholder="Raise a technical or commercial clarification..."
                      class="flex-1 px-3 py-2 border border-slate-300 rounded-md"
                    />
                    <button
                      type="button"
                      (click)="raiseClarification()"
                      class="px-4 py-2 rounded-md bg-slate-900 text-white font-medium whitespace-nowrap"
                    >
                      Raise Query
                    </button>
                  </div>
                }
              </div>
            </div>

            <!-- Right Metadata & Invited Suppliers -->
            <div class="space-y-6">
              <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-3">
                <h2 class="font-display text-sm font-semibold text-slate-900">RFQ Terms & Contacts</h2>
                <div class="space-y-2 text-slate-600">
                  <div class="flex justify-between"><span>Delivery Location</span><span class="text-slate-900 font-medium text-right">{{ d.rfq.deliveryLocation }}</span></div>
                  <div class="flex justify-between"><span>Required Delivery</span><span class="font-mono text-slate-900">{{ formatDate(d.rfq.requiredDeliveryDate) }}</span></div>
                  <div class="flex justify-between"><span>Incoterms / Terms</span><span class="font-mono text-slate-900">{{ d.rfq.incoterms }} · {{ d.rfq.paymentTerms }}</span></div>
                  <div class="flex justify-between"><span>Tech Evaluation First</span><span class="text-slate-900">{{ d.rfq.requireTechEvalFirst ? 'Yes' : 'No' }}</span></div>
                  <div class="flex justify-between"><span>Revisions Allowed</span><span class="text-slate-900">{{ d.rfq.allowRevisions ? 'Yes' : 'No' }}</span></div>
                </div>
                <div class="pt-2 border-t border-slate-100">
                  <p class="text-slate-500 mb-1">Terms & Conditions</p>
                  <p class="text-slate-700 leading-relaxed">{{ d.rfq.termsAndConditions }}</p>
                </div>
              </div>

              @if (!isSupplier()) {
                <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-3">
                  <h2 class="font-display text-sm font-semibold text-slate-900">Supplier Participation</h2>
                  <div class="divide-y divide-slate-100">
                    @for (p of d.rfq.participations; track p.supplierId) {
                      <div class="py-2 flex items-center justify-between gap-2">
                        <span class="font-medium text-slate-900 truncate">{{ p.supplierName }}</span>
                        <span class="font-medium whitespace-nowrap" [class]="statusClass(p.status)">{{ humanStatus(p.status) }}</span>
                      </div>
                    }
                  </div>
                </div>
              }

              <div class="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-2">
                <h2 class="font-display text-sm font-semibold text-slate-900">RFQ Attachments</h2>
                @if (d.rfq.attachments.length === 0) {
                  <p class="text-slate-500">No files attached.</p>
                } @else {
                  @for (att of d.rfq.attachments; track att.id) {
                    <div class="py-1.5 flex items-center justify-between gap-2">
                      <span class="text-slate-800 truncate">{{ att.fileName }}</span>
                      <span class="font-mono text-slate-400 shrink-0">{{ att.fileSize }}</span>
                    </div>
                  }
                }
              </div>
            </div>
          </div>
        }

        <!-- TAB 2: SUPPLIER QUOTATION ENTRY -->
        @if (activeTab() === 'quotation') {
          <div class="space-y-6">
            @if (isSupplier()) {
              <!-- Participation Actions -->
              <div class="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div>
                  <h2 class="font-display text-sm font-semibold text-slate-900">RFQ Participation Status</h2>
                  <p class="text-slate-500 mt-0.5">
                    Current status: <span class="font-semibold text-slate-900">{{ humanStatus(myParticipation()?.status || 'INVITED') }}</span>
                    @if (isDeadlinePassed()) {
                      <span class="text-red-700 font-semibold"> · Deadline passed (Quotation Entry Locked)</span>
                    }
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="button" (click)="recordParticipation('ACKNOWLEDGED')" class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 font-medium text-slate-700">
                    Acknowledge RFQ
                  </button>
                  <button type="button" (click)="recordParticipation('INTENDING')" class="px-3 py-1.5 rounded bg-slate-900 text-white font-medium">
                    Intend to Participate
                  </button>
                  <button type="button" (click)="showDeclineBox.set(!showDeclineBox())" class="px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50 font-medium">
                    Decline
                  </button>
                </div>
              </div>

              @if (showDeclineBox()) {
                <div class="bg-white border border-red-200 rounded-lg p-4 flex gap-3 text-xs">
                  <input type="text" [formControl]="declineReasonControl" placeholder="Mandatory decline reason..." class="flex-1 px-3 py-1.5 border border-slate-300 rounded" />
                  <button type="button" (click)="recordParticipation('DECLINED')" class="px-4 py-1.5 rounded bg-red-700 text-white font-medium">
                    Confirm Decline
                  </button>
                </div>
              }

              <!-- Sealed Quotation Entry Form -->
              <form [formGroup]="quoteForm" class="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 class="font-display text-base font-semibold text-slate-900">
                      Sealed Commercial Quotation Submission
                    </h2>
                    <p class="text-xs text-slate-500 mt-0.5">
                      Competitor bids and identities are strictly isolated. Net price and Total Landed Cost calculate automatically.
                    </p>
                  </div>
                  @if (myQuotation(); as mq) {
                    <span class="font-mono text-xs font-semibold text-slate-700">
                      {{ mq.quotationNumber }} · v{{ mq.version }} ({{ mq.status }})
                    </span>
                  }
                </div>

                <div formArrayName="items" class="space-y-4">
                  @for (qLine of quoteItemsArray.controls; track $index; let idx = $index) {
                    @let rfqLine = d.rfq.items[idx];
                    <div [formGroupName]="idx" class="p-4 rounded-md border border-slate-200 bg-slate-50/40 space-y-3 text-xs">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-semibold text-slate-900">
                          {{ rfqLine.materialCode }} — {{ rfqLine.description }} ({{ rfqLine.quantity }} {{ rfqLine.uom }})
                        </span>
                        <span class="font-mono font-semibold text-slate-900 tabular-nums">
                          Line Landed Cost: {{ formatInrExact(computeLineLanded(idx)) }}
                        </span>
                      </div>

                      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Basic Unit Price (₹)</span>
                          <input type="number" formControlName="basicUnitPrice" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Discount (%)</span>
                          <input type="number" formControlName="discountPercent" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">GST (%)</span>
                          <input type="number" formControlName="gstPercent" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Freight (₹ total)</span>
                          <input type="number" formControlName="freight" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Packing & Fwd (₹)</span>
                          <input type="number" formControlName="packingForwarding" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Tooling / Dev (₹)</span>
                          <input type="number" formControlName="toolingCost" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Insurance (₹)</span>
                          <input type="number" formControlName="insurance" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Other Charges (₹)</span>
                          <input type="number" formControlName="otherCharges" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">MOQ</span>
                          <input type="number" formControlName="moq" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                        <label class="block">
                          <span class="block text-slate-600 mb-1">Lead Time (Days)</span>
                          <input type="number" formControlName="leadTimeDays" class="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded bg-white" />
                        </label>
                      </div>
                    </div>
                  }
                </div>

                <div class="grid sm:grid-cols-3 gap-4 text-xs pt-2 border-t border-slate-200">
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Payment Terms</span>
                    <select formControlName="paymentTerms" class="w-full px-3 py-2 border border-slate-300 rounded bg-white">
                      <option value="NET45">NET45</option>
                      <option value="NET30">NET30</option>
                      <option value="NET60">NET60</option>
                      <option value="MSME45">MSME45</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Incoterms</span>
                    <select formControlName="incoterms" class="w-full px-3 py-2 border border-slate-300 rounded bg-white">
                      <option value="DAP">DAP</option>
                      <option value="DDP">DDP</option>
                      <option value="EXW">EXW</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Quotation Validity Date</span>
                    <input type="date" formControlName="validityDate" class="w-full px-3 py-2 font-mono border border-slate-300 rounded" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Technical Deviation</span>
                    <input type="text" formControlName="technicalDeviation" class="w-full px-3 py-2 border border-slate-300 rounded" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Commercial Deviation</span>
                    <input type="text" formControlName="commercialDeviation" class="w-full px-3 py-2 border border-slate-300 rounded" />
                  </label>
                  <label class="block">
                    <span class="block text-slate-600 mb-1">Supplier Remarks</span>
                    <input type="text" formControlName="remarks" class="w-full px-3 py-2 border border-slate-300 rounded" />
                  </label>
                </div>

                <div class="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div class="text-sm">
                    <span class="text-slate-500">Grand Total Landed Cost: </span>
                    <span class="font-mono font-bold text-slate-900 tabular-nums">{{ formatInrExact(computeGrandTotalLanded()) }}</span>
                  </div>
                  @if (!isDeadlinePassed()) {
                    <div class="flex items-center gap-3">
                      <button type="button" (click)="submitQuotation(false)" class="px-4 py-2 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Save as Draft
                      </button>
                      <button type="button" (click)="submitQuotation(true)" class="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">
                        <mat-icon class="text-[16px]">lock</mat-icon>
                        <span>{{ myQuotation() ? 'Submit Revised Version' : 'Submit Sealed Quotation' }}</span>
                      </button>
                    </div>
                  }
                </div>
              </form>
            } @else {
              <!-- Buyer/Internal Summary of Received Sealed Quotations -->
              <div class="bg-white border border-slate-200 rounded-lg p-5">
                <h2 class="font-display text-base font-semibold text-slate-900 mb-3">
                  Submitted Quotations ({{ d.quotations.length }})
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 text-slate-500">
                        <th class="py-2 pr-4 font-medium">Quote No</th>
                        <th class="py-2 pr-4 font-medium">Supplier</th>
                        <th class="py-2 pr-4 font-medium">Version</th>
                        <th class="py-2 pr-4 font-medium">Technical Eval</th>
                        <th class="py-2 pr-4 font-medium text-right">Total Landed Cost</th>
                        <th class="py-2 font-medium text-right">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      @for (q of d.quotations; track q.id) {
                        <tr>
                          <td class="py-2.5 pr-4 font-mono font-semibold text-slate-900">{{ q.quotationNumber }}</td>
                          <td class="py-2.5 pr-4 font-medium text-slate-900">{{ q.supplierName }}</td>
                          <td class="py-2.5 pr-4 font-mono">v{{ q.version }} ({{ q.status }})</td>
                          <td class="py-2.5 pr-4" [class]="statusClass(q.technicalEval.status)">{{ humanStatus(q.technicalEval.status) }}</td>
                          <td class="py-2.5 pr-4 text-right font-mono font-semibold text-slate-900 tabular-nums">{{ formatInr(q.totalLandedCost) }}</td>
                          <td class="py-2.5 text-right font-mono text-slate-500">{{ formatTime(q.submittedAt) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        }

        <!-- TAB 3: TECHNICAL EVALUATION -->
        @if (activeTab() === 'technical' && !isSupplier()) {
          <div class="space-y-4">
            @for (q of d.quotations; track q.id) {
              <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-4 text-xs">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 class="font-display text-sm font-semibold text-slate-900">
                      {{ q.supplierName }} <span class="font-mono text-slate-500 font-normal">({{ q.quotationNumber }} v{{ q.version }})</span>
                    </h3>
                    <p class="text-slate-500 mt-0.5">
                      Tech Deviation: <span class="text-slate-800">{{ q.technicalDeviation }}</span> · Comm Deviation: <span class="text-slate-800">{{ q.commercialDeviation }}</span>
                    </p>
                  </div>
                  <span class="font-semibold" [class]="statusClass(q.technicalEval.status)">
                    {{ humanStatus(q.technicalEval.status) }}
                    @if (q.technicalEval.score) { ({{ q.technicalEval.score }}/100) }
                  </span>
                </div>

                @if (q.technicalEval.remarks) {
                  <p class="p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
                    Evaluation Remarks ({{ q.technicalEval.evaluatedBy }}): {{ q.technicalEval.remarks }}
                  </p>
                }

                @if (!isAuditor()) {
                  <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <input type="number" [formControl]="techScoreControl" placeholder="Score (0-100)" class="w-28 px-2.5 py-1.5 font-mono border border-slate-300 rounded" />
                    <input type="text" [formControl]="techRemarksControl" placeholder="Technical compliance notes..." class="flex-1 min-w-[220px] px-2.5 py-1.5 border border-slate-300 rounded" />
                    <button type="button" (click)="saveTechEval(q.id, 'TECHNICALLY_ACCEPTED')" class="px-3 py-1.5 rounded bg-emerald-700 text-white font-medium">Accept</button>
                    <button type="button" (click)="saveTechEval(q.id, 'CONDITIONALLY_ACCEPTED')" class="px-3 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-900 font-medium">Conditional</button>
                    <button type="button" (click)="saveTechEval(q.id, 'CLARIFICATION_REQUIRED')" class="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-medium">Clarify</button>
                    <button type="button" (click)="saveTechEval(q.id, 'TECHNICALLY_REJECTED')" class="px-3 py-1.5 rounded border border-red-300 text-red-700 font-medium">Reject</button>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- TAB 4: MULTIPLE SUPPLIER COMPARISON STATEMENT -->
        @if (activeTab() === 'comparison' && !isSupplier()) {
          <div class="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 class="font-display text-base font-semibold text-slate-900">
                  Automated Multiple Supplier Comparison Statement (CS)
                </h2>
                <p class="text-xs text-slate-500 mt-0.5">
                  L1 / L2 / L3 ranked by Total Landed Cost across technically eligible offers.
                </p>
              </div>
              <button
                type="button"
                (click)="exportComparisonCsv()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700"
              >
                <mat-icon class="text-[16px]">download</mat-icon>
                <span>Export Comparison CSV</span>
              </button>
            </div>

            @if (d.comparison.length === 0) {
              <p class="text-xs text-slate-500 py-4">No submitted quotations available for comparison yet.</p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th class="py-2.5 px-3 font-medium">Evaluation Metric</th>
                      @for (col of d.comparison; track col.supplierId) {
                        <th class="py-2.5 px-3 font-semibold text-slate-900 text-right min-w-[180px]">
                          <div>{{ col.supplierName }}</div>
                          <div class="font-mono text-[11px]" [class]="col.rank === 1 ? 'text-emerald-700' : 'text-slate-500'">
                            {{ col.rankLabel }} · {{ humanStatus(col.technicalStatus) }}
                          </div>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 tabular-nums">
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Original Basic Total</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-slate-800">{{ formatInr(col.originalBasicTotal) }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Discount</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-emerald-700">-{{ formatInr(col.discountTotal) }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Net Basic Rate Total</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-slate-900">{{ formatInr(col.netBasicTotal) }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">GST / Applicable Tax</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-slate-700">{{ formatInr(col.gstTotal) }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Freight + Packing & Fwd</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-slate-700">{{ formatInr(col.freightTotal + col.packingTotal) }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Tooling + Other Charges</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-slate-700">{{ formatInr(col.toolingTotal + col.otherChargesTotal) }}</td>
                      }
                    </tr>
                    <tr class="bg-slate-50 font-semibold">
                      <td class="py-2.5 px-3 text-slate-900">Original Total Landed Cost</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2.5 px-3 text-right font-mono text-slate-900">{{ formatInr(col.totalLandedCost) }}</td>
                      }
                    </tr>
                    <tr class="bg-blue-50/50 font-semibold">
                      <td class="py-2.5 px-3 text-slate-900">Latest Negotiated / Effective Total</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2.5 px-3 text-right font-mono text-blue-800">{{ formatInr(col.effectiveTotal) }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Variance vs Benchmark ({{ formatInr(d.comparison[0].benchmarkTotal) }})</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono" [class]="col.benchmarkVariancePct <= 0 ? 'text-emerald-700' : 'text-red-700'">
                          {{ col.benchmarkVariancePct > 0 ? '+' : '' }}{{ col.benchmarkVariancePct }}%
                        </td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Variance vs Prev Purchase ({{ formatInr(d.comparison[0].previousPurchaseTotal) }})</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono" [class]="col.prevPriceVariancePct <= 0 ? 'text-emerald-700' : 'text-red-700'">
                          {{ col.prevPriceVariancePct > 0 ? '+' : '' }}{{ col.prevPriceVariancePct }}%
                        </td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Lead Time / Payment Terms</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right text-slate-800">{{ col.avgLeadTimeDays }} days · {{ col.paymentTerms }}</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Quality / Performance Rating</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right font-mono text-slate-800">{{ col.qualityScore }}/100 · {{ col.performanceScore }}/100</td>
                      }
                    </tr>
                    <tr>
                      <td class="py-2 px-3 text-slate-600">Commercial Deviations</td>
                      @for (col of d.comparison; track col.supplierId) {
                        <td class="py-2 px-3 text-right text-slate-600">{{ col.commercialDeviation }}</td>
                      }
                    </tr>
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <!-- TAB 5: NEGOTIATION WORKBENCH -->
        @if (activeTab() === 'negotiation') {
          <div class="space-y-6">
            @if (isBuyerOrAdmin() && d.comparison.length > 0 && d.rfq.status !== 'AWARDED' && d.rfq.status !== 'CLOSED') {
              <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <h2 class="font-display text-base font-semibold text-slate-900">
                  Initiate New Negotiation Round
                </h2>
                <div class="grid sm:grid-cols-3 gap-4 text-xs">
                  <label class="block">
                    <span class="block font-medium text-slate-700 mb-1">Shortlisted Supplier</span>
                    <select [formControl]="negSupplierControl" (change)="populateNegTargets()" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                      @for (c of d.comparison; track c.supplierId) {
                        <option [value]="c.supplierId">{{ c.supplierName }} ({{ c.rankLabel }})</option>
                      }
                    </select>
                  </label>
                  <label class="block">
                    <span class="block font-medium text-slate-700 mb-1">Revised Terms</span>
                    <input type="text" [formControl]="negTermsControl" class="w-full px-3 py-2 border border-slate-300 rounded-md" />
                  </label>
                  <label class="block">
                    <span class="block font-medium text-slate-700 mb-1">Buyer Negotiation Remarks</span>
                    <input type="text" [formControl]="negRemarksControl" placeholder="Volume commitment or target rationale..." class="w-full px-3 py-2 border border-slate-300 rounded-md" />
                  </label>
                </div>

                @if (negLineDrafts().length > 0) {
                  <div class="overflow-x-auto border border-slate-200 rounded-md">
                    <table class="w-full text-left text-xs">
                      <thead>
                        <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th class="py-2 px-3 font-medium">Part</th>
                          <th class="py-2 px-3 font-medium text-right">Qty</th>
                          <th class="py-2 px-3 font-medium text-right">Current Unit Rate</th>
                          <th class="py-2 px-3 font-medium text-right">Negotiated Unit Rate (₹)</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        @for (nl of negLineDrafts(); track nl.rfqItemId; let idx = $index) {
                          <tr>
                            <td class="py-2 px-3 font-medium text-slate-900">{{ nl.materialCode }} · {{ nl.description }}</td>
                            <td class="py-2 px-3 text-right font-mono">{{ nl.quantity }}</td>
                            <td class="py-2 px-3 text-right font-mono">{{ formatInrExact(nl.currentUnitPrice) }}</td>
                            <td class="py-2 px-3 text-right">
                              <input
                                type="number"
                                [value]="nl.revisedUnitPrice"
                                (input)="updateNegDraftPrice(idx, $any($event.target).value)"
                                class="w-32 px-2 py-1 text-right font-mono border border-slate-300 rounded"
                              />
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                <div class="flex justify-end">
                  <button type="button" (click)="submitNegotiationRound()" class="px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium">
                    Record Negotiation Round
                  </button>
                </div>
              </div>
            }

            <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <h2 class="font-display text-base font-semibold text-slate-900">
                Negotiation Round History (Immutable Audit)
              </h2>
              @if (d.negotiations.length === 0) {
                <p class="text-xs text-slate-500">No negotiation rounds logged yet.</p>
              } @else {
                <div class="space-y-4">
                  @for (n of d.negotiations; track n.id) {
                    <div class="p-4 rounded-md border border-slate-200 space-y-3 text-xs">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span class="font-mono font-semibold text-slate-900">Round {{ n.roundNumber }}</span>
                          <span class="font-semibold text-slate-800"> · {{ n.supplierName }}</span>
                          <p class="text-slate-500 mt-0.5">Terms: {{ n.revisedTerms }} · By {{ n.initiatedBy }}</p>
                        </div>
                        <div class="text-right font-mono tabular-nums">
                          <div class="text-slate-900 font-semibold">
                            {{ formatInr(n.previousTotal) }} → {{ formatInr(n.revisedTotal) }}
                          </div>
                          <div class="text-emerald-700">
                            Savings: {{ formatInr(n.savingsAmount) }} ({{ n.savingsPercent }}%)
                          </div>
                        </div>
                      </div>
                      <p class="text-slate-600">Buyer Remarks: {{ n.buyerRemarks }}</p>
                      <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                        @if (n.supplierConfirmed) {
                          <span class="text-emerald-700 font-medium">
                            Supplier Confirmed ({{ formatTime(n.supplierConfirmedAt) }}) — {{ n.supplierRemarks }}
                          </span>
                        } @else {
                          <span class="text-amber-700 font-medium">Awaiting Supplier Confirmation</span>
                          @if (isSupplier()) {
                            <button
                              type="button"
                              (click)="confirmNegotiation(n.id)"
                              class="px-3 py-1.5 rounded bg-emerald-700 text-white font-medium"
                            >
                              Confirm Revised Offer
                            </button>
                          }
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- TAB 6: SETTLED RATE, RECOMMENDATION, APPROVAL MATRIX & AWARD -->
        @if (activeTab() === 'approval' && !isSupplier()) {
          <div class="space-y-6">
            @if (isBuyerOrAdmin() && (!d.recommendation || d.recommendation.status === 'SEND_BACK' || d.recommendation.status === 'REJECTED')) {
              <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                <h2 class="font-display text-base font-semibold text-slate-900">
                  Final Settled Rate & Supplier Recommendation
                </h2>
                <div class="grid sm:grid-cols-2 gap-4 text-xs">
                  <label class="block">
                    <span class="block font-medium text-slate-700 mb-1">Recommended Supplier</span>
                    <select [formControl]="recSupplierControl" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                      @for (c of d.comparison; track c.supplierId) {
                        <option [value]="c.supplierId">
                          {{ c.supplierName }} — {{ c.rankLabel }} ({{ formatInr(c.effectiveTotal) }})
                        </option>
                      }
                    </select>
                  </label>
                  <label class="block">
                    <span class="block font-medium text-slate-700 mb-1">Non-L1 Justification (Mandatory if not L1)</span>
                    <select [formControl]="nonL1ReasonControl" class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white">
                      <option value="">-- Select if Non-L1 --</option>
                      <option value="Better quality">Better quality</option>
                      <option value="Lower lead time">Lower lead time</option>
                      <option value="Existing approved capacity">Existing approved capacity</option>
                      <option value="Better payment terms">Better payment terms</option>
                      <option value="Technical suitability">Technical suitability</option>
                      <option value="Localization">Localization</option>
                      <option value="Supply-risk mitigation">Supply-risk mitigation</option>
                      <option value="Management decision">Management decision</option>
                      <option value="Past performance">Past performance</option>
                      <option value="Strategic sourcing requirement">Strategic sourcing requirement</option>
                    </select>
                  </label>
                </div>
                <div class="flex justify-end">
                  <button
                    type="button"
                    (click)="submitRateRecommendation()"
                    class="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                  >
                    <mat-icon class="text-[16px]">send</mat-icon>
                    <span>Submit Recommendation for Rate Approval</span>
                  </button>
                </div>
              </div>
            }

            @if (d.recommendation; as rec) {
              <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 class="font-display text-lg font-semibold text-slate-900">
                      Recommended: {{ rec.recommendedSupplierName }}
                    </h2>
                    <p class="text-xs text-slate-600 mt-0.5">
                      {{ rec.isL1 ? 'L1 Compliant Selection' : 'Non-L1 Exception: ' + rec.nonL1Justification }}
                      · Submitted by {{ rec.submittedBy }} on {{ formatTime(rec.submittedAt) }}
                    </p>
                  </div>
                  <span class="text-xs font-semibold" [class]="statusClass(rec.status)">
                    {{ humanStatus(rec.status) }}
                  </span>
                </div>

                <!-- Financial Summary Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-100">
                  <div>
                    <p class="text-slate-500">Original Quoted</p>
                    <p class="font-mono text-base font-semibold text-slate-900 tabular-nums mt-0.5">{{ formatInr(rec.originalQuotedTotal) }}</p>
                  </div>
                  <div>
                    <p class="text-slate-500">Final Settled Business Value</p>
                    <p class="font-mono text-base font-semibold text-blue-700 tabular-nums mt-0.5">{{ formatInr(rec.finalSettledTotal) }}</p>
                  </div>
                  <div>
                    <p class="text-slate-500">Negotiated Savings</p>
                    <p class="font-mono text-base font-semibold text-emerald-700 tabular-nums mt-0.5">
                      {{ formatInr(rec.absoluteSaving) }} ({{ rec.savingPercent }}%)
                    </p>
                  </div>
                  <div>
                    <p class="text-slate-500">Variance vs Benchmark / Prev</p>
                    <p class="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                      {{ rec.benchmarkVariancePercent }}% / {{ rec.prevPriceVariancePercent }}%
                    </p>
                  </div>
                </div>

                <!-- Dynamic Approval Matrix Steps -->
                <div class="pt-3 border-t border-slate-200">
                  <h3 class="text-xs font-semibold text-slate-500 mb-3">Configurable Rate Approval Matrix</h3>
                  <div class="grid sm:grid-cols-4 gap-3 text-xs">
                    @for (step of rec.approvalChain; track step.stageOrder) {
                      <div
                        class="p-3 rounded border"
                        [class.border-emerald-300]="step.status === 'APPROVED'"
                        [class.bg-emerald-50]="step.status === 'APPROVED'"
                        [class.border-slate-900]="step.status === 'PENDING' && $index === rec.currentStepIndex"
                        [class.border-slate-200]="step.status !== 'APPROVED' && $index !== rec.currentStepIndex"
                      >
                        <p class="font-mono text-[11px] text-slate-500">Stage 0{{ step.stageOrder }}</p>
                        <p class="font-semibold text-slate-900 mt-0.5">{{ step.label }}</p>
                        <p class="mt-1 font-medium" [class]="statusClass(step.status)">{{ humanStatus(step.status) }}</p>
                        @if (step.actionBy) {
                          <p class="text-[11px] text-slate-500 mt-0.5">{{ step.actionBy }}</p>
                        }
                      </div>
                    }
                  </div>
                </div>

                <!-- Approver Action Controls -->
                @if (isApproverOrAdmin() && (rec.status === 'PENDING_APPROVAL' || rec.status === 'ON_HOLD' || rec.status === 'INFO_REQUESTED')) {
                  <div class="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-3 text-xs">
                    <p class="font-semibold text-slate-900">
                      Action Required: {{ rec.approvalChain[rec.currentStepIndex]?.label }}
                    </p>
                    <textarea
                      rows="2"
                      [formControl]="rateActionRemarks"
                      placeholder="Enter approval remarks (mandatory for Reject, Send Back, Hold, or Non-L1)..."
                      class="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
                    ></textarea>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" (click)="actOnRateApproval('APPROVE')" class="px-4 py-2 rounded bg-emerald-700 text-white font-medium">Approve</button>
                      <button type="button" (click)="actOnRateApproval('SEND_BACK')" class="px-3.5 py-2 rounded border border-amber-300 bg-amber-50 text-amber-900 font-medium">Send Back</button>
                      <button type="button" (click)="actOnRateApproval('HOLD')" class="px-3.5 py-2 rounded border border-slate-300 bg-white text-slate-700 font-medium">Put On Hold</button>
                      <button type="button" (click)="actOnRateApproval('REQUEST_INFO')" class="px-3.5 py-2 rounded border border-slate-300 bg-white text-slate-700 font-medium">Request Clarification</button>
                      <button type="button" (click)="actOnRateApproval('DELEGATE')" class="px-3.5 py-2 rounded border border-slate-300 bg-white text-slate-700 font-medium">Delegate</button>
                      <button type="button" (click)="actOnRateApproval('REJECT')" class="px-3.5 py-2 rounded border border-red-300 text-red-700 bg-white font-medium">Reject</button>
                    </div>
                  </div>
                }

                <!-- Issue Award Section -->
                @if (isBuyerOrAdmin() && rec.status === 'APPROVED' && d.rfq.status === 'AWARD_APPROVED') {
                  <div class="p-4 rounded-md bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <p class="font-semibold text-emerald-900">All Rate Approvals Completed — Ready for Award</p>
                      <p class="text-emerald-800 mt-0.5">
                        Issuing award notifies the winning supplier, sends confidential closure notices to non-selected bidders, and stages SAP PIR/PO handoff.
                      </p>
                    </div>
                    <button
                      type="button"
                      (click)="issueAward()"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-medium whitespace-nowrap"
                    >
                      <mat-icon class="text-[16px]">workspace_premium</mat-icon>
                      <span>Issue Business Award</span>
                    </button>
                  </div>
                }

                <!-- Approval History Log -->
                <div class="pt-3 border-t border-slate-200">
                  <h3 class="text-xs font-semibold text-slate-500 mb-2">Rate Approval Audit History</h3>
                  <div class="divide-y divide-slate-100 text-xs">
                    @for (ah of rec.approvalHistory; track ah.id) {
                      <div class="py-2 flex items-start justify-between gap-4">
                        <div>
                          <span class="font-semibold text-slate-900">{{ ah.stageLabel }}</span>
                          <span class="text-slate-500"> · {{ ah.approverName }} ({{ humanStatus(ah.approverRole) }})</span>
                          <p class="text-slate-600 mt-0.5">{{ ah.remarks }}</p>
                        </div>
                        <span class="font-mono text-[11px] text-slate-400 whitespace-nowrap">{{ formatTime(ah.timestamp) }}</span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class RfqDetail implements OnInit {
  private readonly api = inject(SrmApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly detail = signal<RfqDetailResponse | null>(null);
  readonly activeTab = signal<WorkspaceTab>('overview');
  readonly statusMessage = signal('');
  readonly errorMessage = signal('');
  readonly showExtendBox = signal(false);
  readonly showDeclineBox = signal(false);

  readonly isSupplier = computed(() => this.auth.role() === 'SUPPLIER');
  readonly isAuditor = computed(() => this.auth.role() === 'AUDITOR');
  readonly isBuyerOrAdmin = computed(() => {
    const r = this.auth.role();
    return r === 'BUYER' || r === 'ADMIN' || r === 'SUPER_ADMIN';
  });
  readonly isApproverOrAdmin = computed(() => {
    const r = this.auth.role();
    return r === 'APPROVER' || r === 'ADMIN' || r === 'SUPER_ADMIN';
  });

  readonly visibleTabs = computed<{key: WorkspaceTab; label: string}[]>(() => {
    if (this.isSupplier()) {
      return [
        {key: 'overview', label: 'RFQ Scope & Clarifications'},
        {key: 'quotation', label: 'Participation & Sealed Quote'},
        {key: 'negotiation', label: 'Negotiation Rounds'},
      ];
    }
    return [
      {key: 'overview', label: 'Overview & Clarifications'},
      {key: 'quotation', label: 'Quotations Received'},
      {key: 'technical', label: 'Technical Evaluation'},
      {key: 'comparison', label: 'Supplier Comparison'},
      {key: 'negotiation', label: 'Negotiations'},
      {key: 'approval', label: 'Rate Approval & Award'},
    ];
  });

  readonly myParticipation = computed(() => {
    const d = this.detail();
    const sid = this.auth.user()?.supplierId;
    if (!d || !sid) return null;
    return d.rfq.participations.find((p) => p.supplierId === sid) || null;
  });

  readonly myQuotation = computed(() => {
    const d = this.detail();
    if (!d || !this.isSupplier()) return null;
    return d.quotations[0] || null;
  });

  readonly isDeadlinePassed = computed(() => {
    const d = this.detail();
    if (!d) return false;
    return new Date(d.rfq.quotationDeadline).getTime() < Date.now();
  });

  // Form controls
  readonly rfqApprovalRemarks = new FormControl('', {nonNullable: true});
  readonly clarificationQuestionControl = new FormControl('', {nonNullable: true});
  readonly clarificationAnswerControl = new FormControl('', {nonNullable: true});
  readonly declineReasonControl = new FormControl('', {nonNullable: true});
  readonly techScoreControl = new FormControl(90, {nonNullable: true});
  readonly techRemarksControl = new FormControl('', {nonNullable: true});
  readonly rateActionRemarks = new FormControl('', {nonNullable: true});

  readonly extendForm = new FormGroup({
    newDeadline: new FormControl(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), {nonNullable: true}),
    reason: new FormControl('', {nonNullable: true}),
  });

  readonly quoteForm = new FormGroup({
    paymentTerms: new FormControl('NET45', {nonNullable: true}),
    incoterms: new FormControl('DAP', {nonNullable: true}),
    validityDate: new FormControl(new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), {nonNullable: true}),
    technicalDeviation: new FormControl('None', {nonNullable: true}),
    commercialDeviation: new FormControl('None', {nonNullable: true}),
    remarks: new FormControl('', {nonNullable: true}),
    items: new FormArray<FormGroup>([]),
  });

  readonly negSupplierControl = new FormControl('', {nonNullable: true});
  readonly negTermsControl = new FormControl('NET45 · DAP', {nonNullable: true});
  readonly negRemarksControl = new FormControl('', {nonNullable: true});
  readonly negLineDrafts = signal<
    {rfqItemId: string; materialCode: string; description: string; quantity: number; currentUnitPrice: number; revisedUnitPrice: number}[]
  >([]);

  readonly recSupplierControl = new FormControl('', {nonNullable: true});
  readonly nonL1ReasonControl = new FormControl('', {nonNullable: true});

  get quoteItemsArray(): FormArray<FormGroup> {
    return this.quoteForm.controls.items;
  }

  ngOnInit(): void {
    const tabParam = this.route.snapshot.queryParamMap.get('tab') as WorkspaceTab | null;
    if (tabParam) this.activeTab.set(tabParam);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const id = this.route.snapshot.paramMap.get('id') || '';
      const d = await this.api.getRfqDetail(id);
      this.detail.set(d);
      this.initQuoteForm(d);
      if (d.comparison.length > 0) {
        this.negSupplierControl.setValue(d.comparison[0].supplierId);
        this.recSupplierControl.setValue(d.comparison[0].supplierId);
        this.populateNegTargets();
      }
    } finally {
      this.loading.set(false);
    }
  }

  private initQuoteForm(d: RfqDetailResponse): void {
    this.quoteItemsArray.clear();
    const existingQuote = d.quotations[0];
    if (existingQuote) {
      this.quoteForm.patchValue({
        paymentTerms: existingQuote.paymentTerms,
        incoterms: existingQuote.incoterms,
        validityDate: existingQuote.validityDate,
        technicalDeviation: existingQuote.technicalDeviation,
        commercialDeviation: existingQuote.commercialDeviation,
        remarks: existingQuote.remarks,
      });
    } else {
      this.quoteForm.patchValue({
        paymentTerms: d.rfq.paymentTerms,
        incoterms: d.rfq.incoterms,
      });
    }

    for (const rfqItem of d.rfq.items) {
      const qLine = existingQuote?.items.find((l) => l.rfqItemId === rfqItem.id);
      this.quoteItemsArray.push(
        new FormGroup({
          rfqItemId: new FormControl(rfqItem.id, {nonNullable: true}),
          basicUnitPrice: new FormControl(qLine?.basicUnitPrice ?? 1000, {nonNullable: true}),
          discountPercent: new FormControl(qLine?.discountPercent ?? 0, {nonNullable: true}),
          gstPercent: new FormControl(qLine?.gstPercent ?? 18, {nonNullable: true}),
          freight: new FormControl(qLine?.freight ?? 15000, {nonNullable: true}),
          packingForwarding: new FormControl(qLine?.packingForwarding ?? 5000, {nonNullable: true}),
          toolingCost: new FormControl(qLine?.toolingCost ?? 0, {nonNullable: true}),
          insurance: new FormControl(qLine?.insurance ?? 2000, {nonNullable: true}),
          otherCharges: new FormControl(qLine?.otherCharges ?? 0, {nonNullable: true}),
          moq: new FormControl(qLine?.moq ?? 100, {nonNullable: true}),
          leadTimeDays: new FormControl(qLine?.leadTimeDays ?? 21, {nonNullable: true}),
        }),
      );
    }
  }

  computeLineLanded(idx: number): number {
    const d = this.detail();
    const ctrl = this.quoteItemsArray.at(idx);
    if (!d || !ctrl) return 0;
    const qty = d.rfq.items[idx]?.quantity || 1;
    const v = ctrl.getRawValue();
    const netUnit = Number(v['basicUnitPrice'] || 0) * (1 - Number(v['discountPercent'] || 0) / 100);
    const basicSub = netUnit * qty;
    const gst = (basicSub * Number(v['gstPercent'] || 0)) / 100;
    return (
      basicSub +
      gst +
      Number(v['freight'] || 0) +
      Number(v['packingForwarding'] || 0) +
      Number(v['toolingCost'] || 0) +
      Number(v['insurance'] || 0) +
      Number(v['otherCharges'] || 0)
    );
  }

  computeGrandTotalLanded(): number {
    let sum = 0;
    for (let i = 0; i < this.quoteItemsArray.length; i++) {
      sum += this.computeLineLanded(i);
    }
    return sum;
  }

  populateNegTargets(): void {
    const d = this.detail();
    if (!d) return;
    const sid = this.negSupplierControl.getRawValue();
    const comp = d.comparison.find((c) => c.supplierId === sid);
    if (!comp) return;
    this.negLineDrafts.set(
      comp.itemBreakdown.map((ib) => ({
        rfqItemId: ib.rfqItemId,
        materialCode: ib.materialCode,
        description: ib.description,
        quantity: ib.quantity,
        currentUnitPrice: ib.negotiatedUnitPrice,
        revisedUnitPrice: Number((ib.negotiatedUnitPrice * 0.96).toFixed(2)),
      })),
    );
  }

  updateNegDraftPrice(idx: number, raw: string): void {
    const val = Number(raw || 0);
    this.negLineDrafts.update((list) =>
      list.map((it, i) => (i === idx ? {...it, revisedUnitPrice: val} : it)),
    );
  }

  private clearMessages(): void {
    this.statusMessage.set('');
    this.errorMessage.set('');
  }

  private handleError(err: unknown): void {
    const httpErr = err as {error?: {error?: string}};
    this.errorMessage.set(httpErr?.error?.error || 'Action failed');
  }

  async submitForApproval(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.submitRfqForApproval(this.detail()!.rfq.id);
      this.statusMessage.set('RFQ submitted for internal approval.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async actOnRfqApproval(action: 'APPROVE' | 'REJECT' | 'SEND_BACK'): Promise<void> {
    this.clearMessages();
    try {
      await this.api.rfqApprovalAction(
        this.detail()!.rfq.id,
        action,
        this.rfqApprovalRemarks.getRawValue() || 'Approved',
      );
      this.statusMessage.set(`RFQ approval action "${humanStatus(action)}" recorded.`);
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async publishRfq(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.publishRfq(this.detail()!.rfq.id);
      this.statusMessage.set('RFQ published and invitations dispatched to all selected suppliers.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async submitExtendDeadline(): Promise<void> {
    this.clearMessages();
    try {
      const v = this.extendForm.getRawValue();
      await this.api.extendRfqDeadline(
        this.detail()!.rfq.id,
        new Date(`${v.newDeadline}T18:00:00Z`).toISOString(),
        v.reason || 'Deadline extended by buyer',
      );
      this.showExtendBox.set(false);
      this.statusMessage.set('Deadline extended and all invited suppliers notified.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async startEvaluation(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.startEvaluation(this.detail()!.rfq.id);
      this.statusMessage.set('RFQ moved to Evaluation stage.');
      this.activeTab.set('technical');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async recordParticipation(status: 'ACKNOWLEDGED' | 'INTENDING' | 'DECLINED'): Promise<void> {
    this.clearMessages();
    try {
      await this.api.participateRfq(
        this.detail()!.rfq.id,
        status,
        this.declineReasonControl.getRawValue(),
      );
      this.showDeclineBox.set(false);
      this.statusMessage.set(`Participation updated to ${humanStatus(status)}.`);
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async raiseClarification(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.raiseClarification(
        this.detail()!.rfq.id,
        this.clarificationQuestionControl.getRawValue(),
      );
      this.clarificationQuestionControl.reset();
      this.statusMessage.set('Clarification submitted to buyer.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async answerClarification(clrId: string): Promise<void> {
    this.clearMessages();
    try {
      await this.api.answerClarification(
        this.detail()!.rfq.id,
        clrId,
        this.clarificationAnswerControl.getRawValue(),
      );
      this.clarificationAnswerControl.reset();
      this.statusMessage.set('Clarification response published.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async submitQuotation(submitFinal: boolean): Promise<void> {
    this.clearMessages();
    try {
      const v = this.quoteForm.getRawValue();
      await this.api.submitQuotation(this.detail()!.rfq.id, {
        ...v,
        warrantyMonths: 24,
        countryOfOrigin: 'India',
        submitFinal,
      });
      this.statusMessage.set(
        submitFinal ? 'Sealed quotation submitted & timestamped.' : 'Quotation saved as Draft.',
      );
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async saveTechEval(
    quoteId: string,
    status: 'TECHNICALLY_ACCEPTED' | 'TECHNICALLY_REJECTED' | 'CLARIFICATION_REQUIRED' | 'CONDITIONALLY_ACCEPTED',
  ): Promise<void> {
    this.clearMessages();
    try {
      await this.api.evaluateTechnical(this.detail()!.rfq.id, quoteId, {
        status,
        score: this.techScoreControl.getRawValue(),
        remarks: this.techRemarksControl.getRawValue() || humanStatus(status),
      });
      this.statusMessage.set(`Technical evaluation updated to ${humanStatus(status)}.`);
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async submitNegotiationRound(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.createNegotiationRound(this.detail()!.rfq.id, {
        supplierId: this.negSupplierControl.getRawValue(),
        items: this.negLineDrafts().map((nl) => ({
          rfqItemId: nl.rfqItemId,
          targetUnitPrice: nl.revisedUnitPrice,
          revisedUnitPrice: nl.revisedUnitPrice,
        })),
        revisedTerms: this.negTermsControl.getRawValue(),
        buyerRemarks: this.negRemarksControl.getRawValue() || 'Negotiation round recorded.',
      });
      this.statusMessage.set('Negotiation round recorded and archived.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async confirmNegotiation(negId: string): Promise<void> {
    this.clearMessages();
    try {
      await this.api.confirmNegotiation(
        this.detail()!.rfq.id,
        negId,
        'Revised rates and commercial terms confirmed.',
      );
      this.statusMessage.set('Negotiation round confirmed.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async submitRateRecommendation(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.submitRecommendation(this.detail()!.rfq.id, {
        recommendedSupplierId: this.recSupplierControl.getRawValue(),
        nonL1Justification: this.nonL1ReasonControl.getRawValue() || undefined,
      });
      this.statusMessage.set('Rate recommendation submitted to configurable approval matrix.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async actOnRateApproval(
    action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO' | 'DELEGATE',
  ): Promise<void> {
    this.clearMessages();
    try {
      await this.api.rateApprovalAction(this.detail()!.rfq.id, {
        action,
        remarks: this.rateActionRemarks.getRawValue(),
      });
      this.rateActionRemarks.reset();
      this.statusMessage.set(`Rate approval action "${humanStatus(action)}" recorded.`);
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async issueAward(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.issueAward(
        this.detail()!.rfq.id,
        'Award issued after management & rate approval completion.',
      );
      this.statusMessage.set('Award issued and SAP Purchasing Info Record staged.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  async closeRfq(): Promise<void> {
    this.clearMessages();
    try {
      await this.api.closeRfq(this.detail()!.rfq.id);
      this.statusMessage.set('RFQ closed. All records are now immutable.');
      await this.load();
    } catch (e) {
      this.handleError(e);
    }
  }

  exportComparisonCsv(): void {
    const d = this.detail();
    if (!d) return;
    downloadCsv(
      `${d.rfq.rfqNumber}_Comparison_Statement.csv`,
      [
        'Rank',
        'Supplier',
        'Tech Status',
        'Net Basic Total',
        'GST',
        'Freight & P&F',
        'Tooling & Other',
        'Original Landed Cost',
        'Negotiated Effective Total',
        'Benchmark Variance %',
        'Lead Time (Days)',
        'Payment Terms',
      ],
      d.comparison.map((c) => [
        c.rankLabel,
        c.supplierName,
        c.technicalStatus,
        c.netBasicTotal,
        c.gstTotal,
        c.freightTotal + c.packingTotal,
        c.toolingTotal + c.otherChargesTotal,
        c.totalLandedCost,
        c.effectiveTotal,
        c.benchmarkVariancePct,
        c.avgLeadTimeDays,
        c.paymentTerms,
      ]),
    );
  }

  formatInr = formatInr;
  formatInrExact = formatInrExact;
  formatDate = formatDateShort;
  formatTime = formatDateTime;
  humanStatus = humanStatus;
  statusClass = statusColorClass;
}
