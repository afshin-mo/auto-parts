import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Product } from '../lib/queries';
import { useDebounced, useOutside } from './ui';
import { Icon } from './Icon';

export function ProductPicker({ value, onChange }: { value: Product | null; onChange: (p: Product | null) => void }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
  const dq = useDebounced(q); const ref = useRef<HTMLDivElement>(null); useOutside(ref, () => setOpen(false));
  const { data } = useQuery({ queryKey: ['pp', dq], enabled: dq.length >= 1, queryFn: async () => (await api.get<Product[]>('/products', { search: dq, limit: 8, isActive: true })).data });
  if (value) return <div className="callout blue row"><span className="sku">{value.sku}</span><b className="grow">{value.name}</b><button className="btn btn--sm btn--icon" onClick={() => onChange(null)}><Icon name="x" size={14} /></button></div>;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="input" placeholder="جستجوی کالا…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoFocus />
      {open && dq && data && <div className="hits" style={{ position: 'absolute', insetInline: 0, zIndex: 30 }}>
        {data.length === 0 && <div className="muted" style={{ padding: 12 }}>کالایی پیدا نشد</div>}
        {data.map((p) => <button key={p.id} className="hit" onClick={() => { onChange(p); setOpen(false); setQ(''); }}><span className="sku">{p.sku}</span><span className="hit__name">{p.name}</span></button>)}
      </div>}
    </div>
  );
}
