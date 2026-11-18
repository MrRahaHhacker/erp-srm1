import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import type {
  AuditLog,
  ComparisonSupplierRow,
  LoginActivity,
  NotificationItem,
  PublicUser,
  Quotation,
  RateRecommendation,
  Rfq,
  SapIntegrationRecord,
  SecuritySettings,
  SupplierApplication,
  WorkflowConfiguration,
} from '../../shared/srm.types';

export interface RfqDetailResponse {
  rfq: Rfq;
  quotations: Quotation[];
  negotiations: {
    id: string;
    rfqId: string;
    roundNumber: number;
    supplierId: string;
    supplierName: string;
    initiatedBy: string;
    initiatedAt: string;
    items: {
      rfqItemId: string;
      materialCode: string;
      description: string;
      quantity: number;
      previousUnitPrice: number;
      targetUnitPrice: number;
      revisedUnitPrice: number;
      previousLandedCost: number;
      revisedLandedCost: number;
    }[];
    revisedTerms: string;
    buyerRemarks: string;
    supplierConfirmed: boolean;
    supplierConfirmedAt?: string;
    supplierRemarks?: string;
    previousTotal: number;
    revisedTotal: number;
    savingsAmount: number;
    savingsPercent: number;
  }[];
  comparison: ComparisonSupplierRow[];
  recommendation: RateRecommendation | null;
  awardStatus: string;
}

@Injectable({providedIn: 'root'})
export class SrmApi {
  private readonly http = inject(HttpClient);

  getDemoAccounts() {
    return firstValueFrom(
      this.http.get<{
        defaultPassword: string;
        accounts: {
          username: string;
          email: string;
          fullName: string;
          role: string;
          approverType?: string;
          designation: string;
        }[];
      }>('/api/auth/demo-accounts'),
    );
  }

  getCaptcha() {
    return firstValueFrom(
      this.http.get<{captchaId: string; question: string}>('/api/auth/captcha'),
    );
  }

  forgotPassword(email: string) {
    return firstValueFrom(
      this.http.post<{
        sent: boolean;
        otpId?: string;
        demoOtpHint?: string;
        message: string;
      }>('/api/auth/forgot-password', {email}),
    );
  }

  resetPassword(payload: {otpId: string; code: string; newPassword: string}) {
    return firstValueFrom(
      this.http.post<{success: boolean}>('/api/auth/reset-password', payload),
    );
  }

  sendSupplierRegistrationOtp(email: string, mobile: string) {
    return firstValueFrom(
      this.http.post<{otpId: string; demoOtpHint: string; message: string}>(
        '/api/public/register-supplier/otp',
        {email, mobile},
      ),
    );
  }

