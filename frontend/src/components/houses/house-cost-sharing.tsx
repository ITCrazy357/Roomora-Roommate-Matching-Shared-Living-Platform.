"use client";
import { FocusPanel } from "../focus-panel";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { categories, type ExpenseCategory } from "@/lib/household";
import {
  sharingChoiceLabels,
  sharingError,
  sharingStatusLabels,
  type SharingChoice,
  type SharingPage,
  type SharingPeriod,
} from "@/lib/cost-sharing";
import type { House } from "@/lib/houses";
import { Button, Card, ErrorState, Input, LoadingState, Select } from "../ui";
import { useHouseholdData } from "./use-household-data";
import { HouseholdEmpty, HouseholdHero, HouseholdPerson } from "./household-ui";
import { SharingProposalForm } from "./sharing-proposal-form";
import { SharingHistory } from "./sharing-history";
import { vietnamDate } from "./repayment-promise-form";

type SharingAction = (
  suffix: string,
  body: object,
  method?: string,
) => Promise<boolean>;
function PeriodCard({
  period,
  houseId,
  userId,
  owner,
  pending,
  action,
  reload,
}: {
  period: SharingPeriod;
  houseId: string;
  userId: string;
  owner: boolean;
  pending: boolean;
  action: SharingAction;
  reload: () => void;
}) {
  const round = period.rounds[0],
    vote = round.votes.find((row) => row.userId === userId);
  const [proposal, setProposal] = useState(false),
    [history, setHistory] = useState(false),
    [reopen, setReopen] = useState(false),
    [deadline, setDeadline] = useState(`${vietnamDate()}T23:59`);
  const active =
    period.status === "OPEN" &&
    !period.membershipChanged &&
    new Date(period.deadlineAt) > new Date();
  const canPropose =
    active &&
    (round.phase === "PREFERENCE"
      ? round.votes.some((row) => row.choice === "WEIGHTED")
      : round.status === "REJECTED");
  const choices: SharingChoice[] =
    round.phase === "PREFERENCE" ? ["EQUAL", "WEIGHTED"] : ["AGREE", "REJECT"];
  const agreed = !!period.resultMode && !period.membershipChanged;
  const shares = period.resultShares ?? round.shares;
  const mode = period.resultMode ?? round.mode;
  const cast = (choice: SharingChoice) =>
    void action(`periods/${period.id}/votes`, {
      roundId: round.id,
      version: vote?.version ?? 0,
      choice,
    });
  return (
    <Card
      className="house-panel sharing-period"
      data-sharing-period={period.id}
    >
      <div className="household-section-heading">
        <div>
          <span className="eyebrow">
            {period.kind === "DEFAULT"
              ? "PHƯƠNG ÁN DỰ PHÒNG"
              : `KỲ ${period.month.split("-").reverse().join("/")}`}{" "}
            · {categories[period.category]}
          </span>
          <h2>
            {period.kind === "DEFAULT"
              ? "Thống nhất mặc định"
              : "Cách chia chi phí tháng"}
          </h2>
        </div>
        <span
          className={`household-status household-tone-${agreed ? "success" : "warning"}`}
        >
          {period.membershipChanged
            ? "Thành viên đã thay đổi"
            : (sharingStatusLabels[period.status] ?? period.status)}
        </span>
      </div>
      <p className="text-muted">
        Hạn:{" "}
        {new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(new Date(period.deadlineAt))}{" "}
        (UTC+7) · Vòng {round.number}
      </p>
      {agreed ? (
        <p className="sharing-result">
          {mode === "EQUAL"
            ? "Đã thống nhất chia đều"
            : "Đã thống nhất chia theo tỷ lệ"}
          {period.status === "FALLBACK"
            ? " · Dùng dự phòng đã đồng ý trước kỳ này"
            : ""}
        </p>
      ) : period.membershipChanged ? (
        <p className="finance-note">
          Danh sách thành viên đã đổi. Trưởng nhà cần mở vòng mới; phiếu cũ
          không tính cho vòng mới.
        </p>
      ) : round.phase === "PREFERENCE" ? (
        <p>
          Cả nhà chọn cách chia. Nếu có người chọn theo tỷ lệ, hãy gửi đề xuất
          cụ thể để mọi người cùng xem và đồng ý.
        </p>
      ) : (
        <div className="household-report-note household-tone-info">
          <p>
            <strong>Lý do đề xuất:</strong> {round.reason}
          </p>
        </div>
      )}
      <div className="sharing-voters">
        {round.members.map((member) => {
          const memberVote = round.votes.find(
              (row) => row.userId === member.userId,
            ),
            ratio = shares?.find(
              (row) => row.participantId === member.participantId,
            );
          return (
            <div className="sharing-voter" key={member.userId}>
              <HouseholdPerson
                name={member.displayName}
                avatarUrl={member.avatarUrl}
              />
              <div>
                {mode === "WEIGHTED" && ratio && (
                  <strong>{ratio.basisPoints / 100}%</strong>
                )}
                <span
                  className={`household-status household-tone-${memberVote?.choice === "AGREE" || memberVote?.choice === "EQUAL" ? "success" : memberVote?.choice === "REJECT" ? "danger" : "neutral"}`}
                >
                  {memberVote
                    ? sharingChoiceLabels[memberVote.choice]
                    : "Chưa bình chọn"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {active && round.status !== "REJECTED" && (
        <div className="finance-actions sharing-vote-actions">
          {choices.map((choice) => (
            <Button
              key={choice}
              variant={vote?.choice === choice ? "primary" : "secondary"}
              aria-pressed={vote?.choice === choice}
              disabled={pending}
              onClick={() => cast(choice)}
            >
              {sharingChoiceLabels[choice]}
            </Button>
          ))}
          <small className="text-muted">
            {vote
              ? "Bạn có thể đổi lựa chọn khi vòng còn mở."
              : "Mỗi thành viên có một phiếu hiện hành trong vòng này."}
          </small>
        </div>
      )}
      {round.status === "REJECTED" && !agreed && (
        <p className="finance-note">
          Có người từ chối đề xuất này. Điều chỉnh tỷ lệ/lý do và mở đề xuất mới
          để bình chọn lại.
        </p>
      )}
      {canPropose && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => setProposal((value) => !value)}
        >
          {round.status === "REJECTED" ? "Điều chỉnh đề xuất" : "Đề xuất tỷ lệ"}
        </Button>
      )}
      {proposal && canPropose && (
        <FocusPanel
          className="sharing-form-panel"
          label="Đề xuất tỷ lệ chia chi phí"
        >
          <SharingProposalForm
            key={round.id}
            houseId={houseId}
            period={period}
            onCancel={() => setProposal(false)}
            onSaved={() => {
              setProposal(false);
              reload();
            }}
          />
        </FocusPanel>
      )}
      {period.kind === "MONTHLY" && !agreed && (
        <p className="sharing-fallback-note">
          {period.fallbackSnapshot
            ? "Nếu hết hạn, chỉ dùng dự phòng đã thống nhất khi danh sách thành viên vẫn phù hợp."
            : "Chưa có phương án dự phòng được thống nhất trước kỳ này. Hết hạn sẽ giữ trạng thái chưa thống nhất."}
        </p>
      )}
      {owner && (!period.resultMode || period.membershipChanged) && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => setReopen((value) => !value)}
        >
          Mở vòng mới / gia hạn
        </Button>
      )}
      {reopen && owner && (
        <FocusPanel label="Mở vòng bình chọn mới / gia hạn">
          <form
            className="house-form sharing-form-panel"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await action(`periods/${period.id}/reopen`, {
                  roundId: round.id,
                  deadlineAt: new Date(`${deadline}:00+07:00`).toISOString(),
                })
              )
                setReopen(false);
            }}
          >
            <Input
              id={`sharing-deadline-${period.id}`}
              label="Hạn mới (giờ Việt Nam)"
              type="datetime-local"
              required
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
            <p className="text-muted">
              Vòng mới cần mọi thành viên bỏ phiếu lại. Chỉ đặt hạn trong tháng
              của kỳ đang xét.
            </p>
            <Button type="submit" disabled={pending}>
              Mở lại bình chọn
            </Button>
          </form>
        </FocusPanel>
      )}
      <details
        className="sharing-history-toggle"
        onToggle={(event) => setHistory(event.currentTarget.open)}
      >
        <summary>Lịch sử bình chọn và đề xuất</summary>
        {history && <SharingHistory houseId={houseId} periodId={period.id} />}
      </details>
    </Card>
  );
}

