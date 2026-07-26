import {
  DestroyRef,
  afterNextRender,
  Component,
  EnvironmentInjector,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { HeaderComponent } from './layout/header/header.component';
import { FooterComponent } from './layout/footer/footer.component';
import { AlphaDisclosureComponent } from './layout/alpha-disclosure/alpha-disclosure.component';
import { AlphaObservabilityService } from './services/alpha-observability.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, AlphaDisclosureComponent],
  template: `
    @if (!adminRoute()) {
      <pp-header />
      <pp-alpha-disclosure />
    } @else {
      <div class="admin-testnet-banner" role="note">
        TESTNET, NO REAL INVESTMENT OR LEGAL RIGHT.
      </div>
    }
    <main class="min-h-[calc(100vh-20rem)]">
      <router-outlet />
    </main>
    @if (!adminRoute()) {
      <pp-footer />
    }
  `,
  styles: `
    .admin-testnet-banner {
      position: sticky;
      top: 0;
      z-index: 1000;
      padding: 0.65rem 1rem;
      border-bottom: 1px solid rgba(255, 209, 102, 0.4);
      background: #241e0b;
      color: #ffe49a;
      font: 700 0.72rem/1.25 var(--font-mono);
      text-align: center;
    }
  `,
})
export class App {
  private readonly injector = inject(EnvironmentInjector);
  private readonly alphaObservability = inject(AlphaObservabilityService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly adminRoute = signal(this.isAdminUrl(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.adminRoute.set(this.isAdminUrl(event.urlAfterRedirects)));
    afterNextRender(() => {
      this.alphaObservability.track('ALPHA_APP_OPENED', { route: location.pathname });
      void import('./services/chia-wallet.service').then(({ ChiaWalletService }) =>
        this.injector
          .get(ChiaWalletService)
          .restoreSageWalletConnectSession(),
      );
    });
  }

  private isAdminUrl(url: string): boolean {
    const path = url.split(/[?#]/, 1)[0];
    return path === '/' || path === '/admin' || path.startsWith('/admin/');
  }
}
