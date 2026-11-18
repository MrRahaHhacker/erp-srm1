export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'BUYER'
  | 'APPROVER'
  | 'SUPPLIER'
  | 'AUDITOR';

export type ApproverType =
  | 'SCM_REVIEWER'
  | 'FINANCE_REVIEWER'
  | 'QUALITY_REVIEWER'
  | 'TECHNICAL_REVIEWER'
  | 'COSTING_REVIEWER'
  | 'SCM_MANAGER'
  | 'PURCHASE_HEAD'
  | 'MANAGEMENT_APPROVER';

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'INACTIVE' | 'PASSWORD_EXPIRED';

export interface UserSession {
  sessionId: string;
  refreshToken: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  userAgent: string;
  ip: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  approverType?: ApproverType;
  designation: string;
  companyId: string;
  plantIds: string[];
  departmentIds: string[];
  purchasingGroups: string[];
  supplierId?: string;
  mfaEnabled: boolean;
  status: UserStatus;
  passwordUpdatedAt: string;
  passwordExpiryDays: number;
  concurrentSessionLimit: number;
  lastLoginAt?: string;
  createdAt: string;
}

export interface InternalUser extends PublicUser {
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil?: string;
  activeSessions: UserSession[];
}

export interface LoginActivity {
  id: string;
  userId?: string;
  username: string;
  email?: string;
  role?: UserRole;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED' | 'LOGOUT' | 'OTP_SENT' | 'MFA_VERIFIED' | 'PASSWORD_RESET';
  reason?: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

export interface SecuritySettings {
  maxFailedAttempts: number;
  lockDurationMinutes: number;
  passwordExpiryDays: number;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  captchaThreshold: number;
  enforceMfaForAdmins: boolean;
  allowSupplierSelfRegistration: boolean;
}

export interface Company {
  id: string;
  code: string;
  name: string;
  gstNumber: string;
  panNumber: string;
  country: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Plant {
  id: string;
  companyId: string;
  code: string;
  name: string;
  city: string;
  state: string;
  sapPlantCode: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Department {
  id: string;
  companyId: string;
  code: string;
  name: string;
  costCenter: string;
}

export interface MasterItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  extra?: string;
  active: boolean;
}

export interface NumberRange {
  id: string;
  objectType: 'SUPPLIER_APP' | 'SUPPLIER_REG' | 'RFQ' | 'QUOTATION' | 'AWARD';
  prefix: string;
  currentNumber: number;
  padding: number;
}

export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: 'EMAIL' | 'IN_APP' | 'BOTH';
  subject: string;
  bodyPreview: string;
  active: boolean;
}

export interface ApprovalStageConfig {
  stageOrder: number;
  label: string;
  approverType: ApproverType;
  mandatory: boolean;
  slaHours: number;
}

export interface RateApprovalRule {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number | null;
  currency: string;
  requireForNonL1: boolean;
  requireAboveBenchmarkPct: number | null;
  stages: ApprovalStageConfig[];
  active: boolean;
}

export interface WorkflowConfiguration {
  supplierOnboardingStages: ApprovalStageConfig[];
  rfqPublishStages: ApprovalStageConfig[];
  requireRfqApprovalBeforePublish: boolean;
  requireTechnicalEvalBeforeCommercial: boolean;
  allowQuotationRevisions: boolean;
  rateApprovalRules: RateApprovalRule[];
}

export type SupplierAppStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SCM_REVIEW'
  | 'FINANCE_REVIEW'
  | 'QUALITY_REVIEW'
  | 'FINAL_APPROVAL'
  | 'CORRECTION_REQUIRED'
  | 'ON_HOLD'
  | 'INFO_REQUESTED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'BLOCKED';

export interface SupplierDocument {
  id: string;
  docType:
    | 'GST_CERTIFICATE'
    | 'PAN_CARD'
    | 'MSME_CERTIFICATE'
    | 'CANCELLED_CHEQUE'
    | 'BANK_CONFIRMATION'
    | 'ISO_CERTIFICATE'
    | 'QUALITY_AUDIT'
    | 'COMPANY_PROFILE'
    | 'OTHER';
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  verified: boolean;
  remarks?: string;
}

export interface ApprovalActionLog {
  id: string;
  stageLabel: string;
  approverId: string;
  approverName: string;
  approverRole: string;
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO' | 'DELEGATE' | 'RESUBMIT' | 'ACTIVATE' | 'BLOCK' | 'REOPEN';
  remarks: string;
  previousStatus: string;
  newStatus: string;
  attachmentName?: string;
  delegatedToName?: string;
  timestamp: string;
}

export interface SupplierApplication {
  id: string;
  applicationNumber: string;
  supplierRegNo?: string;
  sapVendorCode?: string;
  status: SupplierAppStatus;
  companyName: string;
  legalEntityType: string;
  email: string;
  mobile: string;
  otpVerified: boolean;
  registeredAddress: string;
  communicationAddress: string;
  city: string;
  state: string;
  country: string;
  gstNumber: string;
  panNumber: string;
  msmeNumber?: string;
  msmeCategory?: 'MICRO' | 'SMALL' | 'MEDIUM' | 'NONE';
  supplierCategory: string;
  productCategories: string[];
  manufacturingCapabilities: string;
  qualityCertifications: string[];
  qualityScore: number;
  performanceScore: number;
  annualTurnoverCr: number;
  primaryContactName: string;
  primaryContactDesignation: string;
  primaryContactPhone: string;
  bankDetails: {
    bankName: string;
    branchName: string;
    accountNumber: string;
    ifscCode: string;
    accountType: string;
    beneficiaryName: string;
  };
  documents: SupplierDocument[];
  permittedCorrectionSections: string[];
  rejectionReason?: string;
  currentStageIndex: number;
  approvalHistory: ApprovalActionLog[];
  plantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type RfqStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'EVALUATION'
  | 'NEGOTIATION'
  | 'RATE_APPROVAL'
  | 'AWARD_APPROVED'
  | 'AWARDED'
  | 'CLOSED'
  | 'CANCELLED';

export interface RfqLineItem {
  id: string;
  lineNo: number;
  materialCode: string;
  description: string;
  drawingNumber: string;
  revisionNumber: string;
  quantity: number;
  uom: string;
  targetDeliveryDate: string;
  plantId: string;
  storageLocation: string;
  benchmarkRate: number;
  previousPurchaseRate: number;
  technicalSpecs: string;
}

export interface RfqAttachment {
  id: string;
  fileName: string;
  category: 'DRAWING' | 'SPECIFICATION' | 'QUALITY_REQ' | 'TERMS' | 'SCOPE';
  uploadedBy: string;
  uploadedAt: string;
  fileSize: string;
}

export interface SupplierRfqParticipation {
  supplierId: string;
  supplierName: string;
  status: 'INVITED' | 'ACKNOWLEDGED' | 'INTENDING' | 'DECLINED' | 'QUOTED';
  declineReason?: string;
  acknowledgedAt?: string;
  updatedAt: string;
}

export interface ClarificationItem {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  question: string;
  answer?: string;
  raisedAt: string;
  answeredBy?: string;
  answeredAt?: string;
  status: 'OPEN' | 'ANSWERED';
}

export interface QuotationLineItem {
  rfqItemId: string;
  basicUnitPrice: number;
  discountPercent: number;
  netUnitPrice: number;
  gstPercent: number;
  gstAmount: number;
  freight: number;
  packingForwarding: number;
  toolingCost: number;
  insurance: number;
  otherCharges: number;
  totalLandedCost: number;
  moq: number;
  leadTimeDays: number;
  deliverySchedule: string;
  technicalDeviation: string;
  commercialDeviation: string;
  remarks: string;
}

export type TechnicalEvalStatus =
  | 'PENDING'
  | 'TECHNICALLY_ACCEPTED'
  | 'TECHNICALLY_REJECTED'
  | 'CLARIFICATION_REQUIRED'
  | 'CONDITIONALLY_ACCEPTED';

export interface Quotation {
  id: string;
  quotationNumber: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  version: number;
  status: 'DRAFT' | 'SUBMITTED' | 'REVISED';
  items: QuotationLineItem[];
  paymentTerms: string;
  incoterms: string;
  validityDate: string;
  warrantyMonths: number;
  countryOfOrigin: string;
  technicalDeviation: string;
  commercialDeviation: string;
  remarks: string;
  attachmentName: string;
  submittedAt?: string;
  totalBasicAmount: number;
  totalLandedCost: number;
  technicalEval: {
    status: TechnicalEvalStatus;
    score?: number;
    evaluatedBy?: string;
    evaluatedAt?: string;
    remarks?: string;
  };
  history: {
    version: number;
    totalLandedCost: number;
    submittedAt: string;
    remarks: string;
  }[];
}

export interface NegotiationLineDelta {
  rfqItemId: string;
  materialCode: string;
  description: string;
  quantity: number;
  previousUnitPrice: number;
  targetUnitPrice: number;
  revisedUnitPrice: number;
  previousLandedCost: number;
  revisedLandedCost: number;
}

export interface NegotiationRound {
  id: string;
  rfqId: string;
  roundNumber: number;
  supplierId: string;
  supplierName: string;
  initiatedBy: string;
  initiatedAt: string;
  items: NegotiationLineDelta[];
  revisedTerms: string;
  buyerRemarks: string;
  supplierConfirmed: boolean;
  supplierConfirmedAt?: string;
  supplierRemarks?: string;
  attachmentName?: string;
  previousTotal: number;
  revisedTotal: number;
  savingsAmount: number;
  savingsPercent: number;
}

export interface RateApprovalStep {
  stageOrder: number;
  label: string;
  approverType: ApproverType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SEND_BACK' | 'ON_HOLD' | 'INFO_REQUESTED' | 'DELEGATED';
  actionBy?: string;
  actionAt?: string;
  remarks?: string;
  delegatedTo?: string;
}

export interface RateRecommendation {
  id: string;
  rfqId: string;
  recommendedSupplierId: string;
  recommendedSupplierName: string;
  isL1: boolean;
  nonL1Justification?: string;
  originalQuotedTotal: number;
  finalSettledTotal: number;
  absoluteSaving: number;
  savingPercent: number;
  benchmarkTotal: number;
  benchmarkVarianceAmount: number;
  benchmarkVariancePercent: number;
  previousPurchaseTotal: number;
  prevPriceVarianceAmount: number;
  prevPriceVariancePercent: number;
  totalBusinessValue: number;
  settledLineRates: {
    rfqItemId: string;
    materialCode: string;
    description: string;
    quantity: number;
    settledUnitPrice: number;
    settledLandedTotal: number;
  }[];
  approvalChain: RateApprovalStep[];
  currentStepIndex: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SEND_BACK' | 'ON_HOLD' | 'INFO_REQUESTED';
  submittedBy: string;
  submittedAt: string;
  approvalHistory: ApprovalActionLog[];
  awardNote?: string;
  awardedBy?: string;
  awardedAt?: string;
  closedAt?: string;
}

export interface Rfq {
  id: string;
  rfqNumber: string;
  title: string;
  project: string;
  companyId: string;
  plantId: string;
  departmentId: string;
  purchasingGroup: string;
  materialCategory: string;
  currency: string;
  quotationDeadline: string;
  requiredDeliveryDate: string;
  deliveryLocation: string;
  technicalContact: string;
  commercialContact: string;
  paymentTerms: string;
  incoterms: string;
  termsAndConditions: string;
  allowRevisions: boolean;
  requireTechEvalFirst: boolean;
  minSuppliersRequired: number;
  status: RfqStatus;
  items: RfqLineItem[];
  attachments: RfqAttachment[];
  invitedSupplierIds: string[];
  participations: SupplierRfqParticipation[];
  clarifications: ClarificationItem[];
  rfqApprovalChain: RateApprovalStep[];
  rfqApprovalHistory: ApprovalActionLog[];
  currentRfqApprovalStep: number;
  deadlineHistory: {
    previousDeadline: string;
    newDeadline: string;
    reason: string;
    changedBy: string;
    changedAt: string;
  }[];
  awardNumber?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComparisonSupplierRow {
  supplierId: string;
  supplierName: string;
  supplierRegNo: string;
  quotationId: string;
  quotationVersion: number;
  technicalStatus: TechnicalEvalStatus;
  technicalScore: number;
  qualityScore: number;
  performanceScore: number;
  originalBasicTotal: number;
  discountTotal: number;
  netBasicTotal: number;
  gstTotal: number;
  freightTotal: number;
  packingTotal: number;
  toolingTotal: number;
  otherChargesTotal: number;
  totalLandedCost: number;
  latestNegotiatedTotal: number;
  effectiveTotal: number;
  avgLeadTimeDays: number;
  paymentTerms: string;
  validityDate: string;
  commercialDeviation: string;
  technicalDeviation: string;
  benchmarkTotal: number;
  previousPurchaseTotal: number;
  benchmarkVariancePct: number;
  prevPriceVariancePct: number;
  rank: number | null;
  rankLabel: string;
  itemBreakdown: {
    rfqItemId: string;
    materialCode: string;
    description: string;
    quantity: number;
    uom: string;
    benchmarkRate: number;
    previousPurchaseRate: number;
    originalUnitPrice: number;
    discountPercent: number;
    netUnitPrice: number;
    gstPercent: number;
    gstAmount: number;
    freight: number;
    packingForwarding: number;
    toolingCost: number;
    otherCharges: number;
    totalLandedCost: number;
    negotiatedUnitPrice: number;
    leadTimeDays: number;
  }[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  entityNumber: string;
  previousState?: string;
  newState?: string;
  remarks?: string;
  ipAddress: string;
}

export interface NotificationItem {
  id: string;
  recipientUserId?: string;
  recipientRole?: UserRole;
  recipientSupplierId?: string;
  title: string;
  message: string;
  severity: 'INFO' | 'ACTION' | 'WARNING' | 'ERROR';
  status: 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';
  channel: 'IN_APP' | 'EMAIL' | 'BOTH';
  relatedModule: string;
  relatedEntityId?: string;
  createdAt: string;
}

export interface SapIntegrationRecord {
  id: string;
  direction: 'OUTBOUND' | 'INBOUND';
  objectType: 'VENDOR_MASTER' | 'PURCHASING_INFO_RECORD' | 'CONTRACT' | 'PO_HANDOFF' | 'MATERIAL_MASTER';
  tcode: string;
  bapiOrService: string;
  entityId: string;
  entityNumber: string;
  sapObjectId?: string;
  status: 'READY' | 'QUEUED' | 'SYNCED' | 'FAILED';
  payloadPreview: Record<string, unknown>;
  syncedAt?: string;
  lastMessage: string;
}

export interface SrmDatabase {
  users: InternalUser[];
  loginActivities: LoginActivity[];
  securitySettings: SecuritySettings;
  companies: Company[];
  plants: Plant[];
  departments: Department[];
  materialCategories: MasterItem[];
  supplierCategories: MasterItem[];
  taxes: MasterItem[];
  currencies: MasterItem[];
  uoms: MasterItem[];
  incoterms: MasterItem[];
  paymentTerms: MasterItem[];
  numberRanges: NumberRange[];
  notificationTemplates: NotificationTemplate[];
  workflowConfig: WorkflowConfiguration;
  suppliers: SupplierApplication[];
  rfqs: Rfq[];
  quotations: Quotation[];
  negotiations: NegotiationRound[];
  rateRecommendations: RateRecommendation[];
  auditLogs: AuditLog[];
  notifications: NotificationItem[];
  sapIntegrations: SapIntegrationRecord[];
}
