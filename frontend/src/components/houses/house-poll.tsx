"use client";
import { useRef, useState, type CSSProperties } from "react";
import { post, communicationError } from "@/lib/communications";
import type { HouseMessage } from "@/lib/house-chat";
import { Button, ErrorState, Input } from "../ui";

export function HousePollForm({
  houseId,
  onSaved,
  onCancel,
}: {
  houseId: string;
  onSaved: (message: HouseMessage) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const draft = useRef<{ content: string; clientId: string } | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const body = {
      question: question.trim(),
      options: options.map((option) => option.trim()),
    };
    if (!body.question || body.options.some((option) => !option)) {
      setError("Điền câu hỏi và tất cả phương án.");
      return;
    }
    if (
      new Set(body.options.map((option) => option.toLocaleLowerCase("vi-VN")))
        .size !== options.length
    ) {
      setError("Các phương án bình chọn cần khác nhau.");
      return;
    }
    const content = JSON.stringify(body);
    if (draft.current?.content !== content)
      draft.current = { content, clientId: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const message = await post<HouseMessage>(`/houses/${houseId}/polls`, {
        ...body,
        clientId: draft.current.clientId,
      });
      onSaved(message);
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-poll-form" onSubmit={submit}>
      <h3>Tạo bình chọn</h3>
      <p>
        Mỗi thành viên chọn một phương án và có thể đổi khi bình chọn còn mở.
      </p>
      {error && <ErrorState message={error} />}
      <Input
        id="house-poll-question"
        label="Câu hỏi"
        value={question}
        maxLength={200}
        required
        disabled={pending}
        onChange={(event) => setQuestion(event.target.value)}
      />
      {options.map((option, index) => (
        <div className="house-poll-option-input" key={index}>
          <Input
            id={`house-poll-option-${index}`}
            label={`Phương án ${index + 1}`}
            value={option}
            required
            maxLength={120}
            disabled={pending}
            onChange={(event) =>
              setOptions((old) =>
                old.map((text, position) =>
                  position === index ? event.target.value : text,
                ),
              )
            }
          />
          {options.length > 2 && (
            <button
              type="button"
              className="composer-icon"
              aria-label={`Bỏ phương án ${index + 1}`}
              disabled={pending}
              onClick={() =>
                setOptions((old) =>
                  old.filter((_, position) => position !== index),
                )
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div className="house-poll-actions">
        <Button
          variant="secondary"
          disabled={pending || options.length >= 10}
          onClick={() => setOptions((old) => [...old, ""])}
        >
          Thêm phương án
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang tạo…" : "Đăng bình chọn"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

export function HousePollCard({
  houseId,
  message,
  canClose,
  onSaved,
}: {
  houseId: string;
  message: HouseMessage;
  canClose: boolean;
  onSaved: (message: HouseMessage) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const poll = message.poll!;
  async function action(
    kind: "vote" | "close",
    optionId: string | null = null,
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const updated = await post<HouseMessage>(
        `/houses/${houseId}/polls/${message.id}/${kind}`,
        kind === "vote" ? { optionId } : {},
      );
      onSaved(updated);
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="house-poll" aria-label={`Bình chọn: ${poll.question}`}>
      <small>
        Bình chọn · {poll.closedAt ? "Đã đóng" : "Chọn một phương án"}
      </small>
      <h3>{poll.question}</h3>
      <div className="house-poll-options">
        {poll.options.map((option) => {
          const percentage = poll.totalVotes
            ? Math.round((option.votes / poll.totalVotes) * 100)
            : 0;
          const selected = poll.myOptionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`house-poll-option ${selected ? "is-selected" : ""}`}
              style={{ "--poll-percentage": `${percentage}%` } as CSSProperties}
              aria-pressed={selected}
              disabled={pending || !!poll.closedAt}
              onClick={() => void action("vote", option.id)}
            >
              <span>
                {selected && "✓ "}
                {option.text}
              </span>
              <small>
                {option.votes} phiếu · {percentage}%
              </small>
            </button>
          );
        })}
      </div>
      <small>
        {poll.totalVotes} phiếu{poll.myOptionId && " · Bạn đã bình chọn"}
      </small>
      {error && <ErrorState message={error} />}
      {!poll.closedAt && (
        <div className="house-poll-actions">
          {poll.myOptionId && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void action("vote", null)}
            >
              Bỏ phiếu đã chọn
            </Button>
          )}
          {canClose && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Đóng bình chọn? Thành viên sẽ không thể đổi hoặc gửi thêm phiếu.",
                  )
                )
                  void action("close");
              }}
            >
              Đóng bình chọn
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
