# یدکی‌یار — سامانه فروشگاه قطعات یدکی

- `backend/` : NestJS + Prisma + PostgreSQL (راهنما: `backend/README.md`، مودیان: `backend/docs/MOODIAN.md`)
- `frontend/`: React + Vite، فارسی/راست‌چین با تقویم شمسی (راهنما: `frontend/README.md`)

شروع سریع: در `backend` پایگاه‌داده، migrate و seed را اجرا کنید و `npm run start:dev` بزنید. در `frontend` هم `npm install && npm run dev` و وارد `http://localhost:5173` شوید.
برای دیدن رابط بدون بکند: `cd frontend && npm install && npm run dev:mock` (ورود: `09120000000` / `demo1234`).

## نسخه ۲ (چند شعبه، دسترسی دلخواه، جستجوی فنی، موبایل، انتقال داده)
- **اول بخوانید:** [`docs/UPGRADE-V2.md`](docs/UPGRADE-V2.md) — مراحل اجرا (مایگریشن جدید لازم است)، وضعیت هر قابلیت، محدودیت‌ها و تغییرات امنیتی.
- مقیاس‌پذیری و کارهای باقی‌مانده قبل از فروش به مشتری دوم: [`docs/ARCHITECTURE-SCALABILITY.md`](docs/ARCHITECTURE-SCALABILITY.md).
