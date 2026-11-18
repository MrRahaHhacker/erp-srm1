import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {filter} from 'rxjs';
import type {NotificationItem, UserRole} from '../../shared/srm.types';
import {AuthStore} from '../core/auth.store';
import {formatDateTime, humanStatus} from '../core/formatters';
import {SrmApi} from '../core/srm-api';

interface NavEntry {
  label: string;
  route: string;
  icon: string;
  roles: UserRole[];
}

const NAV_ENTRIES: NavEntry[] = [
  {
    label: 'Dashboard',
    route: '/dashboard',
    icon: 'space_dashboard',
    roles: ['SUPER_ADMIN', 'ADMIN', 'BUYER', 'APPROVER', 'SUPPLIER', 'AUDITOR'],
  },
  {
    label: 'Suppliers',
    route: '/suppliers',
    icon: 'factory',
    roles: ['SUPER_ADMIN', 'ADMIN', 'BUYER', 'APPROVER', 'SUPPLIER', 'AUDITOR'],
  },
  {
    label: 'RFQ Sourcing',
    route: '/rfqs',
    icon: 'request_quote',
    roles: ['SUPER_ADMIN', 'ADMIN', 'BUYER', 'APPROVER', 'SUPPLIER', 'AUDITOR'],
  },
  {
    label: 'Approvals Inbox',
    route: '/approvals',
    icon: 'verified_user',
    roles: ['SUPER_ADMIN', 'ADMIN', 'APPROVER', 'AUDITOR'],
  },
  {
    label: 'Reports & Savings',
    route: '/reports',
    icon: 'analytics',
    roles: ['SUPER_ADMIN', 'ADMIN', 'BUYER', 'APPROVER', 'AUDITOR'],
  },
  {
    label: 'Audit & Security Logs',
    route: '/audit-logs',
    icon: 'policy',
    roles: ['SUPER_ADMIN', 'ADMIN', 'APPROVER', 'AUDITOR'],
  },
  {
    label: 'Admin & SAP Layer',
    route: '/admin',
    icon: 'settings_applications',
    roles: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'],
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <div class="min-h-screen flex bg-slate-50 text-slate-900">
      <!-- Fixed Left Sidebar (256px desktop, collapsible mobile) -->
      <aside
        class="fixed inset-y-0 left-0 z-30 w-64 bg-slate-950 text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-200 lg:translate-x-0"
        [class.-translate-x-full]="!mobileNavOpen()"
        [class.translate-x-0]="mobileNavOpen()"
      >
        <div class="h-16 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <a routerLink="/dashboard" class="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span class="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center font-display font-bold text-sm">
              SR
            </span>
            <span class="font-display font-semibold text-base tracking-tight text-white">
              SRM ERP
            </span>
          </a>
          <button
            type="button"
            (click)="mobileNavOpen.set(false)"
            class="lg:hidden p-1.5 text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="px-5 py-4 border-b border-slate-800/80">
          <p class="text-xs text-slate-400 truncate">AutoCorp Precision Ltd.</p>
          <p class="text-sm font-medium text-white truncate mt-0.5">{{ user()?.fullName }}</p>
          <p class="text-xs text-slate-400 truncate mt-0.5">
            {{ roleLabel() }}
          </p>
        </div>

        <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          @for (item of visibleNav(); track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-slate-800 text-white"
              (click)="mobileNavOpen.set(false)"
              class="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition-colors whitespace-nowrap"
            >
              <mat-icon class="text-[19px] leading-none text-slate-400">{{ item.icon }}</mat-icon>
              <span class="truncate">{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="p-3 border-t border-slate-800 space-y-1">
          @if (user()?.role === 'BUYER' || user()?.role === 'ADMIN' || user()?.role === 'SUPER_ADMIN') {
            <a
              routerLink="/rfqs/new"
              (click)="mobileNavOpen.set(false)"
              class="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              <mat-icon class="text-[18px]">add_circle_outline</mat-icon>
              <span>Create RFQ</span>
            </a>
          }
          <button
            type="button"
            (click)="logout()"
            class="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <mat-icon class="text-[18px] text-slate-400">logout</mat-icon>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      @if (mobileNavOpen()) {
        <button
          type="button"
          aria-label="Close navigation menu"
          class="fixed inset-0 z-20 bg-slate-950/50 lg:hidden cursor-default"
          (click)="mobileNavOpen.set(false)"
        ></button>
      }

      <!-- Main Workspace -->
      <div class="flex-1 lg:pl-64 flex flex-col min-w-0">
        <!-- Top Bar Contract: Breadcrumb on left, concise action & notifications on right -->
        <header class="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-6 sticky top-0 z-10">
          <div class="flex items-center gap-3 min-w-0">
            <button
              type="button"
              (click)="mobileNavOpen.set(true)"
              class="lg:hidden p-2 -ml-2 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation"
            >
              <mat-icon>menu</mat-icon>
            </button>
            <div class="flex items-center gap-2 text-sm text-slate-500 truncate">
              <span class="font-medium text-slate-900 whitespace-nowrap">AutoCorp SRM</span>
              <span aria-hidden="true">/</span>
              <span class="truncate text-slate-600">{{ currentBreadcrumb() }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <button
              type="button"
              (click)="toggleNotifications()"
              class="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <mat-icon class="text-[18px] text-slate-500">notifications</mat-icon>
              <span class="hidden sm:inline">Alerts</span>
              @if (unreadCount() > 0) {
                <span class="font-mono text-xs font-semibold text-amber-700 tabular-nums">
                  ({{ unreadCount() }})
                </span>
              }
            </button>
          </div>
        </header>

        <!-- Notification Slide-Down Panel -->
        @if (notificationsOpen()) {
          <div class="bg-white border-b border-slate-200 px-4 lg:px-8 py-4">
            <div class="max-w-6xl mx-auto">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-sm font-semibold text-slate-900">Notifications & Reminders</h2>
                <button
                  type="button"
                  (click)="notificationsOpen.set(false)"
                  class="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
              @if (notifications().length === 0) {
                <p class="text-sm text-slate-500 py-2">No notifications in queue.</p>
              } @else {
                <div class="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  @for (n of notifications(); track n.id) {
                    <div class="py-2.5 flex items-start justify-between gap-4">
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-900">{{ n.title }}</p>
                        <p class="text-xs text-slate-600 mt-0.5">{{ n.message }}</p>
                        <p class="text-xs text-slate-400 mt-1 tabular-nums">
                          {{ n.channel }} · {{ n.status }} · {{ formatTime(n.createdAt) }}
                        </p>
                      </div>
                      @if (n.status !== 'READ') {
                        <button
                          type="button"
                          (click)="markRead(n.id)"
                          class="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                        >
                          Mark Read
                        </button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Main Content Viewport -->
        <main class="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(SrmApi);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly mobileNavOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly currentUrl = signal(this.router.url);

  readonly visibleNav = computed(() => {
    const role = this.user()?.role;
    if (!role) return [];
    return NAV_ENTRIES.filter((entry) => entry.roles.includes(role));
  });

  readonly roleLabel = computed(() => {
    const u = this.user();
    if (!u) return '';
    return u.approverType ? `${humanStatus(u.role)} · ${humanStatus(u.approverType)}` : humanStatus(u.role);
  });

  readonly unreadCount = computed(
    () => this.notifications().filter((n) => n.status !== 'READ').length,
  );

  readonly currentBreadcrumb = computed(() => {
    const url = this.currentUrl();
    if (url.startsWith('/dashboard')) return 'Executive & Role Dashboard';
    if (url.startsWith('/suppliers/')) return 'Supplier Dossier & Workflow';
    if (url.startsWith('/suppliers')) return 'Supplier Onboarding & Master';
    if (url.startsWith('/rfqs/new')) return 'Create New RFQ';
    if (url.startsWith('/rfqs/')) return 'RFQ Sourcing & Evaluation Workspace';
    if (url.startsWith('/rfqs')) return 'RFQ Management';
    if (url.startsWith('/approvals')) return 'Approvals Inbox';
    if (url.startsWith('/reports')) return 'Reports & Savings Analytics';
    if (url.startsWith('/audit-logs')) return 'Audit Trail & Login Activity';
    if (url.startsWith('/admin')) return 'Governance, Master Data & SAP Layer';
    return 'Workspace';
  });

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.currentUrl.set(e.urlAfterRedirects));
    void this.loadNotifications();
  }

  async loadNotifications(): Promise<void> {
    try {
      const list = await this.api.getNotifications();
      this.notifications.set(list);
    } catch {
      // ignore initial load error
    }
  }

  toggleNotifications(): void {
    const next = !this.notificationsOpen();
    this.notificationsOpen.set(next);
    if (next) void this.loadNotifications();
  }

  async markRead(id: string): Promise<void> {
    await this.api.markNotificationRead(id);
    this.notifications.update((list) =>
      list.map((n) => (n.id === id ? {...n, status: 'READ'} : n)),
    );
  }

  formatTime(iso: string): string {
    return formatDateTime(iso);
  }

  logout(): void {
    void this.auth.logout();
  }
}
