-- Demo clinic for sales demos and local development: "عيادة النور لطب الأسنان" at /ar/c/noor.
-- Idempotent: re-running resets the demo clinic's configuration. Run as a privileged user
-- (Supabase SQL Editor). Contains no real patient data.

do $$
declare
  v_clinic uuid := '0c11c000-0000-4000-8000-000000000001';
  v_olaya uuid := '0c11c000-0000-4000-8000-0000000000b1';
  v_hamra uuid := '0c11c000-0000-4000-8000-0000000000b2';
  v_sara uuid := '0c11c000-0000-4000-8000-0000000000d1';
  v_fahad uuid := '0c11c000-0000-4000-8000-0000000000d2';
  v_reem uuid := '0c11c000-0000-4000-8000-0000000000d3';
  s_exam uuid := '0c11c000-0000-4000-8000-0000000000e1';
  s_clean uuid := '0c11c000-0000-4000-8000-0000000000e2';
  s_fill uuid := '0c11c000-0000-4000-8000-0000000000e3';
  s_white uuid := '0c11c000-0000-4000-8000-0000000000e4';
  s_aligners uuid := '0c11c000-0000-4000-8000-0000000000e5';
  s_implant uuid := '0c11c000-0000-4000-8000-0000000000e6';
begin
  insert into public.clinics (id, name, city, clinic_type, status, plan)
  values (v_clinic, 'عيادة النور لطب الأسنان', 'جدة', 'general', 'active', 'standard')
  on conflict (id) do update set name = excluded.name, status = 'active';

  update public.clinic_sites set
    slug = 'noor', published = true, template = 'modern',
    brand = '{"primary": "#0e7490", "accent": "#14b8a6", "font": "tajawal"}',
    content = '{
      "tagline": "ابتسامتك تستحق رعاية هادئة ودقيقة",
      "about": "فريق من أطباء الأسنان الاستشاريين في جدة، نقدم رعاية شاملة للعائلة من الفحص الدوري حتى التجميل والزراعة، بأجهزة حديثة ومواعيد تحترم وقتك.",
      "sections": {"services": true, "doctors": true, "branches": true}
    }',
    phone = '0126000000', whatsapp = '+966530689203', email = 'hello@noor-dental.example',
    slot_minutes = 30, booking_days_ahead = 30, min_notice_minutes = 120
  where clinic_id = v_clinic;

  delete from public.working_hours where clinic_id = v_clinic;
  delete from public.doctor_services where clinic_id = v_clinic;

  insert into public.branches (id, clinic_id, name, city, address, phone, maps_url) values
    (v_olaya, v_clinic, 'فرع الروضة', 'جدة', 'شارع الأمير سلطان، حي الروضة', '0126000001', 'https://maps.google.com/?q=Al+Rawdah+Jeddah'),
    (v_hamra, v_clinic, 'فرع الحمراء', 'جدة', 'طريق الكورنيش، حي الحمراء', '0126000002', 'https://maps.google.com/?q=Al+Hamra+Jeddah')
  on conflict (id) do update set name = excluded.name, address = excluded.address;

  insert into public.services (id, clinic_id, name, description, duration_minutes, price, sort) values
    (s_exam, v_clinic, 'كشف وتشخيص', 'فحص شامل للأسنان واللثة مع أشعة وخطة علاج واضحة.', 30, 150, 1),
    (s_clean, v_clinic, 'تنظيف وتلميع', 'إزالة الجير والتصبغات بلطف وتلميع يعيد لمعة الأسنان.', 30, 300, 2),
    (s_fill, v_clinic, 'حشوات تجميلية', 'حشوات بلون السن الطبيعي تدوم طويلاً.', 60, 350, 3),
    (s_white, v_clinic, 'تبييض الأسنان', 'جلسة تبييض آمنة بنتائج ملحوظة من أول زيارة.', 60, 1200, 4),
    (s_aligners, v_clinic, 'تقويم شفاف', 'تقويم غير مرئي بخطة رقمية ومتابعة دورية.', 60, 5000, 5),
    (s_implant, v_clinic, 'زراعة الأسنان', 'زرعات عالية الجودة مع تاج طبيعي المظهر.', 90, 4500, 6)
  on conflict (id) do update set name = excluded.name, description = excluded.description,
    duration_minutes = excluded.duration_minutes, price = excluded.price, sort = excluded.sort;

  insert into public.doctors (id, clinic_id, full_name, title, specialty, bio, sort) values
    (v_sara, v_clinic, 'د. سارة الغامدي', 'استشارية', 'تجميل الأسنان', 'زمالة في طب الأسنان التجميلي، 12 سنة خبرة في الابتسامة الهوليودية والتبييض.', 1),
    (v_fahad, v_clinic, 'د. فهد العتيبي', 'استشاري', 'زراعة الأسنان', 'متخصص في الزراعة الفورية وتعويض الأسنان المفقودة.', 2),
    (v_reem, v_clinic, 'د. ريم الحربي', 'أخصائية', 'تقويم الأسنان', 'خبرة واسعة في التقويم الشفاف للبالغين والمراهقين.', 3)
  on conflict (id) do update set full_name = excluded.full_name, title = excluded.title,
    specialty = excluded.specialty, bio = excluded.bio;

  insert into public.doctor_services (clinic_id, doctor_id, service_id) values
    (v_clinic, v_sara, s_exam), (v_clinic, v_sara, s_clean), (v_clinic, v_sara, s_fill), (v_clinic, v_sara, s_white),
    (v_clinic, v_fahad, s_exam), (v_clinic, v_fahad, s_implant), (v_clinic, v_fahad, s_fill),
    (v_clinic, v_reem, s_exam), (v_clinic, v_reem, s_aligners), (v_clinic, v_reem, s_clean);

  -- Sun–Thu (0–4): Sara & Reem at Rawdah, Fahad at Hamra; Sat (6): everyone at Rawdah, mornings.
  insert into public.working_hours (clinic_id, doctor_id, branch_id, weekday, start_time, end_time)
  select v_clinic, doc, br, wd, st, et
  from (values (v_sara, v_olaya), (v_reem, v_olaya), (v_fahad, v_hamra)) as d(doc, br),
       generate_series(0, 4) wd, (values (time '16:00', time '22:00')) h(st, et)
  union all
  select v_clinic, doc, v_olaya, 6, '10:00', '14:00' from unnest(array[v_sara, v_fahad, v_reem]) doc;
end $$;
