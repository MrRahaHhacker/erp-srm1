export function formatInr(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatInrExact(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateShort(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function humanStatus(status: string | undefined | null): string {
  if (!status) return '—';
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function statusColorClass(status: string | undefined | null): string {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'AWARDED':
    case 'AWARD_APPROVED':
    case 'TECHNICALLY_ACCEPTED':
    case 'SYNCED':
    case 'SUCCESS':
    case 'QUOTED':
      return 'text-emerald-700';
    case 'CORRECTION_REQUIRED':
    case 'ON_HOLD':
    case 'INFO_REQUESTED':
    case 'PENDING_APPROVAL':
    case 'PENDING':
    case 'NEGOTIATION':
    case 'RATE_APPROVAL':
    case 'EVALUATION':
    case 'CONDITIONALLY_ACCEPTED':
    case 'CLARIFICATION_REQUIRED':
    case 'SCM_REVIEW':
    case 'FINANCE_REVIEW':
    case 'QUALITY_REVIEW':
    case 'FINAL_APPROVAL':
      return 'text-amber-700';
    case 'REJECTED':
    case 'BLOCKED':
    case 'CANCELLED':
    case 'DECLINED':
    case 'TECHNICALLY_REJECTED':
    case 'FAILED':
    case 'LOCKED':
      return 'text-red-700';
    default:
      return 'text-slate-700';
  }
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };
  const csv = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ].join('\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
