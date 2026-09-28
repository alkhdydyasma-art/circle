-- Demo activity for "عيادة النور": fictional patients and ~6 weeks of past visits plus the
-- coming week, so the doctors' board and reports have something to show in a sales demo.
-- Run AFTER demo_clinic.sql. Idempotent: re-running replaces the demo patients and visits.
-- All names are invented and every phone is in the unused +96650000xxxx range — NO real data.

do $$
declare
  v_clinic uuid := '0c11c000-0000-4000-8000-000000000001';
  names text[] := array['نورة القحطاني', 'سلمان الدوسري', 'هيفاء الشهري', 'تركي المطيري', 'ريم الزهراني',
    'عبدالرحمن السبيعي', 'لمى العنزي', 'ماجد الشمري', 'أروى الحازمي', 'بندر الرشيدي', 'جود السهلي',
    'فيصل القرني', 'دانة البقمي', 'خالد العمري', 'غادة الجهني', 'يزيد الحربي', 'شهد المالكي',
    'مشاري العصيمي', 'وعد التميمي', 'راكان الخالدي'];
  tz text;
begin
  select timezone into tz from public.clinic_sites where clinic_id = v_clinic;
  delete from public.patients where clinic_id = v_clinic and phone like '+96650000%';

  insert into public.patients (clinic_id, full_name, phone, source, created_at)
  select v_clinic, names[i], '+96650000' || lpad(i::text, 4, '0'),
         (array['website', 'ai_agent', 'dashboard', 'whatsapp'])[1 + i % 4],
         now() - make_interval(days => 60 - i * 2)
  from generate_subscripts(names, 1) i;

  -- One visit per doctor per slot when hash says so; Sun–Thu evenings (clinic hours).
  insert into public.appointments (clinic_id, branch_id, doctor_id, service_id, patient_id, starts_at, ends_at, status, source)
  select v_clinic, wh.branch_id, ds.doctor_id, ds.service_id, p.id,
    ((day + slot) at time zone tz), ((day + slot) at time zone tz) + make_interval(mins => sv.duration_minutes),
    case
      when day >= (now() at time zone tz)::date then (case when (h / 10) % 5 < 3 then 'confirmed' else 'pending' end)
      when (h / 10) % 20 < 15 then 'completed' when (h / 10) % 20 < 17 then 'no_show' else 'cancelled'
    end,
    (array['website', 'website', 'ai_agent', 'dashboard', 'whatsapp'])[1 + (h / 200) % 5]
  from (select g::date as day from generate_series((now() at time zone tz)::date - 42, (now() at time zone tz)::date + 7, interval '1 day') g) days
  cross join (values (time '16:00'), (time '17:30'), (time '19:00'), (time '20:30')) s(slot)
  join public.working_hours wh on wh.clinic_id = v_clinic and wh.weekday = extract(dow from day) and wh.start_time = '16:00'
  cross join lateral (select abs(hashtext(day::text || slot::text || wh.doctor_id::text)) as h) hh
  cross join lateral (
    select doctor_id, service_id from public.doctor_services
    where clinic_id = v_clinic and doctor_id = wh.doctor_id order by service_id offset ((h / 7) % 3) limit 1
  ) ds
  join public.services sv on sv.id = ds.service_id
  cross join lateral (
    select id from public.patients where clinic_id = v_clinic and phone like '+96650000%'
    order by phone offset ((h / 13) % 20) limit 1
  ) p
  where h % 10 < 6                                     -- ~60% of slots booked
    and (day + slot) at time zone tz > now() - interval '42 days'
    and not (day >= (now() at time zone tz)::date and (day + slot) at time zone tz < now())
    -- keep clear of visits booked by hand during demos
    and not exists (select 1 from public.appointments x
      where x.doctor_id = ds.doctor_id and x.status in ('pending', 'confirmed')
        and tstzrange(x.starts_at, x.ends_at) && tstzrange((day + slot) at time zone tz, (day + slot) at time zone tz + make_interval(mins => sv.duration_minutes)));

  -- Knowledge base for the WhatsApp assistant.
  delete from public.clinic_knowledge where clinic_id = v_clinic;
  insert into public.clinic_knowledge (clinic_id, title, content) values
    (v_clinic, 'التأمينات المقبولة', 'نقبل بوبا، التعاونية، ميدغلف، وملاذ. يلزم إحضار بطاقة التأمين والهوية.'),
    (v_clinic, 'الدفع', 'نقبل مدى، فيزا، ماستركارد، Apple Pay، وتابي للتقسيط على 4 دفعات.'),
    (v_clinic, 'المواقف', 'تتوفر مواقف مجانية خلف المبنى لفرعي الروضة والحمراء.'),
    (v_clinic, 'بعد التبييض', 'تجنب القهوة والشاي والأطعمة الملونة لمدة 48 ساعة بعد جلسة التبييض.');
end $$;
