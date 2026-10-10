"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { sharingError, type SharingPeriod } from "@/lib/cost-sharing";
import { Button, ErrorState, Input, Textarea } from "../ui";
import { HouseholdPerson } from "./household-ui";

export function SharingProposalForm({
  houseId,
  period,
  onSaved,
  onCancel,
}: {
  houseId: string;
  period: SharingPeriod;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const round = period.rounds[0],
    members = round.members;
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      members.map((member, index) => [
        member.participantId,
        String(
          (round.shares?.find(
            (row) => row.participantId === member.participantId,
          )?.basisPoints ??
            Math.floor(10000 / members.length) +
              (index < 10000 % members.length ? 1 : 0)) / 100,
        ),
      ]),
    ),
  );
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [representatives, setRepresentatives] = useState(
    members.map((member) => member.participantId),
  );
  const basisPoints = members.map((member) => ({
    participantId: member.participantId,
    basisPoints: Math.round(Number(values[member.participantId]) * 100),
  }));
  const total = basisPoints.reduce((sum, row) => sum + row.basisPoints, 0);
  function distribute() {
    const count = representatives.length;
    if (!count) return;
    setValues(
      Object.fromEntries(
        members.map((member) => {
          const index = representatives.indexOf(member.participantId);
          const value =
            index < 0
              ? 0
              : Math.floor(10000 / count) + (index < 10000 % count ? 1 : 0);
          return [member.participantId, String(value / 100)];
        }),
      ),
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (
      total !== 10000 ||
      basisPoints.some(
        (row) => row.basisPoints < 0 || !Number.isFinite(row.basisPoints),
      )
    ) {
      setError("Tổng tỷ lệ phải đúng 100%, không âm.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await apiFetch(
        `/houses/${houseId}/cost-sharing/periods/${period.id}/proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roundId: round.id,
            mode: "WEIGHTED",
            shares: basisPoints,
            reason: reason.trim(),
          }),
        },
      );
      onSaved();
    } catch (error) {
      setError(sharingError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-form" onSubmit={submit}>
      <h3>Đề xuất tỷ lệ cho cả nhà</h3>
      <p className="text-muted">
        Mỗi đề xuất tạo vòng mới; tất cả thành viên cần bỏ phiếu lại. Người
        không chịu khoản này có thể đặt 0%.
      </p>
      {error && <ErrorState message={error} />}
      <fieldset disabled={pending} className="sharing-proposal-fields">
        <div className="sharing-calculator">
          <strong>Chọn người đại diện để tính nhanh</strong>
          <p className="text-muted">
            Chia 100% cho những người được chọn; các người còn lại nhận 0%. Tất
            cả thành viên vẫn phải đồng ý đề xuất.
          </p>
          <div className="sharing-representatives">
            {members.map((member) => (
              <label key={member.userId}>
                <input
                  type="checkbox"
                  checked={representatives.includes(member.participantId)}
                  onChange={(event) =>
                    setRepresentatives((old) =>
                      event.target.checked
                        ? [...old, member.participantId]
                        : old.filter((id) => id !== member.participantId),
                    )
                  }
                />
                {member.displayName}
              </label>
            ))}
          </div>
          <Button
            variant="secondary"
            disabled={!representatives.length}
            onClick={distribute}
          >
            Chia nhanh cho {representatives.length} người
          </Button>
        </div>
        {members.map((member) => (
          <div className="sharing-proposal-member" key={member.userId}>
            <HouseholdPerson
              name={member.displayName}
              avatarUrl={member.avatarUrl}
            />
            <Input
              id={`ratio-${member.userId}`}
              label="Tỷ lệ (%)"
              type="number"
              min={0}
              max={100}
              step={0.01}
              required
              value={values[member.participantId]}
              onChange={(event) =>
                setValues((old) => ({
                  ...old,
                  [member.participantId]: event.target.value,
                }))
              }
            />
          </div>
        ))}
        <p
          className={
            total === 10000 ? "text-success-foreground" : "text-danger"
          }
        >
          Tổng tỷ lệ: {(total / 100).toLocaleString("vi-VN")}% / 100%
        </p>
        <Textarea
          id="sharing-reason"
          label="Lý do đề xuất"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </fieldset>
      <div className="finance-actions">
        <Button type="submit" disabled={pending || total !== 10000}>
          {pending ? "Đang gửi…" : "Gửi đề xuất mới"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
