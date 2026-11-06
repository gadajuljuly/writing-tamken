-- Starter tasks under each axis (both competitions).
-- Paste into Supabase → SQL Editor → Run. Safe to run again: existing or similar tasks are skipped.
do $$
declare
  r record;
  added int := 0;
begin
  for r in
    select * from (values
      ('ar', 1, 'تحديد مكان المسابقة'),
      ('ar', 1, 'ترتيب المواصلات'),
      ('ar', 1, 'تجهيز التضييفات'),
      ('ar', 1, 'تجهيز الجوائز'),
      ('ar', 1, 'تجهيزات حفل التتويج'),
      ('ar', 2, 'التواصل مع المدارس'),
      ('ar', 2, 'لقاءات الطاقم'),
      ('ar', 2, 'المنشورات والبوسترات'),
      ('ar', 3, 'اختيار مواضيع الكتابة'),
      ('ar', 3, 'إعداد مئشار التقييم'),
      ('ar', 3, 'تشكيل لجنة التحكيم'),
      ('ar', 3, 'متابعة المدربات'),
      ('ar', 4, 'استضافة كاتب'),
      ('ar', 4, 'قراءة قصص الكاتب'),
      ('ar', 4, 'الأنشطة المرتبطة بقصص الكاتب'),
      ('ar', 5, 'شهادات التقدير'),
      ('ar', 5, 'رسائل الشكر'),
      ('ar', 5, 'استكمال التنسيق'),
      ('he', 1, 'קביעת מקום התחרות'),
      ('he', 1, 'הסדרת הסעות'),
      ('he', 1, 'הכנת כיבוד'),
      ('he', 1, 'הכנת הפרסים'),
      ('he', 1, 'הכנות לטקס הענקת הפרסים'),
      ('he', 2, 'קשר עם בתי הספר'),
      ('he', 2, 'מפגשי צוות'),
      ('he', 2, 'פרסומים ופוסטרים'),
      ('he', 3, 'בחירת נושאי הכתיבה'),
      ('he', 3, 'הכנת מחוון הערכה'),
      ('he', 3, 'הרכבת ועדת השיפוט'),
      ('he', 3, 'מעקב אחר המנחות'),
      ('he', 4, 'אירוח סופר/ת'),
      ('he', 4, 'קריאת סיפורי הסופר/ת'),
      ('he', 4, 'פעילויות סביב סיפורי הסופר/ת'),
      ('he', 5, 'תעודות הוקרה'),
      ('he', 5, 'מכתבי תודה'),
      ('he', 5, 'השלמת התיאום')
    ) as t(competition, axis, title)
  loop
    begin
      insert into public.wt_tasks (competition, axis, title) values (r.competition, r.axis, r.title);
      added := added + 1;
    exception when unique_violation then
      null; -- a same or similar task already exists
    end;
  end loop;
  raise notice 'added % tasks', added;
end $$;
