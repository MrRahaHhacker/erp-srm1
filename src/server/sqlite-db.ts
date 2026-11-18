import Database from 'better-sqlite3';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import type {SrmDatabase} from '../shared/srm.types';

export const SQLITE_DB_PATH = join(process.cwd(), 'data', 'srm-erp.db');
const LEGACY_JSON_PATH = join(process.cwd(), 'data', 'srm-database.json');

let sqliteInstance: Database.Database | null = null;

function getConnection(): Database.Database {
  if (sqliteInstance) return sqliteInstance;

  const dir = dirname(SQLITE_DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }

  const db = new Database(SQLITE_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      config_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_type TEXT,
      supplier_id TEXT,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_activities (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT NOT NULL,
      status TEXT NOT NULL,
      ip TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      application_number TEXT UNIQUE NOT NULL,
      supplier_reg_no TEXT,
      sap_vendor_code TEXT,
      company_name TEXT NOT NULL,
      status TEXT NOT NULL,
      gst_number TEXT NOT NULL,
      pan_number TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rfqs (
      id TEXT PRIMARY KEY,
      rfq_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      project TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      status TEXT NOT NULL,
      award_number TEXT,
      quotation_deadline TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      quotation_number TEXT UNIQUE NOT NULL,
      rfq_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      total_landed_cost REAL NOT NULL,
      submitted_at TEXT,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      rfq_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      previous_total REAL NOT NULL,
      revised_total REAL NOT NULL,
      savings_amount REAL NOT NULL,
      supplier_confirmed INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rate_recommendations (
      id TEXT PRIMARY KEY,
      rfq_id TEXT UNIQUE NOT NULL,
      recommended_supplier_id TEXT NOT NULL,
      final_settled_total REAL NOT NULL,
      status TEXT NOT NULL,
      is_l1 INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT,
      recipient_role TEXT,
      recipient_supplier_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sap_integrations (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      sap_object_id TEXT,
      status TEXT NOT NULL,
      synced_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
    CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
    CREATE INDEX IF NOT EXISTS idx_quotations_rfq ON quotations(rfq_id);
    CREATE INDEX IF NOT EXISTS idx_negotiations_rfq ON negotiations(rfq_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(recipient_role);
  `);

  sqliteInstance = db;
  return db;
}

export function loadDatabaseFromSqlite(): SrmDatabase | null {
  const conn = getConnection();
  const countRow = conn.prepare('SELECT COUNT(*) AS cnt FROM users').get() as
    | {cnt: number}
    | undefined;

  if (!countRow || Number(countRow.cnt) === 0) {
    if (existsSync(LEGACY_JSON_PATH)) {
      try {
        const legacy = JSON.parse(readFileSync(LEGACY_JSON_PATH, 'utf8')) as SrmDatabase;
        if (legacy && Array.isArray(legacy.users) && legacy.users.length > 0) {
          persistDatabaseToSqlite(legacy);
          return legacy;
        }
      } catch {
        // Fall through to seed
      }
    }
    return null;
  }

  const configRows = conn
    .prepare('SELECT config_key, value_json FROM app_config')
    .all() as {config_key: string; value_json: string}[];
  const configMap = new Map<string, unknown>();
  for (const row of configRows) {
    configMap.set(row.config_key, JSON.parse(row.value_json));
  }

  const readJsonRows = <T>(table: string, orderClause = ''): T[] => {
    const rows = conn
      .prepare(`SELECT payload_json FROM ${table} ${orderClause}`)
      .all() as {payload_json: string}[];
    return rows.map((r) => JSON.parse(r.payload_json) as T);
  };

  const master = (configMap.get('masterData') || {}) as Partial<SrmDatabase>;

  return {
    users: readJsonRows<SrmDatabase['users'][number]>('users'),
    loginActivities: readJsonRows<SrmDatabase['loginActivities'][number]>(
      'login_activities',
      'ORDER BY timestamp DESC',
    ),
    securitySettings: configMap.get('securitySettings') as SrmDatabase['securitySettings'],
    companies: master.companies || [],
    plants: master.plants || [],
    departments: master.departments || [],
    materialCategories: master.materialCategories || [],
    supplierCategories: master.supplierCategories || [],
    taxes: master.taxes || [],
    currencies: master.currencies || [],
    uoms: master.uoms || [],
    incoterms: master.incoterms || [],
    paymentTerms: master.paymentTerms || [],
    numberRanges: (configMap.get('numberRanges') as SrmDatabase['numberRanges']) || [],
    notificationTemplates:
      (configMap.get('notificationTemplates') as SrmDatabase['notificationTemplates']) || [],
    workflowConfig: configMap.get('workflowConfig') as SrmDatabase['workflowConfig'],
    suppliers: readJsonRows<SrmDatabase['suppliers'][number]>('suppliers'),
    rfqs: readJsonRows<SrmDatabase['rfqs'][number]>('rfqs'),
    quotations: readJsonRows<SrmDatabase['quotations'][number]>('quotations'),
    negotiations: readJsonRows<SrmDatabase['negotiations'][number]>('negotiations'),
    rateRecommendations: readJsonRows<SrmDatabase['rateRecommendations'][number]>(
      'rate_recommendations',
    ),
    auditLogs: readJsonRows<SrmDatabase['auditLogs'][number]>(
      'audit_logs',
      'ORDER BY timestamp DESC',
    ),
    notifications: readJsonRows<SrmDatabase['notifications'][number]>(
      'notifications',
      'ORDER BY created_at DESC',
    ),
    sapIntegrations: readJsonRows<SrmDatabase['sapIntegrations'][number]>('sap_integrations'),
  };
}

export function persistDatabaseToSqlite(db: SrmDatabase): void {
  const conn = getConnection();
  const now = new Date().toISOString();

  const runSync = conn.transaction(() => {
    const upsertConfig = conn.prepare(`
      INSERT INTO app_config (config_key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(config_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `);

    upsertConfig.run('securitySettings', JSON.stringify(db.securitySettings), now);
    upsertConfig.run('workflowConfig', JSON.stringify(db.workflowConfig), now);
    upsertConfig.run('numberRanges', JSON.stringify(db.numberRanges), now);
    upsertConfig.run('notificationTemplates', JSON.stringify(db.notificationTemplates), now);
    upsertConfig.run(
      'masterData',
      JSON.stringify({
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
      }),
      now,
    );

    conn.exec(`
      DELETE FROM quotations;
      DELETE FROM negotiations;
      DELETE FROM rate_recommendations;
      DELETE FROM rfqs;
      DELETE FROM suppliers;
      DELETE FROM users;
      DELETE FROM login_activities;
      DELETE FROM audit_logs;
      DELETE FROM notifications;
      DELETE FROM sap_integrations;
    `);

    const insertUser = conn.prepare(`
      INSERT INTO users (id, username, email, full_name, role, approver_type, supplier_id, status, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of db.users) {
      insertUser.run(
        u.id,
        u.username,
        u.email,
        u.fullName,
        u.role,
        u.approverType || null,
        u.supplierId || null,
        u.status,
        JSON.stringify(u),
        u.createdAt,
      );
    }

    const insertLogin = conn.prepare(`
      INSERT INTO login_activities (id, user_id, username, status, ip, timestamp, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l of db.loginActivities) {
      insertLogin.run(
        l.id,
        l.userId || null,
        l.username,
        l.status,
        l.ip,
        l.timestamp,
        JSON.stringify(l),
      );
    }

    const insertSupplier = conn.prepare(`
      INSERT INTO suppliers (id, application_number, supplier_reg_no, sap_vendor_code, company_name, status, gst_number, pan_number, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of db.suppliers) {
      insertSupplier.run(
        s.id,
        s.applicationNumber,
        s.supplierRegNo || null,
        s.sapVendorCode || null,
        s.companyName,
        s.status,
        s.gstNumber,
        s.panNumber,
        JSON.stringify(s),
        s.createdAt,
      );
    }

    const insertRfq = conn.prepare(`
      INSERT INTO rfqs (id, rfq_number, title, project, plant_id, status, award_number, quotation_deadline, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of db.rfqs) {
      insertRfq.run(
        r.id,
        r.rfqNumber,
        r.title,
        r.project,
        r.plantId,
        r.status,
        r.awardNumber || null,
        r.quotationDeadline,
        JSON.stringify(r),
        r.createdAt,
      );
    }

    const insertQuote = conn.prepare(`
      INSERT INTO quotations (id, quotation_number, rfq_id, supplier_id, status, version, total_landed_cost, submitted_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const q of db.quotations) {
      insertQuote.run(
        q.id,
        q.quotationNumber,
        q.rfqId,
        q.supplierId,
        q.status,
        q.version,
        q.totalLandedCost,
        q.submittedAt || null,
        JSON.stringify(q),
      );
    }

    const insertNeg = conn.prepare(`
      INSERT INTO negotiations (id, rfq_id, supplier_id, round_number, previous_total, revised_total, savings_amount, supplier_confirmed, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const n of db.negotiations) {
      insertNeg.run(
        n.id,
        n.rfqId,
        n.supplierId,
        n.roundNumber,
        n.previousTotal,
        n.revisedTotal,
        n.savingsAmount,
        n.supplierConfirmed ? 1 : 0,
        JSON.stringify(n),
      );
    }

    const insertRec = conn.prepare(`
      INSERT INTO rate_recommendations (id, rfq_id, recommended_supplier_id, final_settled_total, status, is_l1, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const rr of db.rateRecommendations) {
      insertRec.run(
        rr.id,
        rr.rfqId,
        rr.recommendedSupplierId,
        rr.finalSettledTotal,
        rr.status,
        rr.isL1 ? 1 : 0,
        JSON.stringify(rr),
      );
    }

    const insertAudit = conn.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, user_name, user_role, action, module, entity_type, entity_id, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of db.auditLogs) {
      insertAudit.run(
        a.id,
        a.timestamp,
        a.userId,
        a.userName,
        a.userRole,
        a.action,
        a.module,
        a.entityType,
        a.entityId,
        JSON.stringify(a),
      );
    }

    const insertNotification = conn.prepare(`
      INSERT INTO notifications (id, recipient_user_id, recipient_role, recipient_supplier_id, title, status, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const notif of db.notifications) {
      insertNotification.run(
        notif.id,
        notif.recipientUserId || null,
        notif.recipientRole || null,
        notif.recipientSupplierId || null,
        notif.title,
        notif.status,
        notif.createdAt,
        JSON.stringify(notif),
      );
    }

    const insertSap = conn.prepare(`
      INSERT INTO sap_integrations (id, object_type, entity_id, sap_object_id, status, synced_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const sap of db.sapIntegrations) {
      insertSap.run(
        sap.id,
        sap.objectType,
        sap.entityId,
        sap.sapObjectId || null,
        sap.status,
        sap.syncedAt || null,
        JSON.stringify(sap),
      );
    }
  });

  runSync();
}

export function getSqliteStats(): {
  engine: string;
  dbPath: string;
  tables: Record<string, number>;
} {
  const conn = getConnection();
  const tableNames = [
    'app_config',
    'users',
    'login_activities',
    'suppliers',
    'rfqs',
    'quotations',
    'negotiations',
    'rate_recommendations',
    'audit_logs',
    'notifications',
    'sap_integrations',
  ];
  const tables: Record<string, number> = {};
  for (const tbl of tableNames) {
    const row = conn.prepare(`SELECT COUNT(*) AS cnt FROM ${tbl}`).get() as
      | {cnt: number}
      | undefined;
    tables[tbl] = Number(row?.cnt || 0);
  }
  return {
    engine: 'SQLite 3 (better-sqlite3 · WAL + Foreign Keys)',
    dbPath: SQLITE_DB_PATH,
    tables,
  };
}
