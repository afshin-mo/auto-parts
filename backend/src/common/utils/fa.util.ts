const FA = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (v: string | number) => String(v).replace(/\d/g, (d) => FA[+d]);
/** عدد با جداکننده‌ی هزارگان و ارقام فارسی: ۱٬۲۵۰٬۰۰۰ */
export const faMoney = (n: number) => faDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');