  registerSupplierPublic(payload: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<{supplier: SupplierApplication; portalUsername: string}>(
        '/api/public/register-supplier',
        payload,
      ),
    );
  }

  getReferenceData() {
    return firstValueFrom(this.http.get<Record<string, unknown>>('/api/reference'));
  }

  getDashboard() {
    return firstValueFrom(this.http.get<Record<string, unknown>>('/api/dashboard'));
  }

  getSuppliers() {
    return firstValueFrom(this.http.get<SupplierApplication[]>('/api/suppliers'));
  }

  getSupplier(id: string) {
    return firstValueFrom(this.http.get<SupplierApplication>(`/api/suppliers/${id}`));
  }

  createSupplier(payload: Partial<SupplierApplication> & {submitNow?: boolean}) {
    return firstValueFrom(
      this.http.post<SupplierApplication>('/api/suppliers', payload),
    );
  }

  updateSupplier(id: string, payload: Partial<SupplierApplication>) {
    return firstValueFrom(
      this.http.put<SupplierApplication>(`/api/suppliers/${id}`, payload),
    );
  }

  submitSupplier(id: string, remarks?: string) {
    return firstValueFrom(
      this.http.post<SupplierApplication>(`/api/suppliers/${id}/submit`, {remarks}),
    );
  }

  supplierWorkflowAction(
    id: string,
    payload: {
      action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO';
      remarks: string;
      permittedSections?: string[];
    },
  ) {
    return firstValueFrom(
      this.http.post<SupplierApplication>(
        `/api/suppliers/${id}/workflow-action`,
        payload,
      ),
    );
  }

  activateSupplier(id: string) {
    return firstValueFrom(
      this.http.post<SupplierApplication>(`/api/suppliers/${id}/activate`, {}),
    );
  }

  blockOrReopenSupplier(id: string, action: 'BLOCK' | 'REOPEN', remarks: string) {
    return firstValueFrom(
      this.http.post<SupplierApplication>(`/api/suppliers/${id}/block`, {
        action,
        remarks,
      }),
    );
  }

  getRfqs() {
    return firstValueFrom(this.http.get<Rfq[]>('/api/rfqs'));
  }

  getRfqDetail(id: string) {
    return firstValueFrom(this.http.get<RfqDetailResponse>(`/api/rfqs/${id}`));
  }

  createRfq(payload: Partial<Rfq> & {submitForApproval?: boolean}) {
    return firstValueFrom(
      this.http.post<{rfq: Rfq; duplicateWarning: string | null}>('/api/rfqs', payload),
    );
  }

  submitRfqForApproval(id: string) {
    return firstValueFrom(this.http.post<Rfq>(`/api/rfqs/${id}/submit-approval`, {}));
  }

  rfqApprovalAction(id: string, action: 'APPROVE' | 'REJECT' | 'SEND_BACK', remarks: string) {
    return firstValueFrom(
      this.http.post<Rfq>(`/api/rfqs/${id}/approval-action`, {action, remarks}),
    );
  }

  publishRfq(id: string) {
    return firstValueFrom(this.http.post<Rfq>(`/api/rfqs/${id}/publish`, {}));
  }

  extendRfqDeadline(id: string, newDeadline: string, reason: string) {
    return firstValueFrom(
      this.http.post<Rfq>(`/api/rfqs/${id}/extend-deadline`, {newDeadline, reason}),
    );
  }

  startEvaluation(id: string) {
    return firstValueFrom(this.http.post<Rfq>(`/api/rfqs/${id}/start-evaluation`, {}));
  }

  participateRfq(
    id: string,
    status: 'ACKNOWLEDGED' | 'INTENDING' | 'DECLINED',
    declineReason?: string,
  ) {
    return firstValueFrom(
      this.http.post(`/api/rfqs/${id}/participate`, {status, declineReason}),
    );
  }

  raiseClarification(id: string, question: string) {
    return firstValueFrom(
      this.http.post(`/api/rfqs/${id}/clarifications`, {question}),
    );
  }

  answerClarification(rfqId: string, clrId: string, answer: string) {
    return firstValueFrom(
      this.http.post(`/api/rfqs/${rfqId}/clarifications/${clrId}/answer`, {answer}),
    );
  }

  submitQuotation(rfqId: string, payload: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<Quotation>(`/api/rfqs/${rfqId}/quotations`, payload),
    );
  }

  evaluateTechnical(
    rfqId: string,
    quoteId: string,
    payload: {status: Quotation['technicalEval']['status']; score: number; remarks: string},
  ) {
    return firstValueFrom(
      this.http.post<Quotation>(
        `/api/rfqs/${rfqId}/quotations/${quoteId}/technical-eval`,
        payload,
      ),
    );
  }

  createNegotiationRound(
    rfqId: string,
    payload: {
      supplierId: string;
      items: {rfqItemId: string; targetUnitPrice: number; revisedUnitPrice: number}[];
      revisedTerms: string;
      buyerRemarks: string;
    },
  ) {
    return firstValueFrom(
      this.http.post(`/api/rfqs/${rfqId}/negotiations`, payload),
    );
  }

  confirmNegotiation(rfqId: string, negId: string, remarks: string) {
    return firstValueFrom(
      this.http.post(`/api/rfqs/${rfqId}/negotiations/${negId}/confirm`, {remarks}),
    );
  }

  submitRecommendation(
    rfqId: string,
    payload: {
      recommendedSupplierId: string;
      nonL1Justification?: string;
      settledLineRates?: {rfqItemId: string; settledUnitPrice: number}[];
    },
  ) {
    return firstValueFrom(
      this.http.post<RateRecommendation>(`/api/rfqs/${rfqId}/recommendation`, payload),
    );
  }

  rateApprovalAction(
    rfqId: string,
    payload: {
      action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO' | 'DELEGATE';
      remarks: string;
      delegatedToName?: string;
    },
  ) {
    return firstValueFrom(
      this.http.post<{rfq: Rfq; recommendation: RateRecommendation}>(
        `/api/rfqs/${rfqId}/recommendation/action`,
        payload,
      ),
    );
  }

  issueAward(rfqId: string, awardNote: string) {
    return firstValueFrom(
      this.http.post<{rfq: Rfq; recommendation: RateRecommendation}>(
        `/api/rfqs/${rfqId}/award`,
        {awardNote},
      ),
    );
  }

  closeRfq(rfqId: string) {
    return firstValueFrom(this.http.post<Rfq>(`/api/rfqs/${rfqId}/close`, {}));
  }

  getApprovalsInbox() {
    return firstValueFrom(
      this.http.get<{
        supplierTasks: Record<string, unknown>[];
        rfqTasks: Record<string, unknown>[];
        techEvalTasks: Record<string, unknown>[];
        rateTasks: Record<string, unknown>[];
      }>('/api/approvals'),
    );
  }

  getReports() {
    return firstValueFrom(this.http.get<Record<string, unknown>>('/api/reports'));
  }

  getAuditLogs() {
    return firstValueFrom(this.http.get<AuditLog[]>('/api/audit-logs'));
  }

  getLoginActivities() {
    return firstValueFrom(this.http.get<LoginActivity[]>('/api/login-activities'));
  }

  getNotifications() {
    return firstValueFrom(this.http.get<NotificationItem[]>('/api/notifications'));
  }

  markNotificationRead(id: string) {
    return firstValueFrom(this.http.post(`/api/notifications/${id}/read`, {}));
  }

  getAdminOverview() {
    return firstValueFrom(this.http.get<Record<string, unknown>>('/api/admin/overview'));
  }

  createUser(payload: Partial<PublicUser> & {password?: string}) {
    return firstValueFrom(this.http.post<PublicUser>('/api/admin/users', payload));
  }

  unlockUser(id: string) {
    return firstValueFrom(this.http.post<PublicUser>(`/api/admin/users/${id}/unlock`, {}));
  }

  addMasterItem(
    type: string,
    payload: {code: string; name: string; description?: string; extra?: string},
  ) {
    return firstValueFrom(this.http.post(`/api/admin/master/${type}`, payload));
  }

  updateWorkflowConfig(config: WorkflowConfiguration) {
    return firstValueFrom(
      this.http.put<WorkflowConfiguration>('/api/admin/workflow', config),
    );
  }

  updateSecuritySettings(settings: SecuritySettings) {
    return firstValueFrom(
      this.http.put<SecuritySettings>('/api/admin/security', settings),
    );
  }

  syncSapRecord(id: string) {
    return firstValueFrom(
      this.http.post<SapIntegrationRecord>(`/api/admin/sap/${id}/sync`, {}),
    );
  }
}
