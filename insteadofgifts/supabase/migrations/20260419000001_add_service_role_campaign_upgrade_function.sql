create or replace function public.upgrade_paid_campaign_for_user(
  p_user_id uuid,
  p_campaign_id uuid
)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns;
  v_credits integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required.';
  end if;

  select *
    into v_campaign
  from public.campaigns
  where id = p_campaign_id
    and created_by = p_user_id
  for update;

  if not found then
    raise exception 'Campaign not found or you do not have access.';
  end if;

  if v_campaign.is_pro then
    return v_campaign;
  end if;

  select campaign_pro_credits
    into v_credits
  from public.user_profiles
  where id = p_user_id
  for update;

  if coalesce(v_credits, 0) <= 0 then
    raise exception 'Complete payment before upgrading this campaign.';
  end if;

  update public.campaigns
  set is_pro = true
  where id = p_campaign_id
  returning * into v_campaign;

  update public.user_profiles
  set campaign_pro_credits = campaign_pro_credits - 1
  where id = p_user_id;

  return v_campaign;
end;
$$;

revoke all on function public.upgrade_paid_campaign_for_user(uuid, uuid) from public;
grant execute on function public.upgrade_paid_campaign_for_user(uuid, uuid) to service_role;
