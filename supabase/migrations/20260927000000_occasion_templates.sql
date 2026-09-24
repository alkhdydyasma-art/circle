-- Replace the "calm" and "premium" templates with occasion themes:
--   founding_day  (يوم التأسيس — 22 February)
--   national_day  (اليوم الوطني — 23 September)

alter table public.clinic_sites drop constraint if exists clinic_sites_template_check;

update public.clinic_sites set template = 'founding_day' where template = 'calm';
update public.clinic_sites set template = 'national_day' where template = 'premium';

alter table public.clinic_sites add constraint clinic_sites_template_check
  check (template in ('modern', 'founding_day', 'national_day'));
