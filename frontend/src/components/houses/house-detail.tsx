"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import {
  houseDate,
  houseError,
  type House,
  type HouseInviteCandidate,
} from "@/lib/houses";
import {
  Button,
  ButtonLink,
  Card,
  ErrorState,
  LoadingState,
  Select,
  Textarea,
} from "../ui";
import { HouseForm } from "./house-form";

export function HouseDetail({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const [house, setHouse] = useState<House | null>(null);
  const [tab, setTab] = useState<"overview" | "members" | "info">("overview");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [candidates, setCandidates] = useState<HouseInviteCandidate[] | null>(
    null,
  );
  const [candidatesError, setCandidatesError] = useState("");
  const [candidatesRefresh, setCandidatesRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [pinned, setPinned] = useState(false);
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<House>(`/houses/${id}`, { signal: controller.signal })
      .then((data) => {
        setHouse(data);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(houseError(error));
      });
    return () => controller.abort();
  }, [id, refresh]);

  useEffect(() => {
    if (tab !== "members" || house?.ownerId !== userId) return;
    const controller = new AbortController();
    apiFetch<HouseInviteCandidate[]>(`/houses/${id}/invite-candidates`, {
      signal: controller.signal,
    })
      .then((people) => {
        setCandidates(people);
        setCandidatesError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCandidates(null);
          setCandidatesError(houseError(error));
        }
      });
    return () => controller.abort();
  }, [id, tab, house?.ownerId, userId, candidatesRefresh]);

  async function change(path: string, method: string, body?: object) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const data = await apiFetch<House>(`/houses/${id}${path}`, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      setHouse(data);
      setNotice("Đã cập nhật nhà chung.");
      return true;
    } catch (error) {
      setError(houseError(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    const closing = house?.ownerId === userId && house.members.length === 1;
    if (
      !window.confirm(
        closing
          ? "Bạn là người cuối cùng trong nhà. Nhà sẽ được lưu trữ và các lời mời đang chờ bị thu hồi. Tiếp tục?"
          : "Bạn sẽ mất quyền xem thông tin nhà sau khi rời. Tiếp tục?",
      )
    )
      return;
    setPending(true);
    try {
      await apiFetch(`/houses/${id}/leave`, { method: "POST" });
      router.push("/nha-chung");
    } catch (error) {
      setError(houseError(error));
    } finally {
      setPending(false);
    }
  }

  if (!house)
    return (
      <section className="container page-section houses-page">
        <ButtonLink href="/nha-chung" variant="secondary">
          ← Nhà chung
        </ButtonLink>
        {error ? (
          <ErrorState
            message={error}
            action={
              <Button onClick={() => setRefresh((value) => value + 1)}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <LoadingState />
        )}
      </section>
    );
  const owner = house.ownerId === userId;
  const ownerName =
    house.members.find((member) => member.userId === house.ownerId)
      ?.displayName ?? "Trưởng nhà";
  return (
    <section className="container page-section houses-page">
      <Link className="text-link" href="/nha-chung">
        ← Tất cả nhà chung
      </Link>
      <Card className="house-hero">
        <span className="eyebrow">
          NHÀ CHUNG · {house.members.length} THÀNH VIÊN
        </span>
        <h1>{house.name}</h1>
        <p>{house.address || "Chưa thêm địa chỉ"}</p>
        <p className="text-muted">
          Trưởng nhà: {ownerName} · Tạo ngày {houseDate(house.createdAt)}
        </p>
      </Card>
      <nav className="house-tabs" aria-label="Quản lý nhà chung">
        {(
          [
            ["overview", "Tổng quan"],
            ["members", "Thành viên"],
            ["info", "Thông tin nhà"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "secondary"}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {tab === "overview" && (
        <div className="house-grid">
          <div className="house-stack">
            <Card className="house-panel">
              <span className="eyebrow">TỔNG QUAN</span>
              <h2>{house.name}</h2>
              <p>{house.description || "Nhà chưa có giới thiệu."}</p>
              {owner && (
                <button className="text-link" onClick={() => setTab("info")}>
                  Chỉnh sửa thông tin nhà →
                </button>
              )}
              <div className="house-stats">
                <div>
                  <strong>{house.members.length}</strong>
                  <span>Thành viên</span>
                </div>
                <div>
                  <strong>{house.announcements.length}</strong>
                  <span>Thông báo gần đây</span>
                </div>
              </div>
            </Card>
            <Card className="house-panel">
              <h2>Thông báo chung</h2>
              {house.announcements.length === 0 && (
                <p className="text-muted">Chưa có thông báo nào.</p>
              )}
              {house.announcements.map((item) => (
                <article className="house-announcement" key={item.id}>
                  <div className="house-row">
                    <strong>
                      {item.pinned ? "📌 " : ""}
                      {item.authorName}
                    </strong>
                    <small>{houseDate(item.createdAt)}</small>
                  </div>
                  <p>{item.text}</p>
                  {(owner || item.authorId === userId) && (
                    <button
                      className="text-link"
                      disabled={pending}
                      onClick={() =>
                        void change(`/announcements/${item.id}`, "DELETE")
                      }
                    >
                      Xóa thông báo
                    </button>
                  )}
                </article>
              ))}
            </Card>
          </div>
          <div className="house-stack">
            <Card className="house-panel">
              <h2>Đăng thông báo</h2>
              <form
                className="house-form"
                onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  if (
                    await change("/announcements", "POST", {
                      text: message,
                      pinned,
                    })
                  ) {
                    setMessage("");
                    setPinned(false);
                  }
                }}
              >
                <Textarea
                  id="house-message"
                  label="Nội dung"
                  value={message}
                  required
                  maxLength={2000}
                  rows={5}
                  onChange={(event) => setMessage(event.target.value)}
                />
                {owner && (
                  <label className="house-check">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(event) => setPinned(event.target.checked)}
                    />{" "}
                    Ghim thông báo
                  </label>
                )}
                <Button type="submit" disabled={pending}>
                  Đăng thông báo
                </Button>
              </form>
            </Card>
            <Card className="house-panel">
              <h2>Nội quy</h2>
              <p className="house-preline">
                {house.rules || "Trưởng nhà chưa thêm nội quy."}
              </p>
            </Card>
          </div>
        </div>
      )}
      {tab === "members" && (
        <div className="house-grid">
          <div className="house-stack">
            <Card className="house-panel">
              <h2>Thành viên hiện tại</h2>
              {house.members.map((member) => (
                <div className="house-row house-member" key={member.userId}>
                  <span className="house-avatar">
                    {member.avatarUrl ? (
                      <Image
                        src={member.avatarUrl}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized
                      />
                    ) : (
                      member.displayName.charAt(0)
                    )}
                  </span>
                  <div>
                    <strong>{member.displayName}</strong>
                    <p className="text-muted">
                      {member.userId === house.ownerId
                        ? "Trưởng nhà"
                        : "Thành viên"}{" "}
                      · Tham gia {houseDate(member.joinedAt)}
                    </p>
                  </div>
                  <Link className="text-link" href={`/ho-so/${member.userId}`}>
                    Xem hồ sơ
                  </Link>
                </div>
              ))}
            </Card>
            <Card className="house-panel">
              <h2>Lịch sử thành viên</h2>
              {house.events.map((item) => (
                <div className="house-row house-history" key={item.id}>
                  <span>
                    {item.displayName}:{" "}
                    {(
                      {
                        CREATED: "tạo nhà",
                        INVITED: "được mời",
                        JOINED: "tham gia",
                        LEFT: "rời nhà",
                        OWNER_TRANSFERRED: "nhận quyền trưởng nhà",
                        INVITE_REVOKED: "lời mời được thu hồi",
                      } as Record<string, string>
                    )[item.type] ?? item.type}
                  </span>
                  <small>{houseDate(item.createdAt)}</small>
                </div>
              ))}
            </Card>
          </div>
          <div className="house-stack">
            {owner && (
              <>
                <Card className="house-panel">
                  <h2>Mời thành viên</h2>
                  <p className="text-muted">
                    Chọn người đã kết nối. Lời mời được gửi đến email đăng ký và
                    hết hạn sau 7 ngày.
                  </p>
                  {candidatesError && (
                    <p className="text-danger" role="alert">
                      {candidatesError}
                    </p>
                  )}
                  {!candidates && !candidatesError && <LoadingState />}
                  {candidates?.length === 0 && (
                    <p className="text-muted">
                      Bạn chưa kết nối với ai. Hãy{" "}
                      <Link className="text-link" href="/tim-nguoi-o-ghep">
                        tìm người ở ghép
                      </Link>{" "}
                      và kết nối trước khi mời.
                    </p>
                  )}
                  {candidates?.map((person) => (
                    <div
                      className="house-row house-invite-row"
                      key={person.userId}
                    >
                      <span className="house-avatar">
                        {person.avatarUrl ? (
                          <Image
                            src={person.avatarUrl}
                            alt=""
                            width={44}
                            height={44}
                            unoptimized
                          />
                        ) : (
                          person.displayName.charAt(0)
                        )}
                      </span>
                      <div className="house-invite-person">
                        <strong>{person.displayName}</strong>
                        {person.status !== "AVAILABLE" && (
                          <small>
                            {person.status === "INVITED"
                              ? "Đã gửi lời mời"
                              : "Đã ở trong nhà"}
                          </small>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        disabled={pending || person.status !== "AVAILABLE"}
                        onClick={async () => {
                          if (
                            await change("/invites", "POST", {
                              userId: person.userId,
                            })
                          ) {
                            setNotice(`Đã mời ${person.displayName} vào nhà.`);
                            setCandidatesRefresh((value) => value + 1);
                          }
                        }}
                      >
                        Mời
                      </Button>
                    </div>
                  ))}
                  {house.invites.length > 0 && (
                    <p className="house-invite-label">Lời mời đang chờ</p>
                  )}
                  {house.invites.map((invite) => (
                    <div className="house-row" key={invite.id}>
                      <span>{invite.label}</span>
                      <button
                        className="text-link"
                        disabled={pending}
                        onClick={async () => {
                          if (await change(`/invites/${invite.id}`, "DELETE"))
                            setCandidatesRefresh((value) => value + 1);
                        }}
                      >
                        Thu hồi
                      </button>
                    </div>
                  ))}
                </Card>
                {house.members.length > 1 && (
                  <Card className="house-panel">
                    <h2>Chuyển quyền trưởng nhà</h2>
                    <p className="text-muted">
                      Chỉ chuyển cho thành viên hiện tại.
                    </p>
                    <Select
                      id="house-transfer"
                      label="Thành viên"
                      value={targetId}
                      onChange={(event) => setTargetId(event.target.value)}
                    >
                      <option value="">Chọn người nhận quyền</option>
                      {house.members
                        .filter((member) => member.userId !== userId)
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.displayName}
                          </option>
                        ))}
                    </Select>
                    <Button
                      disabled={!targetId || pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Chuyển quyền trưởng nhà cho thành viên này?",
                          )
                        )
                          void change("/transfer", "POST", {
                            userId: targetId,
                          });
                      }}
                    >
                      Chuyển quyền
                    </Button>
                  </Card>
                )}
                {house.members.length === 1 && (
                  <Card className="house-panel">
                    <h2>Rời nhà chung</h2>
                    <p className="text-muted">
                      Bạn là người cuối cùng. Nhà sẽ được lưu trữ, lời mời đang
                      chờ bị thu hồi và bạn có thể tạo nhà mới.
                    </p>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => void leave()}
                    >
                      Rời và lưu trữ nhà
                    </Button>
                  </Card>
                )}
              </>
            )}
            {!owner && (
              <Card className="house-panel">
                <h2>Rời nhà chung</h2>
                <p className="text-muted">
                  Lịch sử tham gia được giữ lại. Bạn sẽ không còn xem được nội
                  dung nhà.
                </p>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void leave()}
                >
                  Rời nhà
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === "info" && (
        <div className="house-grid">
          <Card className="house-panel">
            <h2>{owner ? "Chỉnh sửa thông tin nhà" : "Thông tin nhà"}</h2>
            {owner ? (
              <HouseForm
                key={house.updatedAt}
                value={house}
                onSave={async (info) => {
                  await change("", "PUT", info);
                }}
                pending={pending}
                label="Lưu thông tin"
              />
            ) : (
              <>
                <p>
                  <strong>Địa chỉ:</strong> {house.address || "Chưa cập nhật"}
                </p>
                <p className="house-preline">
                  <strong>Giới thiệu:</strong>{" "}
                  {house.description || "Chưa cập nhật"}
                </p>
                <p className="house-preline">
                  <strong>Nội quy:</strong> {house.rules || "Chưa cập nhật"}
                </p>
              </>
            )}
          </Card>
          <Card className="house-panel">
            <h2>Quyền trong nhà</h2>
            <p>
              Trưởng nhà mời thành viên, quản lý thông tin, nội quy và chuyển
              quyền. Mọi thành viên có thể đăng thông báo chung.
            </p>
            <p className="text-muted">
              Dữ liệu nhà chỉ được trả về cho thành viên đang tham gia.
            </p>
          </Card>
        </div>
      )}
    </section>
  );
}
