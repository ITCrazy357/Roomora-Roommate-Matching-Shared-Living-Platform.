"use client";
import { useState } from "react";
import { FocusPanel } from "../focus-panel";
import { apiFetch } from "@/lib/api";
import { communicationError, type Message } from "@/lib/communications";
import { Button, Textarea } from "../ui";

export function MessageActions({
  conversationId,
  message,
  onChange,
  messagePath,
  deletePrompt = "Xóa tin nhắn này cho cả hai người? Ảnh, ghi âm và tệp trong tin cũng sẽ bị xóa.",
}: {
  conversationId: string;
  message: Message;
  onChange: (message: Message) => void;
  messagePath?: string;
  deletePrompt?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [version, setVersion] = useState(message.version);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(remove: boolean) {
    if (pending) return;
    if (remove && !window.confirm(deletePrompt)) return;
    setPending(true);
    setError("");
    try {
      const saved = await apiFetch<Message>(
        `${messagePath ?? `/conversations/${conversationId}/messages`}/${message.id}`,
        {
          method: remove ? "DELETE" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            remove
              ? { version: message.version }
              : { version, text: text.trim() },
          ),
        },
      );
      onChange(saved);
      setEditing(false);
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setPending(false);
    }
  }

  if (message.deletedAt) return null;
  return (
    <div className="message-actions">
      {editing ? (
        <FocusPanel label="Chỉnh sửa tin nhắn">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save(false);
            }}
          >
            <Textarea
              id={`edit-message-${message.id}`}
              label="Chỉnh sửa tin nhắn"
              value={text}
              maxLength={2000}
              rows={3}
              disabled={pending}
              onChange={(event) => setText(event.target.value)}
            />
            <Button
              type="submit"
              disabled={
                pending || (!text.trim() && !message.attachments.length)
              }
            >
              Lưu
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Hủy
            </Button>
          </form>
        </FocusPanel>
      ) : (
        <>
          {!!message.text && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setText(message.text);
                setVersion(message.version);
                setError("");
                setEditing(true);
              }}
            >
              Sửa
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => void save(true)}
          >
            Xóa
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
