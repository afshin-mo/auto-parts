import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Modal, Field, NumInput, Loading, useUi } from './ui';
import { fmtMoney, toFa } from '../lib/format';

interface Preview { recipients: { id: string; name: string; receptor: string; balance: number }[]; skipped: string[]; sample: string | null }

/** یادآوری پیامکی بدهی مشتریان */
export function RemindModal({ onClose }: { onClose: () => void }) {
  const { toast } = useUi(); const qc = useQueryClient();
  const [min, setMin] = useState<number | ''>(1_000_000); const [err, setErr] = useState('');
  const pv = useQuery({ queryKey: ['remind-preview', min], queryFn: async () => (await api.post<Preview>('/sms/remind', { minBalance: Number(min || 1), dryRun: true })).data });
  const send = useMutation({
    mutationFn: async () => (await api.post<{ sent: number; failed: { name: string; reason: string }[] }>('/sms/remind', { minBalance: Number(min || 1) })).data,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['sms-logs'] }); toast(`${toFa(r.sent)} پیامک ارسال شد${r.failed.length ? ` | ${toFa(r.failed.length)} ناموفق` : ''}`, r.failed.length ? 'error' : 'ok'); onClose(); },
    onError: (e: ApiError) => setErr(e.message),
  });
  return (
    <Modal size="lg" title="یادآوری بدهی با پیامک" onClose={onClose}
      footer={<><button className="btn btn--primary" disabled={!pv.data?.recipients.length || send.isPending} onClick={() => { setErr(''); send.mutate(); }}>{send.isPending ? 'در حال ارسال…' : `ارسال به ${toFa(pv.data?.recipients.length ?? 0)} نفر`}</button><button className="btn" onClick={onClose}>انصراف</button></>}>
      <div className="stack">
        <Field label="حداقل مانده بدهی (ریال)"><NumInput money value={min} onChange={setMin} /></Field>
        {!pv.data ? <Loading /> : <>
          {pv.data.sample && <div className="callout blue sm"><b>نمونه‌ی متن:</b><div style={{ marginTop: 4 }}>{pv.data.sample}</div></div>}
          {pv.data.skipped.length > 0 && <div className="callout sm">بدون شماره موبایل (ارسال نمی‌شود): {pv.data.skipped.join('، ')}</div>}
          <div className="tbl-wrap" style={{ maxHeight: 260, overflow: 'auto', border: '2px solid var(--line)' }}><table className="tbl"><thead><tr><th>مشتری</th><th>موبایل</th><th className="n">مانده</th></tr></thead>
            <tbody>{pv.data.recipients.map((r) => <tr key={r.id}><td className="strong">{r.name}</td><td className="ltr">{r.receptor}</td><td className="n t-neg">{fmtMoney(r.balance)}</td></tr>)}
              {!pv.data.recipients.length && <tr><td colSpan={3} className="muted">مشتری‌ای با این شرط پیدا نشد</td></tr>}</tbody></table></div>
        </>}
        {err && <div className="callout red">{err}</div>}
      </div>
    </Modal>
  );
}
