import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';
import { Icon } from './Icon';

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o?: { formats?: string[] }) => Detector;
const getCtor = (): DetectorCtor | undefined => (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

/** آیا مرورگر اسکن بارکد با دوربین را پشتیبانی می‌کند؟ (کروم اندروید، سافاری جدید؛ نیازمند HTTPS) */
export const canScan = () => typeof window !== 'undefined' && !!getCtor() && !!navigator.mediaDevices?.getUserMedia;

export function ScanButton({ onCode, className }: { onCode: (code: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!canScan()) return null;
  return (
    <>
      <button type="button" className={`btn btn--icon ${className ?? ''}`} title="اسکن بارکد با دوربین" aria-label="اسکن بارکد" onClick={() => setOpen(true)}><Icon name="scan" size={18} /></button>
      {open && <BarcodeScanner onClose={() => setOpen(false)} onCode={(c) => { setOpen(false); onCode(c); }} />}
    </>
  );
}

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let stop = false; let stream: MediaStream | null = null; let timer = 0;
    (async () => {
      try {
        const Ctor = getCtor();
        if (!Ctor) throw new Error('unsupported');
        const det = new Ctor();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (stop || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const found = await det.detect(video.current);
            if (found[0]?.rawValue) { navigator.vibrate?.(60); onCode(found[0].rawValue); return; }
          } catch { /* فریم نامعتبر؛ ادامه */ }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch {
        setErr('دسترسی به دوربین ممکن نشد. اجازه‌ی دوربین را بدهید و مطمئن شوید آدرس با https باز شده است.');
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return (
    <Modal size="sm" title="اسکن بارکد" onClose={onClose}>
      {err ? <div className="callout red">{err}</div> : <>
        <video ref={video} playsInline muted style={{ width: '100%', background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} />
        <p className="muted sm" style={{ margin: '8px 0 0' }}>بارکد را داخل کادر نگه دارید…</p>
      </>}
    </Modal>
  );
}
