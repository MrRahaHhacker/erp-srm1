import express, {type NextFunction, type Request, type Response} from 'express';
import {randomBytes} from 'node:crypto';
import type {
  ComparisonSupplierRow,
  InternalUser,
  PublicUser,
  Quotation,
  RateApprovalStep,
  Rfq,
  SupplierApplication,
} from '../shared/srm.types';
import {
  createCaptchaChallenge,
  hashPassword,
  issueOtp,
  signJwt,
  toPublicUser,
  verifyCaptchaChallenge,
  verifyJwt,
  verifyOtp,
  verifyPassword,
} from './auth';
import {
  calculateQuotationLine,
  getDb,
  nextNumber,
  recordAudit,
  saveDb,
} from './store';
import {getSqliteStats} from './sqlite-db';

interface AuthenticatedRequest extends Request {
  authUser?: InternalUser;
  sessionId?: string;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({error: 'Authentication required'});
    return;
  }
  const token = header.slice(7);
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({error: 'Session expired or invalid token'});
    return;
  }
  const db = getDb();
  const user = db.users.find((u) => u.id === payload.sub);
  if (!user || user.status === 'INACTIVE' || user.status === 'LOCKED') {
    res.status(403).json({error: 'Account inactive or locked'});
    return;
  }
  const session = user.activeSessions.find((s) => s.sessionId === payload.sessionId);
  if (!session) {
    res.status(401).json({error: 'Session invalidated (concurrent session or logout)'});
    return;
  }
  session.lastActiveAt = new Date().toISOString();
  req.authUser = user;
  req.sessionId = payload.sessionId;
  next();
}

