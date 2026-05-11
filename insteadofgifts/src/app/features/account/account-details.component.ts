import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProService } from '../../core/services/pro.service';
import { SupabaseService } from '../../core/services/supabase.service';
import {
  StripeConnectedAccountSummary,
  StripeConnectStatusResponse,
  StripeService,
} from '../../core/services/stripe.service';
import { ButtonComponent } from '../../shared/components/button/button.component';

@Component({
  selector: 'app-account-details',
  standalone: true,
  imports: [RouterLink, ButtonComponent],
  templateUrl: './account-details.component.html',
  styleUrl: './account-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDetailsComponent implements OnInit {
  private readonly authSvc = inject(AuthService);
  private readonly proSvc = inject(ProService);
  private readonly supabaseSvc = inject(SupabaseService);
  private readonly stripeSvc = inject(StripeService);

  readonly user = this.authSvc.user;
  readonly isPro = this.proSvc.isPro;
  readonly campaignCredits = this.proSvc.campaignCredits;

  readonly stripeLoading = signal(true);
  readonly stripeBusy = signal(false);
  readonly stripeError = signal<string | null>(null);
  readonly stripeAccount = signal<StripeConnectedAccountSummary | null>(null);
  readonly stripeOnboardingComplete = signal(false);

  readonly displayName = computed(() => {
    const user = this.user();
    if (!user) return 'Account';

    const metadataName =
      user.user_metadata?.['full_name'] ??
      user.user_metadata?.['name'] ??
      user.user_metadata?.['first_name'];

    return typeof metadataName === 'string' && metadataName.trim().length
      ? metadataName.trim()
      : user.email ?? 'Account';
  });

  async ngOnInit(): Promise<void> {
    await Promise.allSettled([
      this.proSvc.loadProfile(),
      this.loadStripeAccount(),
    ]);
  }

  async onConnectStripe(forceNewAccount = false): Promise<void> {
    if (this.stripeBusy()) return;

    this.stripeBusy.set(true);
    this.stripeError.set(null);
    try {
      await this.stripeSvc.startConnectOnboarding({
        forceNewAccount,
      });
    } catch (error) {
      console.error('[account-details] Failed to start Stripe onboarding:', error);
      this.stripeError.set(
        error instanceof Error ? error.message : 'Failed to open Stripe setup.',
      );
      this.stripeBusy.set(false);
    }
  }

  async onChangeStripeAccount(): Promise<void> {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Connect a different payout account? Future celebration contributions will use the new account after setup is completed.',
      );
      if (!confirmed) return;
    }

    await this.onConnectStripe(true);
  }

  async refreshStripeStatus(): Promise<void> {
    await this.loadStripeAccount();
  }

  formatCountry(code: string | null): string {
    if (!code) return 'Not provided';

    try {
      const displayNames = new Intl.DisplayNames(undefined, { type: 'region' });
      return displayNames.of(code.toUpperCase()) ?? code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  }

  formatCurrency(code: string | null): string {
    return code ? code.toUpperCase() : 'Not provided';
  }

  formatBusinessType(type: string | null): string {
    if (!type) return 'Not provided';

    return type
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async loadStripeAccount(): Promise<void> {
    this.stripeLoading.set(true);
    this.stripeError.set(null);

    try {
      const { data: { user } } = await this.supabaseSvc.client.auth.getUser();
      if (!user) {
        this.stripeAccount.set(null);
        this.stripeOnboardingComplete.set(false);
        return;
      }

      const [{ data: profile, error: profileError }, status] = await Promise.all([
        this.supabaseSvc.client
          .from('user_profiles')
          .select('stripe_account_id, stripe_onboarding_complete')
          .eq('id', user.id)
          .maybeSingle(),
        this.stripeSvc.checkConnectStatus().catch((error) => {
          console.warn('[account-details] Stripe status enrichment unavailable:', error);
          return null as StripeConnectStatusResponse | null;
        }),
      ]);

      if (profileError) {
        throw profileError;
      }

      const fallbackAccountId = profile?.stripe_account_id ?? null;
      const fallbackComplete = profile?.stripe_onboarding_complete ?? false;
      const detailedAccount = status?.account ?? null;

      this.stripeAccount.set(
        detailedAccount ?? this.createFallbackStripeAccount(fallbackAccountId, user.email ?? null, fallbackComplete),
      );
      this.stripeOnboardingComplete.set(status?.complete ?? fallbackComplete);
    } catch (error) {
      console.error('[account-details] Failed to load Stripe account:', error);
      this.stripeError.set(
        error instanceof Error ? error.message : 'Failed to load Stripe account details.',
      );
      this.stripeAccount.set(null);
      this.stripeOnboardingComplete.set(false);
    } finally {
      this.stripeLoading.set(false);
    }
  }

  private createFallbackStripeAccount(
    accountId: string | null,
    email: string | null,
    onboardingComplete: boolean,
  ): StripeConnectedAccountSummary | null {
    if (!accountId) {
      return null;
    }

    return {
      id: accountId,
      email,
      country: null,
      defaultCurrency: null,
      businessType: null,
      chargesEnabled: onboardingComplete,
      payoutsEnabled: onboardingComplete,
    };
  }
}
