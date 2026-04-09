/** Set to your Supabase project URL (Dashboard → Settings → API → Project URL). */
const supabaseProjectUrl = 'https://mmvabtwjneyrptdmtass.supabase.co';

export const environment = {
  production: true,
  supabase: {
    url: supabaseProjectUrl,
    anonKey: 'sb_publishable_pIR-Mu_88Rjd9oDo2QJdOw_x0FJjRR2',
  },
  stripe: {
    publishableKey: 'pk_test_51TEj2wKPfi0NJ0mnhOHkRLGQLjRJtHjZvngjgTBqBp7FPA4R1lS3TTDxc5CQDNp1UPQCDN64XKwQpCN4HX2L2GYa00KLEtoXPy', //developer@insteadofgifts.com
  },
  paypal: {
    clientId: 'AYloqzb9C8jsFWuL5B5WR8hXrIWHtImNXIEMziOtF1A--s6ksFBcjfbKVkHXI0IKdD7ET8g4xzuagToH',
    environment: 'sandbox',
  },
  /** Derived from the project URL so it never drifts out of sync. */
  apiUrl: `${supabaseProjectUrl.replace(/\/$/, '')}/functions/v1`,
};
