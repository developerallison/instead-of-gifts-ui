import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';

const PENDING_PRO_UPGRADE_CAMPAIGN_KEY = 'pendingProUpgradeCampaignId';

@Component({
  selector: 'app-upgrade-payment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  template: `
    <div class="payment-page">
      <div class="payment-card">
        <button
          type="button"
          class="payment-card__back"
          (click)="goBack()"
        >
          <svg class="payment-card__back-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 4.158a.75.75 0 11-1.06 1.06l-5.5-5.5a.75.75 0 010-1.06l5.5-5.5a.75.75 0 111.06 1.06L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd"/>
          </svg>
          Back
        </button>

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
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 0.95rem;
      border: 1px solid #C8DAC2;
      border-radius: 999px;
      background: #F6FAF1;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-forest, #4A7255);
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
    }
    .payment-card__back-icon {
      width: 1rem;
      height: 1rem;
    }
    .payment-card__back:hover {
      background: #eef6e5;
      border-color: #A8C39E;
    }
    .payment-card__back:focus-visible {
      outline: 2px solid var(--color-forest, #4A7255);
      outline-offset: 3px;
    }
    .payment-card__back:active {
      transform: translateY(1px);
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
  private readonly location = inject(Location);
  private readonly platformId = inject(PLATFORM_ID);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly upgradeCampaignId = signal<string | null>(null);

  constructor() {
    this.upgradeCampaignId.set(this.route.snapshot.queryParamMap.get('campaignId'));
  }

  async goBack(): Promise<void> {
    if (isPlatformBrowser(this.platformId) && window.history.length > 1) {
      this.location.back();
      return;
    }

    const campaignId = this.upgradeCampaignId();
    await this.router.navigate(['/pro/upgrade'], {
      queryParams: campaignId ? { campaignId } : undefined,
    });
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
