import { Component, ErrorInfo, ReactNode } from 'react';

/**
 * خطای نمایشی در یک صفحه نباید کل برنامه را سفید کند: پیام و دکمه‌ی تلاش دوباره نشان داده می‌شود
 * و منو و بقیه‌ی صفحه‌ها در دسترس می‌مانند. با تغییر مسیر (key در Layout) دوباره ساخته می‌شود.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('خطای نمایش صفحه:', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="callout red" role="alert" style={{ margin: 16 }}>
        <b>خطایی در نمایش این صفحه رخ داد.</b>
        <div className="muted sm" style={{ margin: '6px 0 10px' }}>{this.state.error.message}</div>
        <div className="row wrap">
          <button className="btn" onClick={() => this.setState({ error: null })}>تلاش دوباره</button>
          <button className="btn" onClick={() => window.location.reload()}>بارگذاری مجدد صفحه</button>
        </div>
      </div>
    );
  }
}