export function HouseCostSharing({
  house,
  userId,
}: {
  house: House;
  userId: string;
}) {
  const [month, setMonth] = useState(vietnamDate().slice(0, 7)),
    [category, setCategory] = useState<ExpenseCategory>("ELECTRICITY"),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const path = `/houses/${house.id}/cost-sharing`;
  const {
    data,
    error: loadError,
    reload,
  } = useHouseholdData<SharingPage>(`${path}?month=${month}`);
  const owner = house.ownerId === userId;
  async function action(suffix: string, body: object, method = "POST") {
    if (pending) return false;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`${path}/${suffix}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice("Đã lưu. Kết quả chỉ thông qua khi cả nhà đồng ý.");
      reload();
      return true;
    } catch (error) {
      setError(sharingError(error));
      return false;
    } finally {
      setPending(false);
    }
  }
  const selected = data?.settings.find((row) => row.category === category);
  const monthly =
      data?.periods.filter(
        (row) => row.kind === "MONTHLY" && row.category === category,
      ) ?? [],
    defaults =
      data?.periods.filter(
        (row) => row.kind === "DEFAULT" && row.category === category,
      ) ?? [];
  return (
    <div className="house-stack household-screen">
      <HouseholdHero
        title="Thống nhất cách chia"
        icon="people"
        description="Cả nhà cùng quyết định chi phí mỗi tháng. Tỷ lệ chỉ được áp dụng khi tất cả thành viên đồng ý cùng một phương án."
      >
        <div className="household-report-controls">
          <Input
            id="sharing-month"
            label="Tháng"
            type="month"
            min="2000-01"
            max="2100-12"
            required
            value={month}
            onChange={(event) => {
              if (event.target.value) setMonth(event.target.value);
            }}
          />
          <Select
            id="sharing-category"
            label="Danh mục chi phí"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as ExpenseCategory)
            }
          >
            {Object.entries(categories).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </HouseholdHero>
      {error && <ErrorState message={error} />}{" "}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}{" "}
      {loadError && (
        <ErrorState
          message={loadError}
          action={<Button onClick={reload}>Tải lại</Button>}
        />
      )}{" "}
      {!data && !loadError && <LoadingState />}
      {data && (
        <>
          <Card className="house-panel">
            <div className="household-section-heading">
              <div>
                <h3>Bình chọn hằng tháng · {categories[category]}</h3>
                <p className="text-muted">
                  Mặc định hết hạn cuối ngày 7 (UTC+7). Mỗi danh mục được thống
                  nhất riêng.
                </p>
              </div>
              {owner && (
                <Button
                  variant={selected?.enabled ? "secondary" : "primary"}
                  disabled={pending}
                  onClick={() =>
                    void action(
                      `settings/${category}`,
                      { enabled: !selected?.enabled, deadlineDay: 7 },
                      "PUT",
                    )
                  }
                >
                  {selected?.enabled
                    ? "Tắt tự mở kỳ mới"
                    : "Bật bình chọn hằng tháng"}
                </Button>
              )}
            </div>
            <p className="text-muted">
              {selected?.enabled
                ? "Danh mục này tự mở kỳ bình chọn đầu mỗi tháng."
                : "Danh mục này chưa bật tự mở kỳ mới."}{" "}
              Việc tắt không thay đổi kỳ đã mở hoặc khoản đã ghi.
            </p>
            {!owner && (
              <p className="text-muted">
                Trưởng nhà bật danh mục; mọi thành viên đều có quyền bỏ phiếu và
                gửi đề xuất.
              </p>
            )}
          </Card>
          {monthly.length === 0 && (
            <Card className="house-panel">
              <HouseholdEmpty
                icon="calendar"
                title="Chưa có kỳ bình chọn tháng này"
                description="Chọn danh mục đã bật hoặc nhờ trưởng nhà bật bình chọn. Kỳ mới được mở tự động vào đầu tháng."
              />
            </Card>
          )}
          {monthly.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              houseId={house.id}
              userId={userId}
              owner={owner}
              pending={pending}
              action={action}
              reload={reload}
            />
          ))}
          <div className="household-section-heading">
            <div>
              <h3>Phương án dự phòng · {categories[category]}</h3>
              <p className="text-muted">
                Cần cả nhà đồng ý trước khi mở kỳ tháng muốn dùng dự phòng.
              </p>
            </div>
            {owner && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  void action("defaults", {
                    category,
                    deadlineAt: new Date(
                      Date.now() + 3 * 86400000,
                    ).toISOString(),
                  })
                }
              >
                Thống nhất phương án dự phòng
              </Button>
            )}
          </div>
          {defaults.length === 0 && (
            <p className="household-help">
              Chưa có phương án dự phòng. Roomora giữ trạng thái chưa thống nhất
              khi hết hạn, không mặc nhiên chia đều.
            </p>
          )}
          {defaults.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              houseId={house.id}
              userId={userId}
              owner={owner}
              pending={pending}
              action={action}
              reload={reload}
            />
          ))}
        </>
      )}
    </div>
  );
}
