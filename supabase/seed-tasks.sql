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
      ('ar', 7, 'تجهيز الجوائز'),
      ('ar', 7, 'تجهيزات حفل التتويج'),
      ('ar', 2, 'التواصل مع المدارس'),
      ('ar', 3, 'لقاءات الطاقم'),
      ('ar', 2, 'المنشورات والبوسترات'),
      ('ar', 5, 'اختيار مواضيع الكتابة'),
      ('ar', 5, 'إعداد مئشار التقييم'),
      ('ar', 5, 'تشكيل لجنة التحكيم'),
      ('ar', 4, 'متابعة المدربات'),
      ('ar', 6, 'استضافة كاتب'),
      ('ar', 6, 'قراءة قصص الكاتب'),
      ('ar', 6, 'الأنشطة المرتبطة بقصص الكاتب'),
      ('ar', 7, 'شهادات التقدير'),
      ('ar', 7, 'رسائل الشكر'),
      ('ar', 7, 'استكمال التنسيق'),
      ('he', 1, 'קביעת מקום התחרות'),
      ('he', 1, 'הסדרת הסעות'),
      ('he', 1, 'הכנת כיבוד'),
      ('he', 7, 'הכנת הפרסים'),
      ('he', 7, 'הכנות לטקס הענקת הפרסים'),
      ('he', 2, 'קשר עם בתי הספר'),
      ('he', 3, 'מפגשי צוות'),
      ('he', 2, 'פרסומים ופוסטרים'),
      ('he', 5, 'בחירת נושאי הכתיבה'),
      ('he', 5, 'הכנת מחוון הערכה'),
      ('he', 5, 'הרכבת ועדת השיפוט'),
      ('he', 4, 'מעקב אחר המנחות'),
      ('he', 6, 'אירוח סופר/ת'),
      ('he', 6, 'קריאת סיפורי הסופר/ת'),
      ('he', 6, 'פעילויות סביב סיפורי הסופר/ת'),
      ('he', 7, 'תעודות הוקרה'),
      ('he', 7, 'מכתבי תודה'),
      ('he', 7, 'השלמת התיאום')
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
