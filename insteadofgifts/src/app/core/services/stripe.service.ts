import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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

export interface StripeConnectedAccountSummary {
  id: string;
  email: string | null;
  country: string | null;
  defaultCurrency: string | null;
  businessType: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface StripeConnectStatusResponse {
  complete: boolean;
  account: StripeConnectedAccountSummary | null;
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
  async startConnectOnboarding(options?: { forceNewAccount?: boolean }): Promise<void> {
    const jwt = await this.getJwt();
    try {
      const response = await firstValueFrom(
        this.http.post<{ url: string }>(
          `${environment.apiUrl}/stripe-connect-onboard`,
          {
            forceNewAccount: options?.forceNewAccount === true,
          },
          { headers: { Authorization: `Bearer ${jwt}`, apikey: environment.supabase.anonKey } },
        )
      );
      window.location.href = response.url;
    } catch (error: unknown) {
      throw new Error(this.extractHttpErrorMessage(error, 'Failed to start Stripe onboarding.'));
    }
  }

  /**
   * Checks whether the organiser has completed Stripe Connect onboarding.
   * Calls the `stripe-connect-callback` Edge Function and returns the result.
   */
  async checkConnectStatus(): Promise<StripeConnectStatusResponse> {
    const jwt = await this.getJwt();
    try {
      return await firstValueFrom(
        this.http.post<StripeConnectStatusResponse>(
          `${environment.apiUrl}/stripe-connect-callback`,
          {},
          { headers: { Authorization: `Bearer ${jwt}`, 'apikey': environment.supabase.anonKey } },
        )
      );
    } catch (error: unknown) {
      throw new Error(this.extractHttpErrorMessage(error, 'Failed to check Stripe onboarding status.'));
    }
  }

  /** Returns the current session JWT, or throws if the user is not signed in. */
  private async getJwt(): Promise<string> {
    const { data: { session } } = await this.supabaseSvc.client.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return session.access_token;
  }

  private extractHttpErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const apiError = error.error;
      if (apiError && typeof apiError === 'object' && 'error' in apiError && typeof apiError.error === 'string') {
        return apiError.error;
      }
      if (typeof apiError === 'string' && apiError.trim()) {
        return apiError;
      }
      if (error.message) {
        return error.message;
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
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
