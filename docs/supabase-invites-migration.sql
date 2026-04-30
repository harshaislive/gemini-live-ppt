-- Run this after the original analytics SQL if those tables already exist.
-- This file is prepared for the `analytics` schema.

create table if not exists analytics.beforest_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique,
  token_last4 text,
  code_hash text unique,
  code_last4 text,
  invitee_name text,
  invitee_email text,
  invitee_phone text,
  campaign text,
  source text,
  notes text,
  max_uses integer not null default 20,
  used_count integer not null default 0,
  expires_at timestamptz,
  last_used_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table analytics.beforest_interactions add column if not exists invite_id text;
alter table analytics.beforest_interactions add column if not exists invitee_name text;
alter table analytics.beforest_interactions add column if not exists invitee_email text;
alter table analytics.beforest_interactions add column if not exists invitee_phone text;
alter table analytics.beforest_interactions add column if not exists campaign text;
alter table analytics.beforest_interactions add column if not exists invite_source text;

alter table analytics.beforest_slide_metrics add column if not exists invite_id text;
alter table analytics.beforest_slide_metrics add column if not exists invitee_name text;
alter table analytics.beforest_slide_metrics add column if not exists invitee_email text;
alter table analytics.beforest_slide_metrics add column if not exists invitee_phone text;
alter table analytics.beforest_slide_metrics add column if not exists campaign text;
alter table analytics.beforest_slide_metrics add column if not exists invite_source text;

alter table analytics.beforest_questions add column if not exists invite_id text;
alter table analytics.beforest_questions add column if not exists invitee_name text;
alter table analytics.beforest_questions add column if not exists invitee_email text;
alter table analytics.beforest_questions add column if not exists invitee_phone text;
alter table analytics.beforest_questions add column if not exists campaign text;
alter table analytics.beforest_questions add column if not exists invite_source text;

alter table analytics.beforest_faq_metrics add column if not exists invite_id text;
alter table analytics.beforest_faq_metrics add column if not exists invitee_name text;
alter table analytics.beforest_faq_metrics add column if not exists invitee_email text;
alter table analytics.beforest_faq_metrics add column if not exists invitee_phone text;
alter table analytics.beforest_faq_metrics add column if not exists campaign text;
alter table analytics.beforest_faq_metrics add column if not exists invite_source text;

alter table analytics.beforest_session_signals add column if not exists invite_id text;
alter table analytics.beforest_session_signals add column if not exists invitee_name text;
alter table analytics.beforest_session_signals add column if not exists invitee_email text;
alter table analytics.beforest_session_signals add column if not exists invitee_phone text;
alter table analytics.beforest_session_signals add column if not exists campaign text;
alter table analytics.beforest_session_signals add column if not exists invite_source text;

alter table analytics.beforest_subscribe_leads add column if not exists invite_id text;
alter table analytics.beforest_subscribe_leads add column if not exists invitee_name text;
alter table analytics.beforest_subscribe_leads add column if not exists invitee_email text;
alter table analytics.beforest_subscribe_leads add column if not exists invitee_phone text;
alter table analytics.beforest_subscribe_leads add column if not exists campaign text;

create index if not exists beforest_interactions_invite_idx
  on analytics.beforest_interactions (invite_id, occurred_at);

create index if not exists beforest_session_signals_invite_idx
  on analytics.beforest_session_signals (invite_id, occurred_at);

create index if not exists beforest_invites_code_hash_idx
  on analytics.beforest_invites (code_hash);

create index if not exists beforest_invites_token_hash_idx
  on analytics.beforest_invites (token_hash);

create or replace view analytics.beforest_hot_leads_v as
with session_rollup as (
  select
    session_id,
    nullif(max(invite_id), '') as invite_id,
    nullif(max(listener_name), '') as listener_name,
    nullif(max(invitee_name), '') as invitee_name,
    nullif(max(invitee_email), '') as invitee_email,
    nullif(max(invitee_phone), '') as invitee_phone,
    nullif(max(campaign), '') as campaign,
    nullif(max(invite_source), '') as invite_source,
    min(occurred_at) as first_seen_at,
    max(occurred_at) as last_seen_at,
    sum(lead_score_delta) as lead_score,
    count(*) filter (where event_name = 'question_asked') as questions_asked,
    count(*) filter (where event_name = 'faq_opened') as faqs_opened,
    count(*) filter (where event_name = 'faq_audio_completed') as faqs_completed,
    bool_or(event_name = 'trial_stay_clicked') as clicked_trial_stay,
    bool_or(event_name = 'subscribe_lead_completed') as subscribed_for_updates,
    bool_or(payload->>'timing' = 'Next 30 days') as next_30_days
  from analytics.beforest_session_signals
  group by session_id
),
reason_rollup as (
  select
    session_id,
    array_agg(distinct reason order by reason) as reasons
  from analytics.beforest_session_signals
  cross join lateral unnest(lead_reasons) as reason
  group by session_id
)
select
  session_rollup.*,
  coalesce(reason_rollup.reasons, array[]::text[]) as reasons,
  case
    when session_rollup.lead_score >= 55
      or session_rollup.clicked_trial_stay
      or (session_rollup.subscribed_for_updates and session_rollup.next_30_days)
      then 'hot'
    when session_rollup.lead_score >= 25
      or session_rollup.questions_asked > 0
      or session_rollup.faqs_opened >= 2
      then 'warm'
    else 'nurture'
  end as lead_temperature
from session_rollup
left join reason_rollup using (session_id);

