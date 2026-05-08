import { AppEnvironment } from './environment.model';

/** Production environment. Replace these values with your production providers/projects. */
const supabaseProjectUrl = 'https://auth.insteadofgifts.com';

export const environment: AppEnvironment = {
  production: true,
  appUrl: 'https://www.insteadofgifts.com',
  supabase: {
    url: supabaseProjectUrl,
    anonKey: 'sb_publishable_BCvxQBww6Pzkx4BMEjEvCA_GJREOu8B',
  },
  stripe: {
    publishableKey: 'pk_live_51TLpjEGosspEvv9AWRXV45I4nM94do8mmUxGSA2KW7DySvovvnyTAXy9iDj77vMukm1GQu5WYk2osuffYvFVJEOK00S2yjM07E', //allison@insteadofgifts.com
  },
  /** Keep production Edge Functions aligned with the production Supabase project above. */
  apiUrl: `${supabaseProjectUrl.replace(/\/$/, '')}/functions/v1`,
};
