export interface AppEnvironment {
  production: boolean;
  appUrl: string;
  supabase: {
    url: string;
    anonKey: string;
  };
  stripe: {
    publishableKey: string;
  };
  apiUrl: string;
}
