"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { houseDate, houseError, type House, type HouseInvite, type HouseSummary } from '@/lib/houses';
import { Button, ButtonLink, Card, ErrorState, LoadingState } from '../ui';
import { HouseForm, emptyInfo, type HouseInfo } from './house-form';
import { RoomoraFigure } from '../roomora-figure';
import { IdentityNotice } from '../identity/identity-notice';

export function HouseList() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [invites, setInvites] = useState<HouseInvite[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const houses = await apiFetch<HouseSummary[]>('/houses', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (houses[0]) { router.replace(`/nha-chung/${houses[0].id}`); return; }
        const invites = await apiFetch<HouseInvite[]>('/houses/invites', { signal: controller.signal });
        if (!controller.signal.aborted) { setInvites(invites); setLoaded(true); setError(''); }
      } catch (error) { if (!controller.signal.aborted) setError(houseError(error)); }
    }
    void load(); return () => controller.abort();
  }, [refresh, router]);
  async function enter(path: string, info?: HouseInfo) {
    if (pending) return;
    setPending(true); setError('');
    try {
      const house = await apiFetch<House>(path, { method: 'POST', ...(info ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info) } : {}) });
      router.replace(`/nha-chung/${house.id}`);
    } catch (error) { setError(houseError(error)); setRefresh((value) => value + 1); }
    finally { setPending(false); }
  }
  return <section className="container page-section houses-page">
    <div className="house-heading"><div><h1>Nhà chung của bạn</h1><p className="text-muted">Mỗi người chỉ tham gia một nhà. Rời nhà hiện tại trước khi chuyển sang nhà khác.</p></div><ButtonLink href="/nha-chung/lich-su" variant="secondary">Lịch sử công nợ</ButtonLink></div>
    {loaded && <IdentityNotice />}
    {error && <ErrorState message={error} action={<Button onClick={() => setRefresh((value) => value + 1)}>Thử lại</Button>} />}
    {!loaded && !error && <LoadingState message="Đang mở nhà chung…" />}
    {loaded && <div className="house-grid"><div className="house-stack"><Card className="house-empty"><RoomoraFigure kind="people" className="empty-figure" /><h2>Chưa có nhà chung</h2><p className="text-muted">Nhận lời mời hoặc tạo nhà để quản lý sinh hoạt, chat và chia chi phí với người ở cùng.</p></Card>
      {invites.length > 0 && <Card className="house-panel"><h2>Lời mời vào nhà</h2>{invites.map((invite) => <div className="house-row" key={invite.id}><div><strong>{invite.house.name}</strong><p className="text-muted">Hết hạn {houseDate(invite.expiresAt)}</p></div><Button disabled={pending} onClick={() => void enter(`/houses/invites/${invite.id}/accept`)}>Tham gia</Button></div>)}</Card>}
    </div><Card className="house-panel"><h2>Tạo nhà chung</h2><p className="text-muted">Bạn có thể tạo nhà trực tiếp, không cần có tin phòng trên Roomora.</p><HouseForm value={emptyInfo} onSave={(info) => enter('/houses', info)} pending={pending} label="Tạo nhà" /></Card></div>}
  </section>;
}
