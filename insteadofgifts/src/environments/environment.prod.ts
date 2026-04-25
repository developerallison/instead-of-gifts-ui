import { AppEnvironment } from './environment.model';

/** Production environment. Replace these values with your production providers/projects. */
const supabaseProjectUrl = 'https://mcxijpqkpvyjxmooovkt.supabase.co';

export const environment: AppEnvironment = {
  production: true,
  appUrl: 'https://www.insteadofgifts.com',
  supabase: {
    url: supabaseProjectUrl,
    anonKey: 'sb_publishable_BCvxQBww6Pzkx4BMEjEvCA_GJREOu8B',
  },
  stripe: {
    publishableKey: 'pk_test_51TLpjTK7vuC5QvGEEg3gQzkA910OMf8znTfz7ANIqHZQihqdzG2LNZ3dTmZaTHrjkqQK6JN10ckuYtCRqADIazwV00IeI951pE', //allison@insteadofgifts.com
  },
  paypal: {
    clientId: 'AU4bpdQYn6kfGwiMOU9CkrUGsKvIkjX1gHnDYmSOcEWaZCS7Qz3oBW3V7Y6DXylS_zToolRSdhm-SNe9',
    environment: 'production',
  },
  /** Keep production Edge Functions aligned with the production Supabase project above. */
  apiUrl: `${supabaseProjectUrl.replace(/\/$/, '')}/functions/v1`,
};
