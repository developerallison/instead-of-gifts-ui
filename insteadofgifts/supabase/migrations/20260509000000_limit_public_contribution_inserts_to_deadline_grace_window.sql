drop policy if exists "contributions_insert_anyone" on public.contributions;

create policy "contributions_insert_anyone"
  on public.contributions
  for insert
  with check (
    status = 'pending'
    and exists (
      select 1
      from public.campaigns c
      where c.id = campaign_id
        and c.is_active = true
        and (
          c.deadline is null
          or now() <= c.deadline + interval '15 days'
        )
    )
  );
