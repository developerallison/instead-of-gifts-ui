import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

interface PaymentIntentResponse {
  clientSecret: string;
}

interface CreatePaymentSessionPayload {
  campaignId: string;
  amount: number;
  message: string;
}

export interface CheckoutParams {
  campaignId: string;
  /** Amount in pence / cents (smallest currency unit). */
  amountPence: number;
  contributorName: string;
  message: string;
  isAnonymous: boolean;
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutSessionResponse {
  url: string;
}

@Injectable({ providedIn: 'root' })
export class StripeService {
  private readonly http        = inject(HttpClient);
  private readonly supabaseSvc = inject(SupabaseService);

  /** Lazily loaded Stripe instance — resolves once on first call, reused thereafter. */
  private stripePromise: Promise<Stripe | null> | null = null;

  getStripe(): Promise<Stripe | null> {
    if (!this.stripePromise) {
      this.stripePromise = loadStripe(environment.stripe.publishableKey);
    }
    return this.stripePromise;
  }

  /**
   * Creates a Stripe Checkout Session via the backend and redirects the
   * browser to the hosted Stripe payment page.
   *
   * The backend endpoint POST /payments/create-checkout-session must return
   * { url: string } — the Stripe-hosted Checkout URL.
   *
   * On payment success, Stripe redirects to `params.successUrl`.
   * On cancellation, Stripe redirects to `params.cancelUrl`.
   */
  async redirectToCheckout(params: CheckoutParams): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<CheckoutSessionResponse>(
        `${environment.apiUrl}/create-checkout-session`,
        params
      )
    );
    // Hard-navigate to Stripe's hosted Checkout page
    window.location.href = response.url;
  }

  /**
   * Initiates Stripe Connect Express onboarding for the authenticated organiser.
   * Calls the `stripe-connect-onboard` Edge Function and redirects the browser
   * to the Stripe-hosted onboarding page.
   */
  async startConnectOnboarding(): Promise<void> {
    const jwt = await this.getJwt();
    const response = await firstValueFrom(
      this.http.post<{ url: string }>(
        `${environment.apiUrl}/stripe-connect-onboard`,
        {},
        { headers: { Authorization: `Bearer ${jwt}` } },
      )
    );
    window.location.href = response.url;
  }

  /**
   * Checks whether the organiser has completed Stripe Connect onboarding.
   * Calls the `stripe-connect-callback` Edge Function and returns the result.
   */
  async checkConnectStatus(): Promise<{ complete: boolean }> {
    const jwt = await this.getJwt();
    return firstValueFrom(
      this.http.post<{ complete: boolean }>(
        `${environment.apiUrl}/stripe-connect-callback`,
        {},
        { headers: { Authorization: `Bearer ${jwt}`, 'apikey': environment.supabase.anonKey } },
      )
    );
  }

  /** Returns the current session JWT, or throws if the user is not signed in. */
  private async getJwt(): Promise<string> {
    const { data: { session } } = await this.supabaseSvc.client.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return session.access_token;
  }

  /**
   * Calls the backend to create a Stripe Payment Intent and returns its client secret.
   * @param campaignId  The campaign receiving the contribution.
   * @param amount      Amount in the smallest currency unit (e.g. pence / cents).
   * @param message     Optional donor message attached to the payment metadata.
   */
  async createPaymentSession(
    campaignId: string,
    amount: number,
    message: string
  ): Promise<string> {
    const payload: CreatePaymentSessionPayload = { campaignId, amount, message };
    const response = await firstValueFrom(
      this.http.post<PaymentIntentResponse>(
        `${environment.apiUrl}/payments/create-intent`,
        payload
      )
    );
    return response.clientSecret;
  }
}
