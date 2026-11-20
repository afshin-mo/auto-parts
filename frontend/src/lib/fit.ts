/**
 * چند آیتم از نوار منو در عرض موجود جا می‌شود؟ اگر همه جا شدند همه؛ وگرنه جا برای دکمه‌ی «بیشتر» هم نگه داشته می‌شود.
 * widths: عرض هر آیتم، moreWidth: عرض دکمه‌ی «بیشتر»، avail: عرض قابل‌استفاده‌ی نوار
 */
export function fitCount(widths: number[], moreWidth: number, avail: number): number {
  if (widths.reduce((a, b) => a + b, 0) <= avail) return widths.length;
  let used = moreWidth, n = 0;
  for (const w of widths) { if (used + w > avail) break; used += w; n++; }
  return n;
}
