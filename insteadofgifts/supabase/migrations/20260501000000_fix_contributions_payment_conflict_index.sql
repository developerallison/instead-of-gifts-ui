drop index if exists public.idx_contributions_payment_provider_reference;

create unique index if not exists idx_contributions_payment_provider_reference
  on public.contributions (payment_provider, payment_reference);
