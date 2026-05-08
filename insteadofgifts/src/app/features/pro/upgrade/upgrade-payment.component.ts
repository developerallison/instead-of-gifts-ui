import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';

const PENDING_PRO_UPGRADE_CAMPAIGN_KEY = 'pendingProUpgradeCampaignId';

@Component({
  selector: 'app-upgrade-payment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, RouterLink],
  template: `
    <div class="payment-page">
      <div class="payment-card">
        <a
          class="payment-card__back"
          [routerLink]="['/pro/upgrade']"
          [queryParams]="upgradeCampaignId() ? { campaignId: upgradeCampaignId() } : null"
        >
          Back
        </a>

        <p class="payment-card__eyebrow">Celebration Access</p>
        <h1 class="payment-card__heading">Complete your payment</h1>
        <p class="payment-card__sub">
          This is a one-time $9.99 payment to unlock Pro for one celebration.
        </p>

        <div class="order-summary" aria-label="Order summary">
          <div class="order-summary__row">
            <span class="order-summary__label">Item</span>
            <span class="order-summary__value">Celebration access</span>
          </div>
          <div class="order-summary__row">
            <span class="order-summary__label">Type</span>
            <span class="order-summary__value">One-time payment</span>
          </div>
          <div class="order-summary__row">
            <span class="order-summary__label">Access</span>
            <span class="order-summary__value">One Pro celebration</span>
          </div>
          <div class="order-summary__row order-summary__row--total">
            <span class="order-summary__label">Total</span>
            <span class="order-summary__value">$9.99</span>
          </div>
        </div>

        <div class="payment-actions">
          <app-button
            variant="campaign"
            size="md"
            [fullWidth]="true"
            [loading]="loading()"
            [disabled]="loading()"
            (click)="startStripeCheckout()"
          >
            Pay with Stripe
          </app-button>
          <p class="payment-card__note">Secure checkout is handled by Stripe.</p>
        </div>

        @if (error()) {
          <div class="payment-error" role="alert">{{ error() }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .payment-page {
      min-height: 100vh;
      background: var(--color-pale-green, #EAF4DF);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .payment-card {
      width: 100%;
      max-width: 520px;
      background: #fff;
      border: 1px solid #C8DAC2;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(74, 114, 85, 0.14);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .payment-card__back {
      width: fit-content;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-forest, #4A7255);
      text-decoration: none;
    }
    .payment-card__eyebrow {
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-brand-green, #95C476);
      margin: 0;
    }
    .payment-card__heading {
      margin: 0;
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 800;
      line-height: 1.15;
      color: var(--color-text-dark, #1E2D23);
    }
    .payment-card__sub,
    .payment-card__note {
      margin: 0;
      font-size: 0.9375rem;
      color: var(--color-text-muted, #6A8272);
      line-height: 1.6;
      text-align: center;
    }
    .order-summary {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 0.5rem 0;
      border-top: 1px solid #eef3eb;
      border-bottom: 1px solid #eef3eb;
    }
    .order-summary__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.8rem 0;
      border-bottom: 1px solid #f2f5f0;
    }
    .order-summary__row:last-child {
      border-bottom: none;
    }
    .order-summary__row--total {
      padding-top: 1rem;
    }
    .order-summary__label {
      font-size: 0.875rem;
      color: var(--color-text-muted, #6A8272);
    }
    .order-summary__value {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--color-text-dark, #1E2D23);
      text-align: right;
    }
    .payment-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .payment-error {
      padding: 0.75rem 1rem;
      border-radius: 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: var(--color-error, #E53935);
      font-size: 0.875rem;
      font-weight: 500;
      text-align: center;
    }
  `],
})
export class UpgradePaymentComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly upgradeCampaignId = signal<string | null>(null);

  constructor() {
    this.upgradeCampaignId.set(this.route.snapshot.queryParamMap.get('campaignId'));
  }

  async startStripeCheckout(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const { data: { session } } = await this.supabase.client.auth.getSession();
      if (!session) {
        await this.router.navigate(['/login']);
        return;
      }

      const origin = window.location.origin;
      const campaignId = this.upgradeCampaignId();
      this.persistPendingUpgradeCampaign(campaignId);
      const query = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
      const successUrl = `${origin}/pro/upgrade/success${query}`;
      const cancelUrl = `${origin}/pro/upgrade/payment${query}`;

      const { data, error } = await this.supabase.client.functions.invoke<{ url: string }>(
        'stripe-campaign-payment',
        { body: { successUrl, cancelUrl, campaignId } },
      );
      if (error) throw new Error(error.message || 'Unable to start checkout.');
      if (!data?.url) throw new Error('Checkout URL missing from response.');
      window.location.href = data.url;
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      this.loading.set(false);
    }
  }

  private persistPendingUpgradeCampaign(campaignId: string | null): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (campaignId) {
      window.sessionStorage.setItem(PENDING_PRO_UPGRADE_CAMPAIGN_KEY, campaignId);
    } else {
      window.sessionStorage.removeItem(PENDING_PRO_UPGRADE_CAMPAIGN_KEY);
    }
  }
}