function canEditRfq(user: PublicUser): boolean {
  return user.role === 'BUYER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

function buildComparisonForRfq(rfq: Rfq): ComparisonSupplierRow[] {
  const db = getDb();
  const quotes = db.quotations.filter(
    (q) => q.rfqId === rfq.id && q.status !== 'DRAFT',
  );
  const benchmarkTotal = rfq.items.reduce(
    (sum, it) => sum + it.benchmarkRate * it.quantity,
    0,
  );
  const previousPurchaseTotal = rfq.items.reduce(
    (sum, it) => sum + it.previousPurchaseRate * it.quantity,
    0,
  );

  const rows: ComparisonSupplierRow[] = quotes.map((q) => {
    const supplier = db.suppliers.find((s) => s.id === q.supplierId);
    const rounds = db.negotiations
      .filter((n) => n.rfqId === rfq.id && n.supplierId === q.supplierId)
      .sort((a, b) => b.roundNumber - a.roundNumber);
    const latestNeg = rounds[0];

    let originalBasicTotal = 0;
    let discountTotal = 0;
    let netBasicTotal = 0;
    let gstTotal = 0;
    let freightTotal = 0;
    let packingTotal = 0;
    let toolingTotal = 0;
    let otherChargesTotal = 0;
    let totalLeadTime = 0;

    const itemBreakdown = rfq.items.map((rfqItem) => {
      const qLine = q.items.find((li) => li.rfqItemId === rfqItem.id);
      const negLine = latestNeg?.items.find((ni) => ni.rfqItemId === rfqItem.id);
      const basicTotalForLine = (qLine?.basicUnitPrice || 0) * rfqItem.quantity;
      const netTotalForLine = (qLine?.netUnitPrice || 0) * rfqItem.quantity;
      originalBasicTotal += basicTotalForLine;
      discountTotal += basicTotalForLine - netTotalForLine;
      netBasicTotal += netTotalForLine;
      gstTotal += qLine?.gstAmount || 0;
      freightTotal += qLine?.freight || 0;
      packingTotal += qLine?.packingForwarding || 0;
      toolingTotal += qLine?.toolingCost || 0;
      otherChargesTotal += (qLine?.insurance || 0) + (qLine?.otherCharges || 0);
      totalLeadTime += qLine?.leadTimeDays || 0;

      return {
        rfqItemId: rfqItem.id,
        materialCode: rfqItem.materialCode,
        description: rfqItem.description,
        quantity: rfqItem.quantity,
        uom: rfqItem.uom,
        benchmarkRate: rfqItem.benchmarkRate,
        previousPurchaseRate: rfqItem.previousPurchaseRate,
        originalUnitPrice: qLine?.basicUnitPrice || 0,
        discountPercent: qLine?.discountPercent || 0,
        netUnitPrice: qLine?.netUnitPrice || 0,
        gstPercent: qLine?.gstPercent || 0,
        gstAmount: qLine?.gstAmount || 0,
        freight: qLine?.freight || 0,
        packingForwarding: qLine?.packingForwarding || 0,
        toolingCost: qLine?.toolingCost || 0,
        otherCharges: (qLine?.insurance || 0) + (qLine?.otherCharges || 0),
        totalLandedCost: qLine?.totalLandedCost || 0,
        negotiatedUnitPrice: negLine?.revisedUnitPrice ?? qLine?.netUnitPrice ?? 0,
        leadTimeDays: qLine?.leadTimeDays || 0,
      };
    });

    const latestNegotiatedTotal = latestNeg ? latestNeg.revisedTotal : q.totalLandedCost;
    const effectiveTotal = latestNegotiatedTotal;
    // Compare net basic against benchmark & previous purchase rate
    const netNegotiatedBasic = latestNeg
      ? latestNeg.items.reduce((acc, it) => acc + it.revisedUnitPrice * it.quantity, 0)
      : netBasicTotal;

    const benchmarkVariancePct =
      benchmarkTotal > 0
        ? Number((((netNegotiatedBasic - benchmarkTotal) / benchmarkTotal) * 100).toFixed(2))
        : 0;
    const prevPriceVariancePct =
      previousPurchaseTotal > 0
        ? Number(
            (
              ((netNegotiatedBasic - previousPurchaseTotal) / previousPurchaseTotal) *
              100
            ).toFixed(2),
          )
        : 0;

    return {
      supplierId: q.supplierId,
      supplierName: q.supplierName,
      supplierRegNo: supplier?.supplierRegNo || supplier?.applicationNumber || q.supplierId,
      quotationId: q.id,
      quotationVersion: q.version,
      technicalStatus: q.technicalEval.status,
      technicalScore: q.technicalEval.score || 0,
      qualityScore: supplier?.qualityScore || 0,
      performanceScore: supplier?.performanceScore || 0,
      originalBasicTotal: Number(originalBasicTotal.toFixed(2)),
      discountTotal: Number(discountTotal.toFixed(2)),
      netBasicTotal: Number(netBasicTotal.toFixed(2)),
      gstTotal: Number(gstTotal.toFixed(2)),
      freightTotal: Number(freightTotal.toFixed(2)),
      packingTotal: Number(packingTotal.toFixed(2)),
      toolingTotal: Number(toolingTotal.toFixed(2)),
      otherChargesTotal: Number(otherChargesTotal.toFixed(2)),
      totalLandedCost: q.totalLandedCost,
      latestNegotiatedTotal,
      effectiveTotal,
      avgLeadTimeDays: rfq.items.length ? Math.round(totalLeadTime / rfq.items.length) : 0,
      paymentTerms: q.paymentTerms,
      validityDate: q.validityDate,
      commercialDeviation: q.commercialDeviation,
      technicalDeviation: q.technicalDeviation,
      benchmarkTotal,
      previousPurchaseTotal,
      benchmarkVariancePct,
      prevPriceVariancePct,
      rank: null,
      rankLabel: 'Pending Tech',
      itemBreakdown,
    };
  });

  // Rank eligible quotes (if requireTechEvalFirst, exclude TECHNICALLY_REJECTED from L1 ranking)
  const rankable = rows
    .filter((r) =>
      rfq.requireTechEvalFirst
        ? r.technicalStatus !== 'TECHNICALLY_REJECTED'
        : true,
    )
    .sort((a, b) => a.effectiveTotal - b.effectiveTotal);

  rankable.forEach((row, index) => {
    row.rank = index + 1;
    row.rankLabel = `L${index + 1}`;
  });

  for (const row of rows) {
    if (row.technicalStatus === 'TECHNICALLY_REJECTED') {
      row.rank = null;
      row.rankLabel = 'Tech Rejected';
    }
  }

  return rows.sort((a, b) => {
    if (a.rank === null && b.rank === null) return 0;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });
}

function resolveRateApprovalChain(
  amount: number,
  isL1: boolean,
  benchmarkVariancePct: number,
): RateApprovalStep[] {
  const db = getDb();
  const rules = db.workflowConfig.rateApprovalRules.filter((r) => r.active);
  const matchingRule =
    rules.find(
      (r) => amount >= r.minAmount && (r.maxAmount === null || amount <= r.maxAmount),
    ) || rules[rules.length - 1];

  const stages: RateApprovalStep[] = (matchingRule?.stages || []).map((st, idx) => ({
    stageOrder: idx + 1,
    label: st.label,
    approverType: st.approverType,
    status: 'PENDING',
  }));

  if (!isL1 && !stages.some((s) => s.approverType === 'MANAGEMENT_APPROVER')) {
    stages.push({
      stageOrder: stages.length + 1,
      label: 'Management Exception Approval (Non-L1)',
      approverType: 'MANAGEMENT_APPROVER',
      status: 'PENDING',
    });
  }

  if (benchmarkVariancePct > 5 && !stages.some((s) => s.approverType === 'COSTING_REVIEWER')) {
    stages.splice(1, 0, {
      stageOrder: 2,
      label: 'Costing Tolerance Review (>5% over Benchmark)',
      approverType: 'COSTING_REVIEWER',
      status: 'PENDING',
    });
    stages.forEach((s, i) => {
      s.stageOrder = i + 1;
    });
  }

  return stages;
}

export function createApiRouter(): express.Router {
  const router = express.Router();
  router.use(express.json({limit: '2mb'}));

  // ==================== AUTHENTICATION ====================
  router.get('/auth/demo-accounts', (_req, res) => {
    const db = getDb();
    res.json({
      defaultPassword: 'Srm@2026!',
      accounts: db.users.map((u) => ({
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        approverType: u.approverType,
        designation: u.designation,
      })),
    });
  });

  router.get('/auth/captcha', (_req, res) => {
    res.json(createCaptchaChallenge());
  });

  router.post('/auth/login', (req, res) => {
    const db = getDb();
    const {
      identifier,
      password,
      rememberMe,
      captchaId,
      captchaAnswer,
    } = req.body as {
      identifier?: string;
      password?: string;
      rememberMe?: boolean;
      captchaId?: string;
      captchaAnswer?: string;
    };

    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'Web Client');
    const idLower = (identifier || '').trim().toLowerCase();

    const user = db.users.find(
      (u) =>
        u.username.toLowerCase() === idLower || u.email.toLowerCase() === idLower,
    );

    if (!user) {
      db.loginActivities.unshift({
        id: `LOG-${Date.now()}`,
        username: identifier || 'unknown',
        status: 'FAILED',
        reason: 'User not found',
        ip,
        userAgent: ua,
        timestamp: new Date().toISOString(),
      });
      saveDb();
      res.status(401).json({error: 'Invalid username/email or password'});
      return;
    }

    if (user.status === 'INACTIVE') {
      res.status(403).json({error: 'Account is deactivated. Contact System Admin.'});
      return;
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const minsLeft = Math.ceil(
        (new Date(user.lockedUntil).getTime() - Date.now()) / 60000,
      );
      res.status(423).json({
        error: `Account locked due to failed attempts. Try again in ${minsLeft} minute(s) or contact Admin.`,
        locked: true,
      });
      return;
    }

    // Require CAPTCHA after threshold failed attempts
    if (user.failedLoginAttempts >= db.securitySettings.captchaThreshold) {
      if (!verifyCaptchaChallenge(captchaId, captchaAnswer)) {
        res.status(400).json({
          error: 'Security CAPTCHA verification required or incorrect.',
          requireCaptcha: true,
          captcha: createCaptchaChallenge(),
        });
        return;
      }
    }

    if (!password || !verifyPassword(password, user.passwordHash)) {
      user.failedLoginAttempts += 1;
      const requireCaptcha =
        user.failedLoginAttempts >= db.securitySettings.captchaThreshold;
      if (user.failedLoginAttempts >= db.securitySettings.maxFailedAttempts) {
        user.status = 'LOCKED';
        user.lockedUntil = new Date(
          Date.now() + db.securitySettings.lockDurationMinutes * 60 * 1000,
        ).toISOString();
      }
      db.loginActivities.unshift({
        id: `LOG-${Date.now()}`,
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status === 'LOCKED' ? 'LOCKED' : 'FAILED',
        reason: `Invalid password (attempt ${user.failedLoginAttempts})`,
        ip,
        userAgent: ua,
        timestamp: new Date().toISOString(),
      });
      saveDb();
      res.status(401).json({
        error:
          user.status === 'LOCKED'
            ? 'Account locked due to maximum failed attempts.'
            : 'Invalid username/email or password.',
        requireCaptcha,
        captcha: requireCaptcha ? createCaptchaChallenge() : undefined,
      });
      return;
    }

    // Password expiry check
    const passwordAgeDays =
      (Date.now() - new Date(user.passwordUpdatedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (passwordAgeDays > user.passwordExpiryDays) {
      user.status = 'PASSWORD_EXPIRED';
    }

    // Reset failure counter
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;

    // Optional MFA flow
    if (user.mfaEnabled || (db.securitySettings.enforceMfaForAdmins && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'))) {
      const otp = issueOtp(user.id, 'MFA');
      db.loginActivities.unshift({
        id: `LOG-${Date.now()}`,
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: 'OTP_SENT',
        reason: 'MFA verification code issued',
        ip,
        userAgent: ua,
        timestamp: new Date().toISOString(),
      });
      saveDb();
      res.json({
        mfaRequired: true,
        otpId: otp.otpId,
        demoOtpHint: otp.code,
        userId: user.id,
      });
      return;
    }

    const sessionId = randomBytes(12).toString('hex');
    const refreshToken = randomBytes(24).toString('hex');
    const ttlSeconds = rememberMe ? 86400 * 7 : db.securitySettings.sessionTimeoutMinutes * 60;

    // Enforce concurrent session limit
    const maxSessions = Math.min(
      user.concurrentSessionLimit || 3,
      db.securitySettings.maxConcurrentSessions || 5,
    );
    while (user.activeSessions.length >= maxSessions) {
      user.activeSessions.shift();
    }

    user.activeSessions.push({
      sessionId,
      refreshToken,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      userAgent: ua,
      ip,
    });
    user.lastLoginAt = new Date().toISOString();

    const accessToken = signJwt(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        approverType: user.approverType,
        supplierId: user.supplierId,
        companyId: user.companyId,
        sessionId,
      },
      ttlSeconds,
    );

    db.loginActivities.unshift({
      id: `LOG-${Date.now()}`,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: 'SUCCESS',
      ip,
      userAgent: ua,
      timestamp: new Date().toISOString(),
    });
    saveDb();

    res.json({
      accessToken,
      refreshToken,
      expiresIn: ttlSeconds,
      user: toPublicUser(user),
    });
  });

  router.post('/auth/verify-mfa', (req, res) => {
    const db = getDb();
    const {otpId, code, rememberMe} = req.body as {
      otpId?: string;
      code?: string;
      rememberMe?: boolean;
    };
    const verified = verifyOtp(otpId || '', code || '', 'MFA');
    if (!verified.valid || !verified.target) {
      res.status(400).json({error: 'Invalid or expired MFA verification code'});
      return;
    }
    const user = db.users.find((u) => u.id === verified.target);
    if (!user) {
      res.status(404).json({error: 'User not found'});
      return;
    }

    const sessionId = randomBytes(12).toString('hex');
    const refreshToken = randomBytes(24).toString('hex');
    const ttlSeconds = rememberMe ? 86400 * 7 : db.securitySettings.sessionTimeoutMinutes * 60;
    user.activeSessions.push({
      sessionId,
      refreshToken,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      userAgent: String(req.headers['user-agent'] || 'Web Client'),
      ip: getClientIp(req),
    });
    user.lastLoginAt = new Date().toISOString();

    const accessToken = signJwt(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        approverType: user.approverType,
        supplierId: user.supplierId,
        companyId: user.companyId,
        sessionId,
      },
      ttlSeconds,
    );
    db.loginActivities.unshift({
      id: `LOG-${Date.now()}`,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: 'MFA_VERIFIED',
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || 'Web Client'),
      timestamp: new Date().toISOString(),
    });
    saveDb();
    res.json({accessToken, refreshToken, expiresIn: ttlSeconds, user: toPublicUser(user)});
  });

  router.post('/auth/refresh', (req, res) => {
    const db = getDb();
    const {refreshToken} = req.body as {refreshToken?: string};
    if (!refreshToken) {
      res.status(400).json({error: 'Refresh token required'});
      return;
    }
    for (const user of db.users) {
      const sess = user.activeSessions.find((s) => s.refreshToken === refreshToken);
      if (sess && new Date(sess.expiresAt).getTime() > Date.now()) {
        const newRefresh = randomBytes(24).toString('hex');
        sess.refreshToken = newRefresh;
        sess.lastActiveAt = new Date().toISOString();
        const accessToken = signJwt(
          {
            sub: user.id,
            username: user.username,
            role: user.role,
            approverType: user.approverType,
            supplierId: user.supplierId,
            companyId: user.companyId,
            sessionId: sess.sessionId,
          },
          db.securitySettings.sessionTimeoutMinutes * 60,
        );
        saveDb();
        res.json({accessToken, refreshToken: newRefresh, user: toPublicUser(user)});
        return;
      }
    }
    res.status(401).json({error: 'Invalid or expired refresh token'});
  });

  router.post('/auth/forgot-password', (req, res) => {
    const db = getDb();
    const {email} = req.body as {email?: string};
    const user = db.users.find(
      (u) => u.email.toLowerCase() === (email || '').trim().toLowerCase(),
    );
    if (!user) {
      res.json({sent: true, message: 'If the email is registered, a verification code has been dispatched.'});
      return;
    }
    const otp = issueOtp(user.email, 'RESET');
    db.loginActivities.unshift({
      id: `LOG-${Date.now()}`,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: 'OTP_SENT',
      reason: 'Forgot-password reset OTP issued',
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || 'Web Client'),
      timestamp: new Date().toISOString(),
    });
    saveDb();
    res.json({
      sent: true,
      otpId: otp.otpId,
      demoOtpHint: otp.code,
      message: 'Verification OTP dispatched to registered corporate email.',
    });
  });

  router.post('/auth/reset-password', (req, res) => {
    const db = getDb();
    const {otpId, code, newPassword} = req.body as {
      otpId?: string;
      code?: string;
      newPassword?: string;
    };
    const check = verifyOtp(otpId || '', code || '', 'RESET');
    if (!check.valid || !check.target) {
      res.status(400).json({error: 'Invalid or expired OTP code'});
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({error: 'Password must be at least 8 characters'});
      return;
    }
    const user = db.users.find((u) => u.email === check.target);
    if (!user) {
      res.status(404).json({error: 'Account not found'});
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    user.passwordUpdatedAt = new Date().toISOString();
    user.status = 'ACTIVE';
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    db.loginActivities.unshift({
      id: `LOG-${Date.now()}`,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: 'PASSWORD_RESET',
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || 'Web Client'),
      timestamp: new Date().toISOString(),
    });
    saveDb();
    res.json({success: true});
  });

  router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (req.authUser && req.sessionId) {
      req.authUser.activeSessions = req.authUser.activeSessions.filter(
        (s) => s.sessionId !== req.sessionId,
      );
      db.loginActivities.unshift({
        id: `LOG-${Date.now()}`,
        userId: req.authUser.id,
        username: req.authUser.username,
        email: req.authUser.email,
        role: req.authUser.role,
        status: 'LOGOUT',
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'Web Client'),
        timestamp: new Date().toISOString(),
      });
      saveDb();
    }
    res.json({success: true});
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({user: toPublicUser(req.authUser!)});
  });

  // ==================== PUBLIC SUPPLIER SELF-REGISTRATION ====================
  router.post('/public/register-supplier/otp', (req, res) => {
    const {email, mobile} = req.body as {email?: string; mobile?: string};
    if (!email || !mobile) {
      res.status(400).json({error: 'Email and mobile number are required'});
      return;
    }
    const otp = issueOtp(email, 'SUPPLIER_VERIFY');
    res.json({
      otpId: otp.otpId,
      demoOtpHint: otp.code,
      message: `Verification OTP sent to ${email} and ${mobile}`,
    });
  });

  router.post('/public/register-supplier', (req, res) => {
    const db = getDb();
    if (!db.securitySettings.allowSupplierSelfRegistration) {
      res.status(403).json({error: 'Self-registration is currently disabled by Admin'});
      return;
    }
    const body = req.body as Partial<SupplierApplication> & {
      otpId?: string;
      otpCode?: string;
      password?: string;
      submitNow?: boolean;
    };

    const otpCheck = body.otpId
      ? verifyOtp(body.otpId, body.otpCode || '', 'SUPPLIER_VERIFY')
      : {valid: Boolean(body.otpVerified)};

    if (!otpCheck.valid) {
      res.status(400).json({error: 'OTP verification failed or expired'});
      return;
    }

    if (!body.companyName || !body.email || !body.mobile) {
      res.status(400).json({error: 'Company name, email, and mobile are required'});
      return;
    }

    const appId = `SUP-${Date.now()}`;
    const appNo = nextNumber('SUPPLIER_APP');
    const now = new Date().toISOString();

    const newApp: SupplierApplication = {
      id: appId,
      applicationNumber: appNo,
      status: body.submitNow ? 'SUBMITTED' : 'DRAFT',
      companyName: body.companyName,
      legalEntityType: body.legalEntityType || 'Private Limited',
      email: body.email,
      mobile: body.mobile,
      otpVerified: true,
      registeredAddress: body.registeredAddress || '',
      communicationAddress: body.communicationAddress || body.registeredAddress || '',
      city: body.city || '',
      state: body.state || '',
      country: body.country || 'India',
      gstNumber: body.gstNumber || '',
      panNumber: body.panNumber || '',
      msmeNumber: body.msmeNumber || '',
      msmeCategory: body.msmeCategory || 'NONE',
      supplierCategory: body.supplierCategory || 'Tier-1 Machining & Forgings',
      productCategories: body.productCategories?.length ? body.productCategories : ['CNC Machined Castings'],
      manufacturingCapabilities: body.manufacturingCapabilities || '',
      qualityCertifications: body.qualityCertifications || ['ISO 9001:2015'],
      qualityScore: 80,
      performanceScore: 80,
      annualTurnoverCr: Number(body.annualTurnoverCr || 25),
      primaryContactName: body.primaryContactName || body.companyName,
      primaryContactDesignation: body.primaryContactDesignation || 'Sales Director',
      primaryContactPhone: body.mobile,
      bankDetails: body.bankDetails || {
        bankName: '',
        branchName: '',
        accountNumber: '',
        ifscCode: '',
        accountType: 'Current Account',
        beneficiaryName: body.companyName,
      },
      documents: body.documents || [],
      permittedCorrectionSections: [],
      currentStageIndex: 0,
      approvalHistory: body.submitNow
        ? [
            {
              id: `AH-${Date.now()}`,
              stageLabel: 'Supplier Self-Submission',
              approverId: appId,
              approverName: body.primaryContactName || body.companyName,
              approverRole: 'SUPPLIER',
              action: 'SUBMIT',
              remarks: 'Submitted via Supplier Onboarding Portal.',
              previousStatus: 'DRAFT',
              newStatus: 'SUBMITTED',
              timestamp: now,
            },
          ]
        : [],
      plantIds: body.plantIds?.length ? body.plantIds : ['PLT-1010'],
      createdAt: now,
      updatedAt: now,
    };

    if (body.submitNow) {
      // Auto-route to first configured onboarding stage (SCM_REVIEW)
      newApp.status = 'SCM_REVIEW';
    }

    db.suppliers.unshift(newApp);

    // Create supplier portal user account
    const username =
      body.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase() +
      '.' +
      Math.floor(10 + Math.random() * 89);
    const newUser: InternalUser = {
      id: `USR-${Date.now()}`,
      username,
      email: body.email,
      fullName: `${newApp.primaryContactName} (${newApp.companyName})`,
      role: 'SUPPLIER',
      designation: newApp.primaryContactDesignation,
      companyId: 'COMP-01',
      plantIds: newApp.plantIds,
      departmentIds: [],
      purchasingGroups: [],
      supplierId: appId,
      mfaEnabled: false,
      status: 'ACTIVE',
      passwordUpdatedAt: now,
      passwordExpiryDays: 90,
      concurrentSessionLimit: 3,
      createdAt: now,
      passwordHash: hashPassword(body.password || 'Srm@2026!'),
      failedLoginAttempts: 0,
      activeSessions: [],
    };
    db.users.push(newUser);

    recordAudit({
      userId: newUser.id,
      userName: newUser.fullName,
      userRole: 'SUPPLIER',
      action: body.submitNow ? 'SUPPLIER_REGISTERED_SUBMITTED' : 'SUPPLIER_DRAFT_CREATED',
      module: 'Supplier Registration',
      entityType: 'SupplierApplication',
      entityId: newApp.id,
      entityNumber: newApp.applicationNumber,
      newState: newApp.status,
      remarks: 'Self-registered through Supplier Portal.',
      ipAddress: getClientIp(req),
    });

    saveDb();
    res.status(201).json({
      supplier: newApp,
      portalUsername: username,
    });
  });

  // ==================== MASTER DATA & REFERENCE ====================
  router.get('/reference', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({
      companies: db.companies,
      plants: db.plants,
      departments: db.departments,
      materialCategories: db.materialCategories,
      supplierCategories: db.supplierCategories,
      taxes: db.taxes,
      currencies: db.currencies,
      uoms: db.uoms,
      incoterms: db.incoterms,
      paymentTerms: db.paymentTerms,
      workflowConfig: db.workflowConfig,
    });
  });

  // ==================== DASHBOARDS ====================
  router.get('/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;

    const permittedRfqs =
      user.role === 'SUPPLIER'
        ? db.rfqs.filter((r) => r.invitedSupplierIds.includes(user.supplierId || ''))
        : db.rfqs.filter(
            (r) =>
              user.role === 'SUPER_ADMIN' ||
              user.role === 'ADMIN' ||
              user.role === 'AUDITOR' ||
              user.plantIds.includes(r.plantId),
          );

    const supplierStatusCounts = db.suppliers.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    const rfqStatusCounts = permittedRfqs.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const pendingSupplierApprovals = db.suppliers.filter((s) =>
      ['SUBMITTED', 'SCM_REVIEW', 'FINANCE_REVIEW', 'QUALITY_REVIEW', 'FINAL_APPROVAL'].includes(
        s.status,
      ),
    );
    const pendingRfqApprovals = permittedRfqs.filter((r) => r.status === 'PENDING_APPROVAL');
    const pendingRateApprovals = db.rateRecommendations.filter((rec) =>
      ['PENDING_APPROVAL', 'ON_HOLD', 'INFO_REQUESTED'].includes(rec.status),
    );

    const totalSavings = db.rateRecommendations.reduce(
      (sum, rec) => sum + (rec.absoluteSaving || 0),
      0,
    );
    const totalAwardedValue = db.rateRecommendations
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.totalBusinessValue, 0);

    const totalInvited = permittedRfqs
      .filter((r) => r.status !== 'DRAFT')
      .reduce((sum, r) => sum + r.participations.length, 0);
    const totalQuoted = permittedRfqs
      .filter((r) => r.status !== 'DRAFT')
      .reduce(
        (sum, r) => sum + r.participations.filter((p) => p.status === 'QUOTED').length,
        0,
      );
    const participationRate =
      totalInvited > 0 ? Math.round((totalQuoted / totalInvited) * 100) : 0;

    const mySupplierRecord = user.supplierId
      ? db.suppliers.find((s) => s.id === user.supplierId)
      : undefined;

    res.json({
      role: user.role,
      approverType: user.approverType,
      adminMetrics: {
        totalUsers: db.users.length,
        activeUsers: db.users.filter((u) => u.status === 'ACTIVE').length,
        totalSuppliers: db.suppliers.length,
        activeSuppliers: db.suppliers.filter((s) => s.status === 'ACTIVE').length,
        pendingSupplierApprovals: pendingSupplierApprovals.length,
        openRfqs: permittedRfqs.filter((r) =>
          ['PUBLISHED', 'EVALUATION', 'NEGOTIATION', 'RATE_APPROVAL'].includes(r.status),
        ).length,
        pendingApprovals:
          pendingSupplierApprovals.length +
          pendingRfqApprovals.length +
          pendingRateApprovals.length,
        failedNotifications: db.notifications.filter((n) => n.status === 'FAILED').length,
        supplierStatusCounts,
        rfqStatusCounts,
        recentWorkflows: [
          ...pendingSupplierApprovals.map((s) => ({
            id: s.id,
            ref: s.applicationNumber,
            title: s.companyName,
            stage: s.status,
            updatedAt: s.updatedAt,
          })),
          ...pendingRateApprovals.map((r) => ({
            id: r.rfqId,
            ref: db.rfqs.find((q) => q.id === r.rfqId)?.rfqNumber || r.rfqId,
            title: `Rate Approval · ${r.recommendedSupplierName}`,
            stage: r.approvalChain[r.currentStepIndex]?.label || r.status,
            updatedAt: r.submittedAt,
          })),
        ].slice(0, 6),
        recentLoginActivities: db.loginActivities.slice(0, 8),
        auditExceptions: db.rateRecommendations
          .filter((r) => !r.isL1)
          .map((r) => ({
            rfqId: r.rfqId,
            rfqNumber: db.rfqs.find((q) => q.id === r.rfqId)?.rfqNumber || r.rfqId,
            supplierName: r.recommendedSupplierName,
            reason: r.nonL1Justification || 'Non-L1 Exception',
            value: r.totalBusinessValue,
          })),
      },
      buyerMetrics: {
        draftRfqs: permittedRfqs.filter((r) => r.status === 'DRAFT').length,
        pendingApprovalRfqs: pendingRfqApprovals.length,
        publishedRfqs: permittedRfqs.filter((r) => r.status === 'PUBLISHED').length,
        responsePendingCount: permittedRfqs
          .filter((r) => r.status === 'PUBLISHED')
          .reduce(
            (sum, r) =>
              sum + r.participations.filter((p) => p.status !== 'QUOTED' && p.status !== 'DECLINED').length,
            0,
          ),
        underEvaluation: permittedRfqs.filter((r) => r.status === 'EVALUATION').length,
        negotiationsInProgress: permittedRfqs.filter((r) => r.status === 'NEGOTIATION').length,
        rateApprovalsPending: pendingRateApprovals.length,
        awardedRfqs: permittedRfqs.filter((r) => r.status === 'AWARDED' || r.status === 'CLOSED').length,
        overdueActivities: permittedRfqs.filter(
          (r) =>
            r.status === 'PUBLISHED' &&
            new Date(r.quotationDeadline).getTime() < Date.now(),
        ).length,
        upcomingDeadlines: permittedRfqs
          .filter((r) => r.status === 'PUBLISHED')
          .map((r) => ({
            id: r.id,
            rfqNumber: r.rfqNumber,
            title: r.title,
            deadline: r.quotationDeadline,
            quotedCount: r.participations.filter((p) => p.status === 'QUOTED').length,
            invitedCount: r.participations.length,
          })),
        recentResponses: db.quotations
          .filter((q) => q.status !== 'DRAFT')
          .slice(0, 6)
          .map((q) => ({
            rfqId: q.rfqId,
            rfqNumber: db.rfqs.find((r) => r.id === q.rfqId)?.rfqNumber || q.rfqId,
            supplierName: q.supplierName,
            totalLandedCost: q.totalLandedCost,
            submittedAt: q.submittedAt,
            techStatus: q.technicalEval.status,
          })),
        totalSavings,
        totalAwardedValue,
        participationRate,
        approvalAging: pendingRateApprovals.map((rec) => ({
          rfqId: rec.rfqId,
          rfqNumber: db.rfqs.find((r) => r.id === rec.rfqId)?.rfqNumber || rec.rfqId,
          stage: rec.approvalChain[rec.currentStepIndex]?.label || rec.status,
          hoursPending: Math.max(
            1,
            Math.round((Date.now() - new Date(rec.submittedAt).getTime()) / 3600000),
          ),
        })),
      },
      approverMetrics: {
        supplierApprovalsPending: pendingSupplierApprovals.filter((s) => {
          if (!user.approverType) return true;
          if (user.approverType === 'SCM_REVIEWER') return s.status === 'SCM_REVIEW' || s.status === 'SUBMITTED';
          if (user.approverType === 'FINANCE_REVIEWER') return s.status === 'FINANCE_REVIEW';
          if (user.approverType === 'QUALITY_REVIEWER') return s.status === 'QUALITY_REVIEW';
          if (user.approverType === 'PURCHASE_HEAD') return s.status === 'FINAL_APPROVAL';
          return false;
        }).length,
        totalSupplierPending: pendingSupplierApprovals.length,
        rfqApprovalsPending: pendingRfqApprovals.length,
        technicalApprovalsPending: db.quotations.filter(
          (q) => q.status !== 'DRAFT' && q.technicalEval.status === 'PENDING',
        ).length,
        rateApprovalsPending: pendingRateApprovals.length,
        awardedContractsCount: db.rateRecommendations.filter((r) => r.status === 'APPROVED').length,
        recentAuditLogs: db.auditLogs.slice(0, 8),
        evaluationFeedback: db.quotations
          .filter((q) => q.technicalEval.status !== 'PENDING')
          .slice(0, 5)
          .map((q) => ({
            rfqId: q.rfqId,
            rfqNumber: db.rfqs.find((r) => r.id === q.rfqId)?.rfqNumber || q.rfqId,
            supplierName: q.supplierName,
            status: q.technicalEval.status,
            score: q.technicalEval.score,
            remarks: q.technicalEval.remarks,
          })),
      },
      supplierMetrics: {
        profile: mySupplierRecord,
        invitedRfqsCount: permittedRfqs.length,
        openRfqsCount: permittedRfqs.filter((r) => r.status === 'PUBLISHED').length,
        submittedQuotesCount: db.quotations.filter(
          (q) => q.supplierId === user.supplierId && q.status !== 'DRAFT',
        ).length,
        activeNegotiationsCount: db.negotiations.filter(
          (n) => n.supplierId === user.supplierId && !n.supplierConfirmed,
        ).length,
        awardedCount: db.rateRecommendations.filter(
          (r) =>
            r.recommendedSupplierId === user.supplierId &&
            r.status === 'APPROVED' &&
            Boolean(r.awardedAt),
        ).length,
      },
      recentAuditLogs: db.auditLogs.slice(0, 12),
    });
  });

  // ==================== SUPPLIERS ====================
  router.get('/suppliers', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (user.role === 'SUPPLIER') {
      res.json(db.suppliers.filter((s) => s.id === user.supplierId));
      return;
    }
    res.json(db.suppliers);
  });

  router.get('/suppliers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const supplier = db.suppliers.find((s) => s.id === req.params['id']);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found'});
      return;
    }
    if (user.role === 'SUPPLIER' && supplier.id !== user.supplierId) {
      res.status(403).json({error: 'Access denied to other supplier records'});
      return;
    }
    res.json(supplier);
  });

  router.post('/suppliers', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['BUYER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Insufficient permissions to initiate supplier onboarding'});
      return;
    }
    const body = req.body as Partial<SupplierApplication> & {submitNow?: boolean};
    if (!body.companyName || !body.email || !body.mobile) {
      res.status(400).json({error: 'Company name, email, and mobile are required'});
      return;
    }
    const now = new Date().toISOString();
    const newSup: SupplierApplication = {
      id: `SUP-${Date.now()}`,
      applicationNumber: nextNumber('SUPPLIER_APP'),
      status: body.submitNow ? 'SCM_REVIEW' : 'DRAFT',
      companyName: body.companyName,
      legalEntityType: body.legalEntityType || 'Private Limited',
      email: body.email,
      mobile: body.mobile,
      otpVerified: true,
      registeredAddress: body.registeredAddress || '',
      communicationAddress: body.communicationAddress || body.registeredAddress || '',
      city: body.city || '',
      state: body.state || '',
      country: body.country || 'India',
      gstNumber: body.gstNumber || '',
      panNumber: body.panNumber || '',
      msmeNumber: body.msmeNumber || '',
      msmeCategory: body.msmeCategory || 'NONE',
      supplierCategory: body.supplierCategory || 'Tier-1 Machining & Forgings',
      productCategories: body.productCategories?.length ? body.productCategories : ['CNC Machined Castings'],
      manufacturingCapabilities: body.manufacturingCapabilities || '',
      qualityCertifications: body.qualityCertifications || ['ISO 9001:2015'],
      qualityScore: 85,
      performanceScore: 85,
      annualTurnoverCr: Number(body.annualTurnoverCr || 50),
      primaryContactName: body.primaryContactName || '',
      primaryContactDesignation: body.primaryContactDesignation || 'Sales Manager',
      primaryContactPhone: body.primaryContactPhone || body.mobile,
      bankDetails: body.bankDetails || {
        bankName: '',
        branchName: '',
        accountNumber: '',
        ifscCode: '',
        accountType: 'Current Account',
        beneficiaryName: body.companyName,
      },
      documents: body.documents || [
        {
          id: `DOC-${Date.now()}-1`,
          docType: 'GST_CERTIFICATE',
          fileName: `${body.companyName.replace(/\s+/g, '_')}_GST.pdf`,
          fileSize: '320 KB',
          uploadedAt: now,
          verified: false,
        },
        {
          id: `DOC-${Date.now()}-2`,
          docType: 'PAN_CARD',
          fileName: `${body.companyName.replace(/\s+/g, '_')}_PAN.pdf`,
          fileSize: '210 KB',
          uploadedAt: now,
          verified: false,
        },
      ],
      permittedCorrectionSections: [],
      currentStageIndex: 0,
      approvalHistory: body.submitNow
        ? [
            {
              id: `AH-${Date.now()}`,
              stageLabel: 'Onboarding Initiated',
              approverId: user.id,
              approverName: user.fullName,
              approverRole: user.role,
              action: 'SUBMIT',
              remarks: 'Initiated by buyer and routed to SCM Review.',
              previousStatus: 'DRAFT',
              newStatus: 'SCM_REVIEW',
              timestamp: now,
            },
          ]
        : [],
      plantIds: body.plantIds?.length ? body.plantIds : ['PLT-1010'],
      createdAt: now,
      updatedAt: now,
    };

    db.suppliers.unshift(newSup);
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SUPPLIER_CREATED',
      module: 'Supplier Onboarding',
      entityType: 'SupplierApplication',
      entityId: newSup.id,
      entityNumber: newSup.applicationNumber,
      newState: newSup.status,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.status(201).json(newSup);
  });

  router.put('/suppliers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const supplier = db.suppliers.find((s) => s.id === req.params['id']);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found'});
      return;
    }

    if (user.role === 'SUPPLIER') {
      if (supplier.id !== user.supplierId) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      if (!['DRAFT', 'CORRECTION_REQUIRED', 'INFO_REQUESTED'].includes(supplier.status)) {
        res.status(400).json({
          error: 'Submitted application cannot be edited unless sent back for correction',
        });
        return;
      }
    } else if (!['BUYER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }

    const patch = req.body as Partial<SupplierApplication>;
    const prevState = supplier.status;
    Object.assign(supplier, {
      companyName: patch.companyName ?? supplier.companyName,
      legalEntityType: patch.legalEntityType ?? supplier.legalEntityType,
      registeredAddress: patch.registeredAddress ?? supplier.registeredAddress,
      communicationAddress: patch.communicationAddress ?? supplier.communicationAddress,
      city: patch.city ?? supplier.city,
      state: patch.state ?? supplier.state,
      gstNumber: patch.gstNumber ?? supplier.gstNumber,
      panNumber: patch.panNumber ?? supplier.panNumber,
      msmeNumber: patch.msmeNumber ?? supplier.msmeNumber,
      msmeCategory: patch.msmeCategory ?? supplier.msmeCategory,
      supplierCategory: patch.supplierCategory ?? supplier.supplierCategory,
      productCategories: patch.productCategories ?? supplier.productCategories,
      manufacturingCapabilities:
        patch.manufacturingCapabilities ?? supplier.manufacturingCapabilities,
      qualityCertifications: patch.qualityCertifications ?? supplier.qualityCertifications,
      primaryContactName: patch.primaryContactName ?? supplier.primaryContactName,
      primaryContactDesignation:
        patch.primaryContactDesignation ?? supplier.primaryContactDesignation,
      primaryContactPhone: patch.primaryContactPhone ?? supplier.primaryContactPhone,
      bankDetails: patch.bankDetails ?? supplier.bankDetails,
      documents: patch.documents ?? supplier.documents,
      updatedAt: new Date().toISOString(),
    });

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SUPPLIER_UPDATED',
      module: 'Supplier Onboarding',
      entityType: 'SupplierApplication',
      entityId: supplier.id,
      entityNumber: supplier.applicationNumber,
      previousState: prevState,
      newState: supplier.status,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(supplier);
  });

  router.post('/suppliers/:id/submit', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const supplier = db.suppliers.find((s) => s.id === req.params['id']);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found'});
      return;
    }
    if (!supplier.gstNumber || !supplier.panNumber || !supplier.bankDetails.accountNumber) {
      res.status(400).json({
        error: 'Mandatory GST, PAN, and Bank Account details must be completed before submission.',
      });
      return;
    }
    const prev = supplier.status;
    supplier.status = 'SCM_REVIEW';
    supplier.currentStageIndex = 0;
    supplier.permittedCorrectionSections = [];
    supplier.updatedAt = new Date().toISOString();
    supplier.approvalHistory.push({
      id: `AH-${Date.now()}`,
      stageLabel: prev === 'CORRECTION_REQUIRED' ? 'Correction Resubmission' : 'Application Submission',
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.role,
      action: prev === 'CORRECTION_REQUIRED' ? 'RESUBMIT' : 'SUBMIT',
      remarks: (req.body as {remarks?: string}).remarks || 'Submitted for multi-stage approval.',
      previousStatus: prev,
      newStatus: 'SCM_REVIEW',
      timestamp: supplier.updatedAt,
    });

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SUPPLIER_SUBMITTED',
      module: 'Supplier Onboarding',
      entityType: 'SupplierApplication',
      entityId: supplier.id,
      entityNumber: supplier.applicationNumber,
      previousState: prev,
      newState: 'SCM_REVIEW',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(supplier);
  });

  router.post('/suppliers/:id/workflow-action', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['APPROVER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Only authorized reviewers/approvers can perform workflow actions'});
      return;
    }
    const supplier = db.suppliers.find((s) => s.id === req.params['id']);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found'});
      return;
    }
    const {action, remarks, permittedSections, attachmentName} = req.body as {
      action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO';
      remarks?: string;
      permittedSections?: string[];
      attachmentName?: string;
    };

    if (!remarks || !remarks.trim()) {
      res.status(400).json({error: 'Reviewer remarks are mandatory for workflow actions'});
      return;
    }

    const prevStatus = supplier.status;
    let newStatus = prevStatus;
    let stageLabel = 'Review';

    if (prevStatus === 'SUBMITTED' || prevStatus === 'SCM_REVIEW') stageLabel = 'SCM Review';
    else if (prevStatus === 'FINANCE_REVIEW') stageLabel = 'Finance Review';
    else if (prevStatus === 'QUALITY_REVIEW') stageLabel = 'Quality Review';
    else if (prevStatus === 'FINAL_APPROVAL') stageLabel = 'Purchase Head Final Approval';

    if (action === 'APPROVE') {
      if (prevStatus === 'SUBMITTED' || prevStatus === 'SCM_REVIEW') {
        newStatus = 'FINANCE_REVIEW';
        supplier.currentStageIndex = 1;
      } else if (prevStatus === 'FINANCE_REVIEW') {
        newStatus = 'QUALITY_REVIEW';
        supplier.currentStageIndex = 2;
      } else if (prevStatus === 'QUALITY_REVIEW') {
        newStatus = 'FINAL_APPROVAL';
        supplier.currentStageIndex = 3;
      } else if (prevStatus === 'FINAL_APPROVAL' || prevStatus === 'ON_HOLD' || prevStatus === 'INFO_REQUESTED') {
        newStatus = 'APPROVED';
        supplier.currentStageIndex = 4;
        if (!supplier.supplierRegNo) {
          supplier.supplierRegNo = nextNumber('SUPPLIER_REG');
        }
      }
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      supplier.rejectionReason = remarks;
    } else if (action === 'SEND_BACK') {
      newStatus = 'CORRECTION_REQUIRED';
      supplier.permittedCorrectionSections =
        permittedSections && permittedSections.length > 0
          ? permittedSections
          : ['bankDetails', 'documents', 'companyInfo'];
    } else if (action === 'HOLD') {
      newStatus = 'ON_HOLD';
    } else if (action === 'REQUEST_INFO') {
      newStatus = 'INFO_REQUESTED';
      supplier.permittedCorrectionSections = permittedSections || ['documents'];
    }

    const now = new Date().toISOString();
    supplier.status = newStatus;
    supplier.updatedAt = now;
    supplier.approvalHistory.push({
      id: `AH-${Date.now()}`,
      stageLabel,
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.approverType || user.role,
      action,
      remarks,
      previousStatus: prevStatus,
      newStatus,
      attachmentName,
      timestamp: now,
    });

    db.notifications.unshift({
      id: `NOTIF-${Date.now()}`,
      recipientSupplierId: supplier.id,
      title: `Supplier Onboarding Update: ${supplier.applicationNumber}`,
      message: `Status changed from ${prevStatus} to ${newStatus}. Remarks: ${remarks}`,
      severity: action === 'REJECT' || action === 'SEND_BACK' ? 'WARNING' : 'INFO',
      status: 'DELIVERED',
      channel: 'BOTH',
      relatedModule: 'Supplier Onboarding',
      relatedEntityId: supplier.id,
      createdAt: now,
    });

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.approverType || user.role,
      action: `SUPPLIER_${action}`,
      module: 'Supplier Approval Workflow',
      entityType: 'SupplierApplication',
      entityId: supplier.id,
      entityNumber: supplier.applicationNumber,
      previousState: prevStatus,
      newState: newStatus,
      remarks,
      ipAddress: getClientIp(req),
    });

    saveDb();
    res.json(supplier);
  });

  router.post('/suppliers/:id/activate', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Only Admin or Super Admin can activate suppliers'});
      return;
    }
    const supplier = db.suppliers.find((s) => s.id === req.params['id']);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found'});
      return;
    }
    if (supplier.status !== 'APPROVED' && supplier.status !== 'BLOCKED') {
      res.status(400).json({error: 'Supplier must be Approved before activation'});
      return;
    }
    const prev = supplier.status;
    supplier.status = 'ACTIVE';
    if (!supplier.supplierRegNo) supplier.supplierRegNo = nextNumber('SUPPLIER_REG');
    if (!supplier.sapVendorCode) {
      supplier.sapVendorCode = `000010${Math.floor(5000 + Math.random() * 4000)}`;
    }
    const now = new Date().toISOString();
    supplier.updatedAt = now;
    supplier.approvalHistory.push({
      id: `AH-${Date.now()}`,
      stageLabel: 'Vendor Activation & SAP Sync',
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.role,
      action: 'ACTIVATE',
      remarks: `Activated with SAP Vendor ${supplier.sapVendorCode}. Eligible for RFQ participation.`,
      previousStatus: prev,
      newStatus: 'ACTIVE',
      timestamp: now,
    });

    db.sapIntegrations.unshift({
      id: `SAP-${Date.now()}`,
      direction: 'OUTBOUND',
      objectType: 'VENDOR_MASTER',
      tcode: 'BP / XK01',
      bapiOrService: 'API_BUSINESS_PARTNER',
      entityId: supplier.id,
      entityNumber: supplier.supplierRegNo,
      sapObjectId: supplier.sapVendorCode,
      status: 'READY',
      payloadPreview: {
        BusinessPartner: supplier.sapVendorCode,
        CompanyName: supplier.companyName,
        GSTIN: supplier.gstNumber,
        PAN: supplier.panNumber,
        IFSC: supplier.bankDetails.ifscCode,
      },
      lastMessage: 'Vendor Master payload staged for SAP S/4HANA replication.',
    });

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SUPPLIER_ACTIVATED',
      module: 'Supplier Master',
      entityType: 'SupplierApplication',
      entityId: supplier.id,
      entityNumber: supplier.supplierRegNo,
      previousState: prev,
      newState: 'ACTIVE',
      remarks: `SAP Vendor ${supplier.sapVendorCode}`,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(supplier);
  });

  router.post('/suppliers/:id/block', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Only Admin or Super Admin can block/reopen suppliers'});
      return;
    }
    const supplier = db.suppliers.find((s) => s.id === req.params['id']);
    if (!supplier) {
      res.status(404).json({error: 'Supplier not found'});
      return;
    }
    const {action, remarks} = req.body as {action: 'BLOCK' | 'REOPEN'; remarks?: string};
    const prev = supplier.status;
    supplier.status = action === 'BLOCK' ? 'BLOCKED' : 'SCM_REVIEW';
    supplier.updatedAt = new Date().toISOString();
    supplier.approvalHistory.push({
      id: `AH-${Date.now()}`,
      stageLabel: action === 'BLOCK' ? 'Supplier Blocking' : 'Application Reopened',
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.role,
      action: action === 'BLOCK' ? 'BLOCK' : 'REOPEN',
      remarks: remarks || (action === 'BLOCK' ? 'Blocked by Administrator' : 'Reopened for review'),
      previousStatus: prev,
      newStatus: supplier.status,
      timestamp: supplier.updatedAt,
    });
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: `SUPPLIER_${action}`,
      module: 'Supplier Master',
      entityType: 'SupplierApplication',
      entityId: supplier.id,
      entityNumber: supplier.applicationNumber,
      previousState: prev,
      newState: supplier.status,
      remarks,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(supplier);
  });

  // ==================== RFQS & SOURCING LIFECYCLE ====================
  router.get('/rfqs', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    let list = db.rfqs;
    if (user.role === 'SUPPLIER') {
      list = list.filter(
        (r) =>
          r.invitedSupplierIds.includes(user.supplierId || '') &&
          !['DRAFT', 'PENDING_APPROVAL'].includes(r.status),
      );
    } else if (!['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(user.role)) {
      list = list.filter((r) => user.plantIds.includes(r.plantId));
    }
    res.json(list);
  });

  router.get('/rfqs/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }

    if (user.role === 'SUPPLIER') {
      if (!rfq.invitedSupplierIds.includes(user.supplierId || '')) {
        res.status(403).json({error: 'You are not invited to this RFQ'});
        return;
      }
      // Strict sealed-bid privacy: scrub other suppliers' participation & clarifications if private
      const sanitizedRfq: Rfq = {
        ...rfq,
        participations: rfq.participations.filter(
          (p) => p.supplierId === user.supplierId,
        ),
        clarifications: rfq.clarifications.filter(
          (c) => c.supplierId === user.supplierId || c.status === 'ANSWERED',
        ),
      };
      const myQuotes = db.quotations.filter(
        (q) => q.rfqId === rfq.id && q.supplierId === user.supplierId,
      );
      const myNegotiations = db.negotiations.filter(
        (n) => n.rfqId === rfq.id && n.supplierId === user.supplierId,
      );
      const rec = db.rateRecommendations.find((r) => r.rfqId === rfq.id);
      const awardStatus =
        rfq.status === 'AWARDED' || rfq.status === 'CLOSED'
          ? rec?.recommendedSupplierId === user.supplierId
            ? 'AWARDED_TO_YOU'
            : 'CLOSED_AWARDED_OTHER'
          : 'PENDING';

      res.json({
        rfq: sanitizedRfq,
        quotations: myQuotes,
        negotiations: myNegotiations,
        comparison: [], // Competitors NEVER visible to supplier
        recommendation: null,
        awardStatus,
      });
      return;
    }

    const quotations = db.quotations.filter((q) => q.rfqId === rfq.id);
    const negotiations = db.negotiations.filter((n) => n.rfqId === rfq.id);
    const comparison = buildComparisonForRfq(rfq);
    const recommendation = db.rateRecommendations.find((r) => r.rfqId === rfq.id) || null;

    res.json({
      rfq,
      quotations,
      negotiations,
      comparison,
      recommendation,
      awardStatus: rfq.status,
    });
  });

  router.post('/rfqs', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Only Buyers or Admins can create RFQs'});
      return;
    }
    const body = req.body as Partial<Rfq> & {submitForApproval?: boolean};

    // Check active duplicate material codes
    const newMaterialCodes = new Set((body.items || []).map((i) => i.materialCode));
    const duplicateRfqs = db.rfqs.filter(
      (r) =>
        ['PUBLISHED', 'PENDING_APPROVAL', 'EVALUATION', 'NEGOTIATION'].includes(r.status) &&
        r.plantId === body.plantId &&
        r.items.some((it) => newMaterialCodes.has(it.materialCode)),
    );

    if (body.submitForApproval) {
      if (!body.items || body.items.length === 0) {
        res.status(400).json({error: 'Validation failed: At least one line item is required'});
        return;
      }
      if (!body.invitedSupplierIds || body.invitedSupplierIds.length === 0) {
        res.status(400).json({error: 'Validation failed: Select at least one Active supplier'});
        return;
      }
      if (!body.quotationDeadline || new Date(body.quotationDeadline).getTime() <= Date.now()) {
        res.status(400).json({error: 'Validation failed: Quotation deadline must be in the future'});
        return;
      }
      const inactiveInvited = body.invitedSupplierIds.filter((sid) => {
        const sup = db.suppliers.find((s) => s.id === sid);
        return !sup || sup.status !== 'ACTIVE';
      });
      if (inactiveInvited.length > 0) {
        res.status(400).json({error: 'Validation failed: All invited suppliers must be ACTIVE'});
        return;
      }
    }

    const now = new Date().toISOString();
    const rfqId = `RFQ-${Date.now()}`;
    const rfqNumber = nextNumber('RFQ');
    const invitedIds = body.invitedSupplierIds || [];

    const initialStatus: Rfq['status'] = body.submitForApproval
      ? db.workflowConfig.requireRfqApprovalBeforePublish
        ? 'PENDING_APPROVAL'
        : 'PUBLISHED'
      : 'DRAFT';

    const newRfq: Rfq = {
      id: rfqId,
      rfqNumber,
      title: body.title || 'Untitled Sourcing RFQ',
      project: body.project || 'PRJ-GENERAL',
      companyId: user.companyId,
      plantId: body.plantId || 'PLT-1010',
      departmentId: body.departmentId || 'DEPT-PC',
      purchasingGroup: body.purchasingGroup || 'PG-01',
      materialCategory: body.materialCategory || 'CNC Machined Castings',
      currency: body.currency || 'INR',
      quotationDeadline: body.quotationDeadline || new Date(Date.now() + 7 * 86400000).toISOString(),
      requiredDeliveryDate: body.requiredDeliveryDate || new Date(Date.now() + 45 * 86400000).toISOString(),
      deliveryLocation: body.deliveryLocation || 'Pune Chakan Plant 1010',
      technicalContact: body.technicalContact || 'Suresh Patel',
      commercialContact: body.commercialContact || user.fullName,
      paymentTerms: body.paymentTerms || 'NET45',
      incoterms: body.incoterms || 'DAP',
      termsAndConditions: body.termsAndConditions || 'Standard AutoCorp Sourcing Terms.',
      allowRevisions: body.allowRevisions ?? true,
      requireTechEvalFirst: body.requireTechEvalFirst ?? true,
      minSuppliersRequired: body.minSuppliersRequired || 2,
      status: initialStatus,
      items: (body.items || []).map((it, idx) => ({
        ...it,
        id: it.id || `ITEM-${Date.now()}-${idx + 1}`,
        lineNo: (idx + 1) * 10,
      })),
      attachments: body.attachments || [],
      invitedSupplierIds: invitedIds,
      participations: invitedIds.map((sid) => {
        const sup = db.suppliers.find((s) => s.id === sid);
        return {
          supplierId: sid,
          supplierName: sup?.companyName || sid,
          status: 'INVITED',
          updatedAt: now,
        };
      }),
      clarifications: [],
      rfqApprovalChain:
        initialStatus === 'PENDING_APPROVAL'
          ? db.workflowConfig.rfqPublishStages.map((s) => ({
              stageOrder: s.stageOrder,
              label: s.label,
              approverType: s.approverType,
              status: 'PENDING',
            }))
          : [],
      rfqApprovalHistory: body.submitForApproval
        ? [
            {
              id: `RA-${Date.now()}`,
              stageLabel: 'Buyer Submission',
              approverId: user.id,
              approverName: user.fullName,
              approverRole: user.role,
              action: 'SUBMIT',
              remarks: 'Submitted RFQ for publishing approval.',
              previousStatus: 'DRAFT',
              newStatus: initialStatus,
              timestamp: now,
            },
          ]
        : [],
      currentRfqApprovalStep: 0,
      deadlineHistory: [],
      createdBy: user.id,
      createdByName: user.fullName,
      createdAt: now,
      updatedAt: now,
    };

    db.rfqs.unshift(newRfq);
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RFQ_CREATED',
      module: 'RFQ Management',
      entityType: 'Rfq',
      entityId: newRfq.id,
      entityNumber: newRfq.rfqNumber,
      newState: newRfq.status,
      ipAddress: getClientIp(req),
    });
    saveDb();

    res.status(201).json({
      rfq: newRfq,
      duplicateWarning:
        duplicateRfqs.length > 0
          ? `Note: Active RFQ(s) ${duplicateRfqs.map((d) => d.rfqNumber).join(', ')} already source matching material codes.`
          : null,
    });
  });

  router.post('/rfqs/:id/submit-approval', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    if (rfq.items.length === 0 || rfq.invitedSupplierIds.length === 0) {
      res.status(400).json({error: 'RFQ requires at least one line item and one active supplier'});
      return;
    }
    const prev = rfq.status;
    rfq.status = db.workflowConfig.requireRfqApprovalBeforePublish
      ? 'PENDING_APPROVAL'
      : 'APPROVED';
    rfq.rfqApprovalChain = db.workflowConfig.rfqPublishStages.map((s) => ({
      stageOrder: s.stageOrder,
      label: s.label,
      approverType: s.approverType,
      status: 'PENDING',
    }));
    rfq.currentRfqApprovalStep = 0;
    rfq.updatedAt = new Date().toISOString();
    rfq.rfqApprovalHistory.push({
      id: `RA-${Date.now()}`,
      stageLabel: 'Submitted for RFQ Approval',
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.role,
      action: 'SUBMIT',
      remarks: 'Submitted for internal RFQ validation prior to supplier release.',
      previousStatus: prev,
      newStatus: rfq.status,
      timestamp: rfq.updatedAt,
    });
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RFQ_SUBMITTED_FOR_APPROVAL',
      module: 'RFQ Approval Workflow',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      previousState: prev,
      newState: rfq.status,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rfq);
  });

  router.post('/rfqs/:id/approval-action', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['APPROVER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Only Approvers can act on RFQ approvals'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    const {action, remarks} = req.body as {
      action: 'APPROVE' | 'REJECT' | 'SEND_BACK';
      remarks?: string;
    };
    if (!remarks && action !== 'APPROVE') {
      res.status(400).json({error: 'Remarks are required for Reject or Send Back'});
      return;
    }

    const now = new Date().toISOString();
    const step = rfq.rfqApprovalChain[rfq.currentRfqApprovalStep];
    const prev = rfq.status;

    if (action === 'APPROVE') {
      if (step) {
        step.status = 'APPROVED';
        step.actionBy = user.fullName;
        step.actionAt = now;
        step.remarks = remarks || 'Approved';
      }
      if (rfq.currentRfqApprovalStep + 1 < rfq.rfqApprovalChain.length) {
        rfq.currentRfqApprovalStep += 1;
      } else {
        rfq.status = 'APPROVED';
      }
    } else if (action === 'SEND_BACK') {
      if (step) step.status = 'SEND_BACK';
      rfq.status = 'DRAFT';
    } else if (action === 'REJECT') {
      if (step) step.status = 'REJECTED';
      rfq.status = 'CANCELLED';
    }

    rfq.updatedAt = now;
    rfq.rfqApprovalHistory.push({
      id: `RA-${Date.now()}`,
      stageLabel: step?.label || 'RFQ Review',
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.approverType || user.role,
      action,
      remarks: remarks || 'Approved',
      previousStatus: prev,
      newStatus: rfq.status,
      timestamp: now,
    });
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.approverType || user.role,
      action: `RFQ_${action}`,
      module: 'RFQ Approval Workflow',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      previousState: prev,
      newState: rfq.status,
      remarks,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rfq);
  });

  router.post('/rfqs/:id/publish', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    if (
      db.workflowConfig.requireRfqApprovalBeforePublish &&
      rfq.status !== 'APPROVED'
    ) {
      res.status(400).json({error: 'RFQ must complete internal approval before publishing'});
      return;
    }
    const now = new Date().toISOString();
    const prev = rfq.status;
    rfq.status = 'PUBLISHED';
    rfq.updatedAt = now;
    rfq.participations = rfq.invitedSupplierIds.map((sid) => {
      const existing = rfq.participations.find((p) => p.supplierId === sid);
      const sup = db.suppliers.find((s) => s.id === sid);
      return (
        existing || {
          supplierId: sid,
          supplierName: sup?.companyName || sid,
          status: 'INVITED',
          updatedAt: now,
        }
      );
    });

    for (const sid of rfq.invitedSupplierIds) {
      db.notifications.unshift({
        id: `NOTIF-${Date.now()}-${sid}`,
        recipientSupplierId: sid,
        title: `New RFQ Published: ${rfq.rfqNumber}`,
        message: `${rfq.title} — Submit sealed quotation before ${rfq.quotationDeadline.slice(0, 10)}.`,
        severity: 'ACTION',
        status: 'DELIVERED',
        channel: 'BOTH',
        relatedModule: 'RFQ',
        relatedEntityId: rfq.id,
        createdAt: now,
      });
    }

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RFQ_PUBLISHED',
      module: 'RFQ Management',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      previousState: prev,
      newState: 'PUBLISHED',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rfq);
  });

  router.post('/rfqs/:id/extend-deadline', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    const {newDeadline, reason} = req.body as {newDeadline?: string; reason?: string};
    if (!newDeadline || !reason) {
      res.status(400).json({error: 'New deadline and reason are required'});
      return;
    }
    const now = new Date().toISOString();
    rfq.deadlineHistory.push({
      previousDeadline: rfq.quotationDeadline,
      newDeadline,
      reason,
      changedBy: user.fullName,
      changedAt: now,
    });
    rfq.quotationDeadline = newDeadline;
    rfq.updatedAt = now;

    for (const sid of rfq.invitedSupplierIds) {
      db.notifications.unshift({
        id: `NOTIF-${Date.now()}-${sid}`,
        recipientSupplierId: sid,
        title: `RFQ Deadline Extended: ${rfq.rfqNumber}`,
        message: `New submission deadline is ${newDeadline.slice(0, 10)}. Reason: ${reason}`,
        severity: 'INFO',
        status: 'DELIVERED',
        channel: 'BOTH',
        relatedModule: 'RFQ',
        relatedEntityId: rfq.id,
        createdAt: now,
      });
    }

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RFQ_DEADLINE_EXTENDED',
      module: 'RFQ Management',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      remarks: reason,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rfq);
  });

  router.post('/rfqs/:id/start-evaluation', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    const prev = rfq.status;
    rfq.status = 'EVALUATION';
    rfq.updatedAt = new Date().toISOString();
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RFQ_EVALUATION_STARTED',
      module: 'Evaluation',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      previousState: prev,
      newState: 'EVALUATION',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rfq);
  });

  // ==================== SUPPLIER PARTICIPATION & CLARIFICATIONS ====================
  router.post('/rfqs/:id/participate', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (user.role !== 'SUPPLIER' || !user.supplierId) {
      res.status(403).json({error: 'Only invited suppliers can record participation'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq || !rfq.invitedSupplierIds.includes(user.supplierId)) {
      res.status(404).json({error: 'RFQ not found or not invited'});
      return;
    }
    const {status, declineReason} = req.body as {
      status: 'ACKNOWLEDGED' | 'INTENDING' | 'DECLINED';
      declineReason?: string;
    };
    if (status === 'DECLINED' && (!declineReason || !declineReason.trim())) {
      res.status(400).json({error: 'Decline reason is mandatory'});
      return;
    }
    const now = new Date().toISOString();
    let part = rfq.participations.find((p) => p.supplierId === user.supplierId);
    if (!part) {
      const sup = db.suppliers.find((s) => s.id === user.supplierId);
      part = {
        supplierId: user.supplierId,
        supplierName: sup?.companyName || user.fullName,
        status,
        updatedAt: now,
      };
      rfq.participations.push(part);
    }
    part.status = status;
    part.declineReason = declineReason;
    if (!part.acknowledgedAt) part.acknowledgedAt = now;
    part.updatedAt = now;

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: 'SUPPLIER',
      action: `RFQ_SUPPLIER_${status}`,
      module: 'Supplier Invitation',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      newState: status,
      remarks: declineReason,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(part);
  });

  router.post('/rfqs/:id/clarifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    const {question} = req.body as {question?: string};
    if (!question || !question.trim()) {
      res.status(400).json({error: 'Question text is required'});
      return;
    }
    const sup = db.suppliers.find((s) => s.id === user.supplierId);
    const clr = {
      id: `CLR-${Date.now()}`,
      rfqId: rfq.id,
      supplierId: user.supplierId || user.id,
      supplierName: sup?.companyName || user.fullName,
      question: question.trim(),
      raisedAt: new Date().toISOString(),
      status: 'OPEN' as const,
    };
    rfq.clarifications.push(clr);
    saveDb();
    res.status(201).json(clr);
  });

  router.post(
    '/rfqs/:id/clarifications/:clrId/answer',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      if (user.role === 'SUPPLIER' || user.role === 'AUDITOR') {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      const rfq = db.rfqs.find((r) => r.id === req.params['id']);
      if (!rfq) {
        res.status(404).json({error: 'RFQ not found'});
        return;
      }
      const clr = rfq.clarifications.find((c) => c.id === req.params['clrId']);
      if (!clr) {
        res.status(404).json({error: 'Clarification not found'});
        return;
      }
      const {answer} = req.body as {answer?: string};
      if (!answer || !answer.trim()) {
        res.status(400).json({error: 'Answer text is required'});
        return;
      }
      clr.answer = answer.trim();
      clr.answeredBy = user.fullName;
      clr.answeredAt = new Date().toISOString();
      clr.status = 'ANSWERED';
      saveDb();
      res.json(clr);
    },
  );

  // ==================== SUPPLIER QUOTATION SUBMISSION ====================
  router.post('/rfqs/:id/quotations', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (user.role !== 'SUPPLIER' || !user.supplierId) {
      res.status(403).json({error: 'Only invited suppliers can submit quotations'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq || !rfq.invitedSupplierIds.includes(user.supplierId)) {
      res.status(404).json({error: 'RFQ not found or not invited'});
      return;
    }
    if (new Date(rfq.quotationDeadline).getTime() < Date.now()) {
      res.status(400).json({
        error: 'Quotation submission deadline has passed. Entry is automatically locked.',
      });
      return;
    }

    const body = req.body as {
      items: {
        rfqItemId: string;
        basicUnitPrice: number;
        discountPercent: number;
        gstPercent: number;
        freight: number;
        packingForwarding: number;
        toolingCost: number;
        insurance: number;
        otherCharges: number;
        moq: number;
        leadTimeDays: number;
        deliverySchedule: string;
        technicalDeviation: string;
        commercialDeviation: string;
        remarks: string;
      }[];
      paymentTerms: string;
      incoterms: string;
      validityDate: string;
      warrantyMonths: number;
      countryOfOrigin: string;
      technicalDeviation: string;
      commercialDeviation: string;
      remarks: string;
      attachmentName?: string;
      submitFinal: boolean;
    };

    const computedItems = body.items.map((line) => {
      const rfqLine = rfq.items.find((i) => i.id === line.rfqItemId);
      return calculateQuotationLine(line, rfqLine?.quantity || 1);
    });

    const totalBasicAmount = Number(
      computedItems
        .reduce((sum, line) => {
          const qty = rfq.items.find((i) => i.id === line.rfqItemId)?.quantity || 1;
          return sum + line.netUnitPrice * qty;
        }, 0)
        .toFixed(2),
    );
    const totalLandedCost = Number(
      computedItems.reduce((sum, l) => sum + l.totalLandedCost, 0).toFixed(2),
    );

    const existing = db.quotations.find(
      (q) => q.rfqId === rfq.id && q.supplierId === user.supplierId,
    );
    const now = new Date().toISOString();
    const sup = db.suppliers.find((s) => s.id === user.supplierId);

    if (existing) {
      if (existing.status !== 'DRAFT' && !rfq.allowRevisions) {
        res.status(400).json({error: 'Quotation revisions are disabled for this RFQ'});
        return;
      }
      const nextVersion =
        existing.status === 'DRAFT' ? existing.version : existing.version + 1;
      existing.version = nextVersion;
      existing.items = computedItems;
      existing.paymentTerms = body.paymentTerms;
      existing.incoterms = body.incoterms;
      existing.validityDate = body.validityDate;
      existing.warrantyMonths = body.warrantyMonths;
      existing.countryOfOrigin = body.countryOfOrigin;
      existing.technicalDeviation = body.technicalDeviation;
      existing.commercialDeviation = body.commercialDeviation;
      existing.remarks = body.remarks;
      existing.attachmentName = body.attachmentName || existing.attachmentName;
      existing.totalBasicAmount = totalBasicAmount;
      existing.totalLandedCost = totalLandedCost;
      existing.status = body.submitFinal
        ? nextVersion > 1
          ? 'REVISED'
          : 'SUBMITTED'
        : 'DRAFT';
      if (body.submitFinal) {
        existing.submittedAt = now;
        existing.history.push({
          version: nextVersion,
          totalLandedCost,
          submittedAt: now,
          remarks: body.remarks || `Version ${nextVersion} submitted`,
        });
      }
      const part = rfq.participations.find((p) => p.supplierId === user.supplierId);
      if (part && body.submitFinal) {
        part.status = 'QUOTED';
        part.updatedAt = now;
      }

      recordAudit({
        userId: user.id,
        userName: user.fullName,
        userRole: 'SUPPLIER',
        action: body.submitFinal ? 'QUOTATION_SUBMITTED' : 'QUOTATION_DRAFT_SAVED',
        module: 'Quotation Submission',
        entityType: 'Quotation',
        entityId: existing.id,
        entityNumber: existing.quotationNumber,
        newState: `${existing.status} v${existing.version}`,
        ipAddress: getClientIp(req),
      });
      saveDb();
      res.json(existing);
      return;
    }

    const newQuote: Quotation = {
      id: `QUO-${Date.now()}`,
      quotationNumber: nextNumber('QUOTATION'),
      rfqId: rfq.id,
      supplierId: user.supplierId,
      supplierName: sup?.companyName || user.fullName,
      version: 1,
      status: body.submitFinal ? 'SUBMITTED' : 'DRAFT',
      items: computedItems,
      paymentTerms: body.paymentTerms || rfq.paymentTerms,
      incoterms: body.incoterms || rfq.incoterms,
      validityDate: body.validityDate || new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
      warrantyMonths: body.warrantyMonths || 24,
      countryOfOrigin: body.countryOfOrigin || 'India',
      technicalDeviation: body.technicalDeviation || 'None',
      commercialDeviation: body.commercialDeviation || 'None',
      remarks: body.remarks || '',
      attachmentName: body.attachmentName || `${rfq.rfqNumber}_Quote.pdf`,
      submittedAt: body.submitFinal ? now : undefined,
      totalBasicAmount,
      totalLandedCost,
      technicalEval: {status: 'PENDING'},
      history: body.submitFinal
        ? [
            {
              version: 1,
              totalLandedCost,
              submittedAt: now,
              remarks: body.remarks || 'Initial sealed submission',
            },
          ]
        : [],
    };
    db.quotations.push(newQuote);
    const part = rfq.participations.find((p) => p.supplierId === user.supplierId);
    if (part && body.submitFinal) {
      part.status = 'QUOTED';
      part.updatedAt = now;
    }

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: 'SUPPLIER',
      action: body.submitFinal ? 'QUOTATION_SUBMITTED' : 'QUOTATION_DRAFT_SAVED',
      module: 'Quotation Submission',
      entityType: 'Quotation',
      entityId: newQuote.id,
      entityNumber: newQuote.quotationNumber,
      newState: newQuote.status,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.status(201).json(newQuote);
  });

  // ==================== TECHNICAL EVALUATION ====================
  router.post(
    '/rfqs/:id/quotations/:quoteId/technical-eval',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      if (!['APPROVER', 'BUYER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      const quote = db.quotations.find(
        (q) => q.id === req.params['quoteId'] && q.rfqId === req.params['id'],
      );
      if (!quote) {
        res.status(404).json({error: 'Quotation not found'});
        return;
      }
      const {status, score, remarks} = req.body as {
        status: Quotation['technicalEval']['status'];
        score?: number;
        remarks?: string;
      };
      quote.technicalEval = {
        status,
        score: score ?? 85,
        evaluatedBy: user.fullName,
        evaluatedAt: new Date().toISOString(),
        remarks: remarks || 'Technical evaluation recorded.',
      };
      recordAudit({
        userId: user.id,
        userName: user.fullName,
        userRole: user.approverType || user.role,
        action: 'TECHNICAL_EVALUATION_UPDATED',
        module: 'Technical Evaluation',
        entityType: 'Quotation',
        entityId: quote.id,
        entityNumber: quote.quotationNumber,
        newState: status,
        remarks,
        ipAddress: getClientIp(req),
      });
      saveDb();
      res.json(quote);
    },
  );

  // ==================== NEGOTIATIONS ====================
  router.post('/rfqs/:id/negotiations', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Only Buyers can initiate negotiation rounds'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    const {supplierId, items, revisedTerms, buyerRemarks} = req.body as {
      supplierId: string;
      items: {rfqItemId: string; targetUnitPrice: number; revisedUnitPrice: number}[];
      revisedTerms: string;
      buyerRemarks: string;
    };
    const quote = db.quotations.find(
      (q) => q.rfqId === rfq.id && q.supplierId === supplierId,
    );
    if (!quote) {
      res.status(404).json({error: 'Supplier quotation not found'});
      return;
    }

    const existingRounds = db.negotiations
      .filter((n) => n.rfqId === rfq.id && n.supplierId === supplierId)
      .sort((a, b) => b.roundNumber - a.roundNumber);
    const roundNumber = (existingRounds[0]?.roundNumber || 0) + 1;
    const prevRound = existingRounds[0];

    const lineDeltas = rfq.items.map((rfqItem) => {
      const qLine = quote.items.find((l) => l.rfqItemId === rfqItem.id);
      const prevLine = prevRound?.items.find((l) => l.rfqItemId === rfqItem.id);
      const inputLine = items.find((l) => l.rfqItemId === rfqItem.id);

      const previousUnitPrice = prevLine?.revisedUnitPrice ?? qLine?.netUnitPrice ?? 0;
      const revisedUnitPrice = inputLine?.revisedUnitPrice ?? previousUnitPrice;
      const previousLandedCost = prevLine?.revisedLandedCost ?? qLine?.totalLandedCost ?? 0;
      // Compute proportional landed cost preserving taxes/freight structure
      const gstRate = (qLine?.gstPercent || 18) / 100;
      const nonBasicExtras =
        (qLine?.freight || 0) +
        (qLine?.packingForwarding || 0) +
        (qLine?.toolingCost || 0) +
        (qLine?.insurance || 0) +
        (qLine?.otherCharges || 0);
      const revisedLandedCost = Number(
        (revisedUnitPrice * rfqItem.quantity * (1 + gstRate) + nonBasicExtras).toFixed(2),
      );

      return {
        rfqItemId: rfqItem.id,
        materialCode: rfqItem.materialCode,
        description: rfqItem.description,
        quantity: rfqItem.quantity,
        previousUnitPrice,
        targetUnitPrice: inputLine?.targetUnitPrice ?? revisedUnitPrice,
        revisedUnitPrice,
        previousLandedCost,
        revisedLandedCost,
      };
    });

    const previousTotal = lineDeltas.reduce((s, d) => s + d.previousLandedCost, 0);
    const revisedTotal = lineDeltas.reduce((s, d) => s + d.revisedLandedCost, 0);
    const savingsAmount = Number((previousTotal - revisedTotal).toFixed(2));
    const savingsPercent =
      previousTotal > 0 ? Number(((savingsAmount / previousTotal) * 100).toFixed(2)) : 0;

    const neg = {
      id: `NEG-${Date.now()}`,
      rfqId: rfq.id,
      roundNumber,
      supplierId,
      supplierName: quote.supplierName,
      initiatedBy: user.fullName,
      initiatedAt: new Date().toISOString(),
      items: lineDeltas,
      revisedTerms: revisedTerms || `${quote.paymentTerms} · ${quote.incoterms}`,
      buyerRemarks: buyerRemarks || `Negotiation Round ${roundNumber} logged.`,
      supplierConfirmed: false,
      previousTotal,
      revisedTotal,
      savingsAmount,
      savingsPercent,
    };

    db.negotiations.push(neg);
    if (rfq.status === 'PUBLISHED' || rfq.status === 'EVALUATION') {
      rfq.status = 'NEGOTIATION';
    }
    rfq.updatedAt = new Date().toISOString();

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'NEGOTIATION_ROUND_CREATED',
      module: 'Negotiation',
      entityType: 'NegotiationRound',
      entityId: neg.id,
      entityNumber: `${rfq.rfqNumber} R${roundNumber}`,
      newState: `₹${revisedTotal.toLocaleString('en-IN')}`,
      remarks: buyerRemarks,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.status(201).json(neg);
  });

  router.post(
    '/rfqs/:id/negotiations/:negId/confirm',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      const neg = db.negotiations.find(
        (n) => n.id === req.params['negId'] && n.rfqId === req.params['id'],
      );
      if (!neg) {
        res.status(404).json({error: 'Negotiation round not found'});
        return;
      }
      if (user.role === 'SUPPLIER' && neg.supplierId !== user.supplierId) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }
      const {remarks} = req.body as {remarks?: string};
      neg.supplierConfirmed = true;
      neg.supplierConfirmedAt = new Date().toISOString();
      neg.supplierRemarks = remarks || 'Final revised offer confirmed.';

      recordAudit({
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        action: 'NEGOTIATION_CONFIRMED',
        module: 'Negotiation',
        entityType: 'NegotiationRound',
        entityId: neg.id,
        entityNumber: `Round ${neg.roundNumber}`,
        remarks: neg.supplierRemarks,
        ipAddress: getClientIp(req),
      });
      saveDb();
      res.json(neg);
    },
  );

  // ==================== RATE RECOMMENDATION & APPROVAL WORKFLOW ====================
  router.post('/rfqs/:id/recommendation', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Only Buyers can submit rate recommendations'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }

    const {recommendedSupplierId, nonL1Justification, settledLineRates} = req.body as {
      recommendedSupplierId: string;
      nonL1Justification?: string;
      settledLineRates?: {rfqItemId: string; settledUnitPrice: number}[];
    };

    const comparison = buildComparisonForRfq(rfq);
    const chosen = comparison.find((c) => c.supplierId === recommendedSupplierId);
    if (!chosen) {
      res.status(404).json({error: 'Selected supplier has no valid quotation'});
      return;
    }

    const isL1 = chosen.rank === 1;
    if (!isL1 && (!nonL1Justification || !nonL1Justification.trim())) {
      res.status(400).json({
        error: 'Mandatory justification is required for Non-L1 supplier recommendation',
      });
      return;
    }

    const lineSummaries = chosen.itemBreakdown.map((ib) => {
      const override = settledLineRates?.find((s) => s.rfqItemId === ib.rfqItemId);
      const unitPrice = override?.settledUnitPrice ?? ib.negotiatedUnitPrice;
      const gstFactor = 1 + ib.gstPercent / 100;
      const extras = ib.freight + ib.packingForwarding + ib.toolingCost + ib.otherCharges;
      const settledLandedTotal = Number(
        (unitPrice * ib.quantity * gstFactor + extras).toFixed(2),
      );
      return {
        rfqItemId: ib.rfqItemId,
        materialCode: ib.materialCode,
        description: ib.description,
        quantity: ib.quantity,
        settledUnitPrice: unitPrice,
        settledLandedTotal,
      };
    });

    const finalSettledTotal = Number(
      lineSummaries.reduce((sum, l) => sum + l.settledLandedTotal, 0).toFixed(2),
    );
    const originalQuotedTotal = chosen.totalLandedCost;
    const absoluteSaving = Number((originalQuotedTotal - finalSettledTotal).toFixed(2));
    const savingPercent =
      originalQuotedTotal > 0
        ? Number(((absoluteSaving / originalQuotedTotal) * 100).toFixed(2))
        : 0;

    const settledBasicTotal = lineSummaries.reduce(
      (sum, l) => sum + l.settledUnitPrice * l.quantity,
      0,
    );
    const benchmarkVarianceAmount = Number((settledBasicTotal - chosen.benchmarkTotal).toFixed(2));
    const benchmarkVariancePercent =
      chosen.benchmarkTotal > 0
        ? Number(((benchmarkVarianceAmount / chosen.benchmarkTotal) * 100).toFixed(2))
        : 0;
    const prevPriceVarianceAmount = Number(
      (settledBasicTotal - chosen.previousPurchaseTotal).toFixed(2),
    );
    const prevPriceVariancePercent =
      chosen.previousPurchaseTotal > 0
        ? Number(
            ((prevPriceVarianceAmount / chosen.previousPurchaseTotal) * 100).toFixed(2),
          )
        : 0;

    const approvalChain = resolveRateApprovalChain(
      finalSettledTotal,
      isL1,
      benchmarkVariancePercent,
    );

    const now = new Date().toISOString();
    const existingIdx = db.rateRecommendations.findIndex((r) => r.rfqId === rfq.id);
    const prevHistory =
      existingIdx >= 0 ? db.rateRecommendations[existingIdx].approvalHistory : [];

    const rec = {
      id: existingIdx >= 0 ? db.rateRecommendations[existingIdx].id : `REC-${Date.now()}`,
      rfqId: rfq.id,
      recommendedSupplierId,
      recommendedSupplierName: chosen.supplierName,
      isL1,
      nonL1Justification: isL1 ? undefined : nonL1Justification,
      originalQuotedTotal,
      finalSettledTotal,
      absoluteSaving,
      savingPercent,
      benchmarkTotal: chosen.benchmarkTotal,
      benchmarkVarianceAmount,
      benchmarkVariancePercent,
      previousPurchaseTotal: chosen.previousPurchaseTotal,
      prevPriceVarianceAmount,
      prevPriceVariancePercent,
      totalBusinessValue: finalSettledTotal,
      settledLineRates: lineSummaries,
      approvalChain,
      currentStepIndex: 0,
      status: 'PENDING_APPROVAL' as const,
      submittedBy: user.fullName,
      submittedAt: now,
      approvalHistory: [
        ...prevHistory,
        {
          id: `RAH-${Date.now()}`,
          stageLabel: 'Buyer Rate Recommendation',
          approverId: user.id,
          approverName: user.fullName,
          approverRole: user.role,
          action: 'SUBMIT' as const,
          remarks: isL1
            ? `L1 recommendation submitted for ₹${finalSettledTotal.toLocaleString('en-IN')}.`
            : `Non-L1 recommendation (${nonL1Justification}) submitted for ₹${finalSettledTotal.toLocaleString('en-IN')}.`,
          previousStatus: rfq.status,
          newStatus: 'RATE_APPROVAL',
          timestamp: now,
        },
      ],
    };

    if (existingIdx >= 0) {
      db.rateRecommendations[existingIdx] = rec;
    } else {
      db.rateRecommendations.push(rec);
    }

    rfq.status = 'RATE_APPROVAL';
    rfq.updatedAt = now;

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RATE_RECOMMENDATION_SUBMITTED',
      module: 'Rate Approval',
      entityType: 'RateRecommendation',
      entityId: rec.id,
      entityNumber: rfq.rfqNumber,
      newState: 'PENDING_APPROVAL',
      remarks: nonL1Justification || 'L1 recommendation',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rec);
  });

  router.post('/rfqs/:id/recommendation/action', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['APPROVER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Only authorized Approvers can act on rate approvals'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    const rec = db.rateRecommendations.find((r) => r.rfqId === req.params['id']);
    if (!rfq || !rec) {
      res.status(404).json({error: 'Rate recommendation not found'});
      return;
    }

    const {action, remarks, delegatedToName} = req.body as {
      action: 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'HOLD' | 'REQUEST_INFO' | 'DELEGATE';
      remarks?: string;
      delegatedToName?: string;
    };

    if (
      ['REJECT', 'SEND_BACK', 'HOLD', 'REQUEST_INFO'].includes(action) ||
      !rec.isL1
    ) {
      if (!remarks || !remarks.trim()) {
        res.status(400).json({
          error: 'Remarks are mandatory for Rejection, Send Back, Hold, Info Request, and Non-L1 approvals',
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const currentStep = rec.approvalChain[rec.currentStepIndex];
    const prevRecStatus = rec.status;

    if (action === 'APPROVE') {
      if (currentStep) {
        currentStep.status = 'APPROVED';
        currentStep.actionBy = user.fullName;
        currentStep.actionAt = now;
        currentStep.remarks = remarks || 'Approved';
      }
      if (rec.currentStepIndex + 1 < rec.approvalChain.length) {
        rec.currentStepIndex += 1;
        rec.status = 'PENDING_APPROVAL';
      } else {
        rec.status = 'APPROVED';
        rfq.status = 'AWARD_APPROVED';
      }
    } else if (action === 'REJECT') {
      if (currentStep) currentStep.status = 'REJECTED';
      rec.status = 'REJECTED';
      rfq.status = 'NEGOTIATION';
    } else if (action === 'SEND_BACK') {
      if (currentStep) currentStep.status = 'SEND_BACK';
      rec.status = 'SEND_BACK';
      rfq.status = 'NEGOTIATION';
    } else if (action === 'HOLD') {
      if (currentStep) currentStep.status = 'ON_HOLD';
      rec.status = 'ON_HOLD';
    } else if (action === 'REQUEST_INFO') {
      if (currentStep) currentStep.status = 'INFO_REQUESTED';
      rec.status = 'INFO_REQUESTED';
    } else if (action === 'DELEGATE') {
      if (currentStep) {
        currentStep.status = 'DELEGATED';
        currentStep.delegatedTo = delegatedToName || 'Alternate Approver';
      }
    }

    rec.approvalHistory.push({
      id: `RAH-${Date.now()}`,
      stageLabel: currentStep?.label || 'Rate Approval',
      approverId: user.id,
      approverName: user.fullName,
      approverRole: user.approverType || user.role,
      action,
      remarks: remarks || 'Approved',
      previousStatus: prevRecStatus,
      newStatus: rec.status,
      delegatedToName,
      timestamp: now,
    });
    rfq.updatedAt = now;

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.approverType || user.role,
      action: `RATE_APPROVAL_${action}`,
      module: 'Rate Approval',
      entityType: 'RateRecommendation',
      entityId: rec.id,
      entityNumber: rfq.rfqNumber,
      previousState: prevRecStatus,
      newState: rec.status,
      remarks,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json({rfq, recommendation: rec});
  });

  router.post('/rfqs/:id/award', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Only Buyers can issue awards'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    const rec = db.rateRecommendations.find((r) => r.rfqId === req.params['id']);
    if (!rfq || !rec) {
      res.status(404).json({error: 'RFQ or Recommendation not found'});
      return;
    }
    if (rfq.status !== 'AWARD_APPROVED' && rec.status !== 'APPROVED') {
      res.status(400).json({error: 'All rate approvals must be completed before issuing award'});
      return;
    }

    const {awardNote} = req.body as {awardNote?: string};
    const now = new Date().toISOString();
    const awardNumber = nextNumber('AWARD');
    rfq.status = 'AWARDED';
    rfq.awardNumber = awardNumber;
    rfq.updatedAt = now;
    rec.awardNote = awardNote || `Business awarded to ${rec.recommendedSupplierName}.`;
    rec.awardedBy = user.fullName;
    rec.awardedAt = now;

    // Notify awarded supplier + non-selected closure notification (zero price leak!)
    for (const sid of rfq.invitedSupplierIds) {
      const isWinner = sid === rec.recommendedSupplierId;
      db.notifications.unshift({
        id: `NOTIF-${Date.now()}-${sid}`,
        recipientSupplierId: sid,
        title: isWinner
          ? `Business Awarded: ${rfq.rfqNumber} (${awardNumber})`
          : `RFQ Closed: ${rfq.rfqNumber}`,
        message: isWinner
          ? `Congratulations! Your settled offer has been awarded under ${awardNumber}.`
          : `Thank you for participating in ${rfq.rfqNumber}. Sourcing cycle has concluded and business has been awarded.`,
        severity: isWinner ? 'INFO' : 'WARNING',
        status: 'DELIVERED',
        channel: 'BOTH',
        relatedModule: 'Award Management',
        relatedEntityId: rfq.id,
        createdAt: now,
      });
    }

    // Stage SAP Purchasing Info Record & PO Handoff
    const winningSup = db.suppliers.find((s) => s.id === rec.recommendedSupplierId);
    db.sapIntegrations.unshift({
      id: `SAP-${Date.now()}`,
      direction: 'OUTBOUND',
      objectType: 'PURCHASING_INFO_RECORD',
      tcode: 'ME11 / ME21N',
      bapiOrService: 'API_INFORECORD_PROCESS_SRV',
      entityId: rfq.id,
      entityNumber: awardNumber,
      status: 'READY',
      payloadPreview: {
        AwardNumber: awardNumber,
        RFQ: rfq.rfqNumber,
        Vendor: winningSup?.sapVendorCode || rec.recommendedSupplierId,
        Plant: rfq.plantId,
        PurchasingGroup: rfq.purchasingGroup,
        TotalAwardValue: rec.totalBusinessValue,
        Currency: rfq.currency,
        Items: rec.settledLineRates,
      },
      lastMessage: `Award ${awardNumber} staged for SAP Info Record & PO generation.`,
    });

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SUPPLIER_AWARDED',
      module: 'Award Management',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: awardNumber,
      previousState: 'AWARD_APPROVED',
      newState: 'AWARDED',
      remarks: rec.awardNote,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json({rfq, recommendation: rec});
  });

  router.post('/rfqs/:id/close', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!canEditRfq(user)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const rfq = db.rfqs.find((r) => r.id === req.params['id']);
    if (!rfq) {
      res.status(404).json({error: 'RFQ not found'});
      return;
    }
    rfq.status = 'CLOSED';
    rfq.updatedAt = new Date().toISOString();
    const rec = db.rateRecommendations.find((r) => r.rfqId === rfq.id);
    if (rec) rec.closedAt = rfq.updatedAt;
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RFQ_CLOSED',
      module: 'Award Management',
      entityType: 'Rfq',
      entityId: rfq.id,
      entityNumber: rfq.rfqNumber,
      previousState: 'AWARDED',
      newState: 'CLOSED',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rfq);
  });

  // ==================== APPROVALS INBOX ====================
  router.get('/approvals', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['APPROVER', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(user.role)) {
      res.status(403).json({error: 'Access denied'});
      return;
    }

    const supplierTasks = db.suppliers
      .filter((s) =>
        ['SUBMITTED', 'SCM_REVIEW', 'FINANCE_REVIEW', 'QUALITY_REVIEW', 'FINAL_APPROVAL', 'ON_HOLD', 'INFO_REQUESTED'].includes(
          s.status,
        ),
      )
      .map((s) => ({
        taskType: 'SUPPLIER_ONBOARDING',
        id: s.id,
        referenceNumber: s.applicationNumber,
        title: s.companyName,
        stage: s.status,
        assignedApproverType:
          s.status === 'SCM_REVIEW' || s.status === 'SUBMITTED'
            ? 'SCM_REVIEWER'
            : s.status === 'FINANCE_REVIEW'
              ? 'FINANCE_REVIEWER'
              : s.status === 'QUALITY_REVIEW'
                ? 'QUALITY_REVIEWER'
                : 'PURCHASE_HEAD',
        updatedAt: s.updatedAt,
        supplier: s,
      }));

    const rfqTasks = db.rfqs
      .filter((r) => r.status === 'PENDING_APPROVAL')
      .map((r) => ({
        taskType: 'RFQ_PUBLISH',
        id: r.id,
        referenceNumber: r.rfqNumber,
        title: r.title,
        stage: r.rfqApprovalChain[r.currentRfqApprovalStep]?.label || 'RFQ Review',
        assignedApproverType:
          r.rfqApprovalChain[r.currentRfqApprovalStep]?.approverType || 'SCM_MANAGER',
        updatedAt: r.updatedAt,
        rfq: r,
      }));

    const techEvalTasks = db.quotations
      .filter((q) => q.status !== 'DRAFT' && q.technicalEval.status === 'PENDING')
      .map((q) => {
        const rfq = db.rfqs.find((r) => r.id === q.rfqId);
        return {
          taskType: 'TECHNICAL_EVALUATION',
          id: q.id,
          rfqId: q.rfqId,
          referenceNumber: `${rfq?.rfqNumber || q.rfqId} · ${q.quotationNumber}`,
          title: `${q.supplierName} — ${rfq?.title || ''}`,
          stage: 'Technical Compliance Review',
          assignedApproverType: 'TECHNICAL_REVIEWER',
          updatedAt: q.submittedAt || '',
          quotation: q,
        };
      });

    const rateTasks = db.rateRecommendations
      .filter((rec) =>
        ['PENDING_APPROVAL', 'ON_HOLD', 'INFO_REQUESTED'].includes(rec.status),
      )
      .map((rec) => {
        const rfq = db.rfqs.find((r) => r.id === rec.rfqId);
        const step = rec.approvalChain[rec.currentStepIndex];
        return {
          taskType: 'RATE_APPROVAL',
          id: rec.rfqId,
          referenceNumber: rfq?.rfqNumber || rec.rfqId,
          title: `${rfq?.title || ''} (${rec.recommendedSupplierName})`,
          stage: step?.label || rec.status,
          assignedApproverType: step?.approverType || 'MANAGEMENT_APPROVER',
          isL1: rec.isL1,
          totalBusinessValue: rec.totalBusinessValue,
          updatedAt: rec.submittedAt,
          recommendation: rec,
        };
      });

    res.json({
      supplierTasks,
      rfqTasks,
      techEvalTasks,
      rateTasks,
    });
  });

  // ==================== REPORTS, AUDIT, NOTIFICATIONS ====================
  router.get('/reports', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (user.role === 'SUPPLIER') {
      res.status(403).json({error: 'Reports are restricted to internal users'});
      return;
    }

    const savingsReport = db.rateRecommendations.map((rec) => {
      const rfq = db.rfqs.find((r) => r.id === rec.rfqId);
      return {
        rfqNumber: rfq?.rfqNumber || rec.rfqId,
        title: rfq?.title || '',
        plantId: rfq?.plantId || '',
        supplierName: rec.recommendedSupplierName,
        isL1: rec.isL1,
        nonL1Justification: rec.nonL1Justification || '-',
        originalQuotedTotal: rec.originalQuotedTotal,
        finalSettledTotal: rec.finalSettledTotal,
        absoluteSaving: rec.absoluteSaving,
        savingPercent: rec.savingPercent,
        benchmarkVariancePercent: rec.benchmarkVariancePercent,
        status: rfq?.status || rec.status,
      };
    });

    const supplierPerformance = db.suppliers.map((s) => ({
      supplierRegNo: s.supplierRegNo || s.applicationNumber,
      companyName: s.companyName,
      category: s.supplierCategory,
      status: s.status,
      qualityScore: s.qualityScore,
      performanceScore: s.performanceScore,
      sapVendorCode: s.sapVendorCode || 'Pending Sync',
      rfqsInvited: db.rfqs.filter((r) => r.invitedSupplierIds.includes(s.id)).length,
      quotesSubmitted: db.quotations.filter(
        (q) => q.supplierId === s.id && q.status !== 'DRAFT',
      ).length,
    }));

    res.json({
      savingsReport,
      supplierPerformance,
      summary: {
        totalOriginalValue: savingsReport.reduce((a, b) => a + b.originalQuotedTotal, 0),
        totalSettledValue: savingsReport.reduce((a, b) => a + b.finalSettledTotal, 0),
        totalSavings: savingsReport.reduce((a, b) => a + b.absoluteSaving, 0),
        nonL1Count: savingsReport.filter((s) => !s.isL1).length,
      },
    });
  });

  router.get('/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (user.role === 'SUPPLIER') {
      res.status(403).json({error: 'Audit logs restricted'});
      return;
    }
    res.json(db.auditLogs);
  });

  router.get('/login-activities', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(user.role)) {
      res.json(db.loginActivities.filter((l) => l.userId === user.id));
      return;
    }
    res.json(db.loginActivities);
  });

  router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const filtered = db.notifications.filter((n) => {
      if (user.role === 'SUPPLIER') {
        return n.recipientSupplierId === user.supplierId;
      }
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
      return (
        n.recipientUserId === user.id ||
        n.recipientRole === user.role ||
        (!n.recipientUserId && !n.recipientRole && !n.recipientSupplierId)
      );
    });
    res.json(filtered);
  });

  router.post('/notifications/:id/read', requireAuth, (req, res) => {
    const db = getDb();
    const n = db.notifications.find((item) => item.id === req.params['id']);
    if (n) {
      n.status = 'READ';
      saveDb();
    }
    res.json({success: true});
  });

  // ==================== ADMIN, MASTER DATA, WORKFLOW & SAP LAYER ====================
  router.get('/admin/overview', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(user.role)) {
      res.status(403).json({error: 'Admin access required'});
      return;
    }
    res.json({
      users: db.users.map(toPublicUser),
      securitySettings: db.securitySettings,
      companies: db.companies,
      plants: db.plants,
      departments: db.departments,
      materialCategories: db.materialCategories,
      supplierCategories: db.supplierCategories,
      taxes: db.taxes,
      currencies: db.currencies,
      uoms: db.uoms,
      incoterms: db.incoterms,
      paymentTerms: db.paymentTerms,
      numberRanges: db.numberRanges,
      notificationTemplates: db.notificationTemplates,
      workflowConfig: db.workflowConfig,
      sapIntegrations: db.sapIntegrations,
    });
  });

  router.post('/admin/users', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const body = req.body as Partial<PublicUser> & {password?: string};
    if (!body.username || !body.email || !body.fullName || !body.role) {
      res.status(400).json({error: 'Username, email, full name, and role are required'});
      return;
    }
    if (body.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      res.status(403).json({error: 'Only Super Admin can create Super Admin users'});
      return;
    }
    const now = new Date().toISOString();
    const created: InternalUser = {
      id: `USR-${Date.now()}`,
      username: body.username.trim(),
      email: body.email.trim(),
      fullName: body.fullName.trim(),
      role: body.role,
      approverType: body.approverType,
      designation: body.designation || body.role,
      companyId: body.companyId || 'COMP-01',
      plantIds: body.plantIds?.length ? body.plantIds : ['PLT-1010'],
      departmentIds: body.departmentIds || ['DEPT-PC'],
      purchasingGroups: body.purchasingGroups || ['PG-01'],
      supplierId: body.supplierId,
      mfaEnabled: Boolean(body.mfaEnabled),
      status: 'ACTIVE',
      passwordUpdatedAt: now,
      passwordExpiryDays: db.securitySettings.passwordExpiryDays,
      concurrentSessionLimit: db.securitySettings.maxConcurrentSessions,
      createdAt: now,
      passwordHash: hashPassword(body.password || 'Srm@2026!'),
      failedLoginAttempts: 0,
      activeSessions: [],
    };
    db.users.push(created);
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'USER_CREATED',
      module: 'User Management',
      entityType: 'User',
      entityId: created.id,
      entityNumber: created.username,
      newState: created.role,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.status(201).json(toPublicUser(created));
  });

  router.post('/admin/users/:id/unlock', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const target = db.users.find((u) => u.id === req.params['id']);
    if (!target) {
      res.status(404).json({error: 'User not found'});
      return;
    }
    target.status = target.status === 'LOCKED' ? 'ACTIVE' : 'ACTIVE';
    target.failedLoginAttempts = 0;
    target.lockedUntil = undefined;
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'USER_UNLOCKED',
      module: 'User Management',
      entityType: 'User',
      entityId: target.id,
      entityNumber: target.username,
      newState: 'ACTIVE',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(toPublicUser(target));
  });

  router.post('/admin/master/:type', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const type = String(req.params['type'] || '');
    const {code, name, description, extra} = req.body as {
      code?: string;
      name?: string;
      description?: string;
      extra?: string;
    };
    if (!code || !name) {
      res.status(400).json({error: 'Code and name are required'});
      return;
    }
    const item = {
      id: `${type.toUpperCase()}-${Date.now()}`,
      code: code.trim(),
      name: name.trim(),
      description,
      extra,
      active: true,
    };

    if (type === 'materialCategories') db.materialCategories.push(item);
    else if (type === 'supplierCategories') db.supplierCategories.push(item);
    else if (type === 'taxes') db.taxes.push(item);
    else if (type === 'currencies') db.currencies.push(item);
    else if (type === 'uoms') db.uoms.push(item);
    else if (type === 'incoterms') db.incoterms.push(item);
    else if (type === 'paymentTerms') db.paymentTerms.push(item);
    else if (type === 'plants') {
      db.plants.push({
        id: `PLT-${code.trim()}`,
        companyId: 'COMP-01',
        code: code.trim(),
        name: name.trim(),
        city: description || 'Pune',
        state: extra || 'Maharashtra',
        sapPlantCode: code.trim(),
        status: 'ACTIVE',
      });
    } else {
      res.status(400).json({error: 'Unknown master data type'});
      return;
    }

    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'MASTER_DATA_ADDED',
      module: 'Master Data',
      entityType: type,
      entityId: item.id,
      entityNumber: item.code,
      newState: item.name,
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.status(201).json(item);
  });

  router.put('/admin/workflow', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    db.workflowConfig = req.body as typeof db.workflowConfig;
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'WORKFLOW_CONFIG_UPDATED',
      module: 'Approval Matrix',
      entityType: 'WorkflowConfiguration',
      entityId: 'GLOBAL',
      entityNumber: 'WF-MATRIX',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(db.workflowConfig);
  });

  router.put('/admin/security', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    db.securitySettings = req.body as typeof db.securitySettings;
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SECURITY_SETTINGS_UPDATED',
      module: 'System Settings',
      entityType: 'SecuritySettings',
      entityId: 'GLOBAL',
      entityNumber: 'SEC-POLICY',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(db.securitySettings);
  });

  router.post('/admin/sap/:id/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (!['ADMIN', 'SUPER_ADMIN', 'BUYER'].includes(user.role)) {
      res.status(403).json({error: 'Forbidden'});
      return;
    }
    const rec = db.sapIntegrations.find((s) => s.id === req.params['id']);
    if (!rec) {
      res.status(404).json({error: 'SAP integration record not found'});
      return;
    }
    rec.status = 'SYNCED';
    rec.syncedAt = new Date().toISOString();
    rec.sapObjectId =
      rec.sapObjectId ||
      `SAP-${Math.floor(4500000000 + Math.random() * 90000000)}`;
    rec.lastMessage = `Simulated SAP S/4HANA OData/BAPI acknowledgement: ${rec.sapObjectId}`;
    recordAudit({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'SAP_PAYLOAD_SYNCED',
      module: 'SAP Integration Layer',
      entityType: rec.objectType,
      entityId: rec.id,
      entityNumber: rec.sapObjectId,
      newState: 'SYNCED',
      ipAddress: getClientIp(req),
    });
    saveDb();
    res.json(rec);
  });

  router.get('/health', (_req, res) => {
    getDb();
    res.json({
      status: 'ok',
      backend: 'Express 5 SSR API',
      database: getSqliteStats(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
