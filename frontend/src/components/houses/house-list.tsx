"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  houseDate,
  houseError,
  type House,
  type HouseInvite,
  type HouseSummary,
} from "@/lib/houses";
import { Button, ButtonLink, Card, ErrorState, LoadingState } from "../ui";
import { HouseForm, emptyInfo, type HouseInfo } from "./house-form";

export function HouseList() {
  const router = useRouter();
  const [houses, setHouses] = useState<HouseSummary[] | null>(null);
  const [invites, setInvites] = useState<HouseInvite[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch<HouseSummary[]>("/houses", { signal: controller.signal }),
      apiFetch<HouseInvite[]>("/houses/invites", { signal: controller.signal }),
    ])
      .then(([houses, invites]) => {
        setHouses(houses);
        setInvites(invites);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(houseError(error));
      });
    return () => controller.abort();
  }, [refresh]);

  async function create(info: HouseInfo) {
    setPending(true);
    setError("");
    try {
      const house = await apiFetch<House>("/houses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });
      router.push(`/nha-chung/${house.id}`);
    } catch (error) {
      setError(houseError(error));
    } finally {
      setPending(false);
    }
  }

  async function accept(inviteId: string) {
    setPending(true);
    setError("");
    try {
      const house = await apiFetch<House>(
        `/houses/invites/${inviteId}/accept`,
        { method: "POST" },
      );
      router.push(`/nha-chung/${house.id}`);
    } catch (error) {
      setError(houseError(error));
      setRefresh((value) => value + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="container page-section houses-page">
      <div className="house-heading">
        <div>
          <span className="eyebrow">CÙNG NHAU Ở TỐT HƠN</span>
          <h1>Nhà chung của bạn</h1>
          <p className="text-muted">
            Thông tin và thành viên chỉ hiển thị cho người trong nhà.
          </p>
        </div>
      </div>
      {error && (
        <ErrorState
          message={error}
          action={
            <Button onClick={() => setRefresh((value) => value + 1)}>
              Thử lại
            </Button>
          }
        />
      )}
      {!houses && !error && <LoadingState />}
      {houses && invites.length > 0 && (
        <Card className="house-panel">
          <h2>Lời mời vào nhà</h2>
          {houses.length > 0 && (
            <p className="text-muted">
              Hãy rời nhà hiện tại trước khi tham gia nhà khác. Nếu nhà còn
              thành viên, trưởng nhà cần chuyển quyền trước khi rời.
            </p>
          )}
          <div className="house-stack">
            {invites.map((invite) => (
              <div className="house-row" key={invite.id}>
                <div>
                  <strong>{invite.house.name}</strong>
                  <p className="text-muted">
                    Hết hạn {houseDate(invite.expiresAt)}
                  </p>
                </div>
                <Button
                  disabled={pending || houses.length > 0}
                  onClick={() => void accept(invite.id)}
                >
                  Tham gia
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {houses && (
        <div
          className={`house-grid${houses.length ? " house-grid-single" : ""}`}
        >
          <div className="house-stack">
            <h2>Nhà đang tham gia</h2>
            {houses.length === 0 && (
              <Card className="house-empty">
                <h3>Chưa có nhà chung</h3>
                <p className="text-muted">
                  Tạo nhà và mời người ở cùng. Những nhà bạn tham gia sẽ hiện ở
                  đây.
                </p>
              </Card>
            )}
            {houses.map((house) => (
              <Card key={house.id} className="house-summary">
                <span className="eyebrow">
                  {house._count.members} thành viên
                </span>
                <h3>{house.name}</h3>
                <p className="text-muted">
                  {house.address || "Chưa thêm địa chỉ"}
                </p>
                <ButtonLink href={`/nha-chung/${house.id}`} variant="secondary">
                  Vào nhà chung →
                </ButtonLink>
              </Card>
            ))}
            {houses.length > 0 && (
              <p className="text-muted">
                Bạn chỉ có thể ở một nhà chung. Rời nhà hiện tại để tạo nhà mới.
              </p>
            )}
          </div>
          {houses.length === 0 && (
            <Card className="house-panel">
              <h2>Tạo nhà chung</h2>
              <p className="text-muted">
                Bạn có thể tạo nhà trực tiếp, không cần có tin phòng trên
                Roomora.
              </p>
              <HouseForm
                value={emptyInfo}
                onSave={create}
                pending={pending}
                label="Tạo nhà"
              />
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
