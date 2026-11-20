-- یکسان‌سازی حروف عربی (ي ى ك) در داده‌ی موجود → ی ک فارسی، تا جستجوی کالا با کیبورد فارسی کار کند.
-- فقط برای دیتابیسی که قبل از این اصلاح از اکسل/نرم‌افزار قبلی وارد شده است؛ ورودی‌های جدید خودبه‌خود نرمال می‌شوند.
-- اجرا با کاربر مالک (از RLS معاف است):  psql -U postgres -d auto_parts_dev -f prisma/sql/003_normalize_letters.sql
-- ایدمپوتنت است و فقط ردیف‌هایی که حرف عربی دارند را تغییر می‌دهد.
BEGIN;
UPDATE products   SET name        = btrim(regexp_replace(translate(name,        'يىك', 'ییک'), '\s+', ' ', 'g')) WHERE name        ~ '[يىك]' OR name ~ '\s{2,}';
UPDATE products   SET name_en     = btrim(regexp_replace(translate(name_en,     'يىك', 'ییک'), '\s+', ' ', 'g')) WHERE name_en     ~ '[يىك]';
UPDATE products   SET description = translate(description, 'يىك', 'ییک')                                         WHERE description ~ '[يىك]';
UPDATE products   SET location    = btrim(translate(location,    'يىك', 'ییک'))                                    WHERE location    ~ '[يىك]';
UPDATE brands     SET name        = btrim(regexp_replace(translate(name,        'يىك', 'ییک'), '\s+', ' ', 'g')) WHERE name        ~ '[يىك]';
UPDATE categories SET name        = btrim(regexp_replace(translate(name,        'يىك', 'ییک'), '\s+', ' ', 'g')) WHERE name        ~ '[يىك]';
COMMIT;
