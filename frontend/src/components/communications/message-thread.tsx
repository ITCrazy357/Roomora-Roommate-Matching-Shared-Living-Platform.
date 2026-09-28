"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ApiError, apiFetch, apiUrl } from "@/lib/api";
import {
  communicationError,
  formatTime,
  post,
  type ConversationDetail,
  type Message,
  type MessageAttachment,
} from "@/lib/communications";
import { useAuth } from "../auth-provider";
import { useUpdates } from "./updates-provider";
import { Button, Card, ErrorState, LoadingState, Textarea } from "../ui";
import { AppointmentCard } from "./appointment-card";
import { AppointmentForm } from "./appointment-form";
import { AreaMap } from "../listings/listing-content";

function mergeMessages(old: Message[], items: Message[]) {
  const rows = new Map(old.map((item) => [item.number, item]));
  for (const item of items) rows.set(item.number, item);
  return [...rows.values()].sort((a, b) => a.number - b.number);
}
type DraftImage = { file: File; url: string };
type DraftAudio = { file: File; url: string };

function attachmentUrl(conversationId: string, attachmentId: string) {
  return apiUrl(`/conversations/${conversationId}/attachments/${attachmentId}`);
}
function microphoneError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Trình duyệt hoặc hệ điều hành từ chối micro. Hãy kiểm tra cả quyền của trang và quyền micro cho ứng dụng trình duyệt trong hệ điều hành.";
  if (name === "NotFoundError")
    return "Không tìm thấy micro. Hãy kết nối hoặc chọn thiết bị đầu vào trong cài đặt hệ điều hành.";
  if (name === "NotReadableError" || name === "AbortError")
    return "Micro đang không khả dụng. Hãy đóng ứng dụng khác đang dùng micro rồi thử lại.";
  return "Không thể mở micro. Bạn có thể thử lại hoặc chọn tệp ghi âm có sẵn.";
}
function MessageMedia({ conversationId, files, openImage }: {
  conversationId: string;
  files: MessageAttachment[];
  openImage: (url: string) => void;
}) {
  const images = files.filter((file) => file.kind === "IMAGE");
  const audio = files.find((file) => file.kind === "AUDIO");
  return (
    <>
      {images.length > 0 && (
        <div className={`message-images ${images.length === 1 ? "message-image-single" : ""}`}>
          {images.map((file, index) => {
            const url = attachmentUrl(conversationId, file.id);
            return (
              <button key={file.id} type="button" className="message-image-button"
                aria-label={`Xem ảnh ${index + 1}`} onClick={() => openImage(url)}>
                <Image unoptimized src={url} alt={`Ảnh đã gửi ${index + 1}`}
                  width={file.width ?? 800} height={file.height ?? 600} />
              </button>
            );
          })}
        </div>
      )}
      {audio && (
        <div className="message-audio">
          <span aria-hidden="true">♪</span>
          <audio controls preload="metadata" src={attachmentUrl(conversationId, audio.id)} aria-label="Ghi âm trong tin nhắn" />
        </div>
      )}
    </>
  );
}
export function MessageThread({ id }: { id: string }) {
  const { user } = useAuth();
  const { revision, connected, typingByConversation } = useUpdates();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [text, setText] = useState("");
  const [images, setImages] = useState<DraftImage[]>([]);
  const [audio, setAudio] = useState<DraftAudio | null>(null);
  const [recording, setRecording] = useState(false);
  const [microphoneFailed, setMicrophoneFailed] = useState(false);
  const [viewingImage, setViewingImage] = useState("");
  const [pending, setPending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [openMapId, setOpenMapId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const loaded = useRef(false);
  const lastNumber = useRef(0);
  const draft = useRef<{ clientId: string; text: string; mediaVersion: number } | null>(null);
  const mediaVersion = useRef(0);
  const history = useRef<HTMLDivElement>(null);
  const stayAtBottom = useRef(true);
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const previewUrls = useRef(new Set<string>());
  const recorder = useRef<MediaRecorder | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRecorder = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRefresh = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingActive = useRef(false);

  function stopTyping() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingRefresh.current) clearInterval(typingRefresh.current);
    typingTimer.current = null;
    typingRefresh.current = null;
    if (!typingActive.current) return;
    typingActive.current = false;
    void post(`/conversations/${id}/typing`, { typing: false }).catch(() => {});
  }
  function updateTyping(value: string) {
    if (!value.trim()) {
      stopTyping();
      return;
    }
    if (!typingActive.current) {
      typingActive.current = true;
      void post(`/conversations/${id}/typing`, { typing: true }).catch(() => {});
      typingRefresh.current = setInterval(() => {
        void post(`/conversations/${id}/typing`, { typing: true }).catch(() => {});
      }, 2000);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingRefresh.current) clearInterval(typingRefresh.current);
    typingTimer.current = setTimeout(stopTyping, 1800);
  }
  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingActive.current) {
      typingActive.current = false;
      void post(`/conversations/${id}/typing`, { typing: false }).catch(() => {});
    }
  }, [id]);
  useEffect(() => () => {
    if (recordTimer.current) clearTimeout(recordTimer.current);
    if (recorder.current) recorder.current.onstop = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    microphone.current?.getTracks().forEach((track) => track.stop());
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function preview(file: File) {
    const url = URL.createObjectURL(file);
    previewUrls.current.add(url);
    return url;
  }
  function removePreview(url: string) {
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  }
  function addImages(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (images.length + selected.length > 4) {
      setSendError("Mỗi tin nhắn chọn tối đa 4 ảnh.");
      return;
    }
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setSendError("Chọn ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB.");
      return;
    }
    setImages((old) => [...old, ...selected.map((file) => ({ file, url: preview(file) }))]);
    mediaVersion.current++;
    setSendError("");
  }
  function removeImage(url: string) {
    setImages((old) => old.filter((item) => item.url !== url));
    removePreview(url);
    mediaVersion.current++;
  }
  function removeAudio() {
    if (audio) removePreview(audio.url);
    setAudio(null);
    mediaVersion.current++;
  }
  function chooseAudio(file?: File) {
    if (!file) return;
    const type = file.type.split(";")[0];
    if (!["audio/webm", "audio/mp4", "audio/ogg"].includes(type) || !file.size || file.size > 2 * 1024 * 1024) {
      setSendError("Chọn ghi âm WebM, MP4 hoặc Ogg, tối đa 2 MB.");
      return;
    }
    setAudio((old) => {
      if (old) removePreview(old.url);
      return { file, url: preview(file) };
    });
    mediaVersion.current++;
    setMicrophoneFailed(false);
    setSendError("");
  }
  async function toggleRecording() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      microphone.current?.getTracks().forEach((track) => track.stop());
      if (recordTimer.current) clearTimeout(recordTimer.current);
      setRecording(false);
      return;
    }
    if (startingRecorder.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMicrophoneFailed(true);
      setSendError("Trình duyệt hoặc địa chỉ trang này không hỗ trợ ghi âm trực tiếp. Bạn có thể chọn tệp ghi âm có sẵn.");
      return;
    }
    startingRecorder.current = true;
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        setMicrophoneFailed(true);
        setSendError(microphoneError(error));
        return;
      }
      microphone.current = stream;
      let capture: MediaRecorder | null = null;
      for (const mimeType of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
        if (!MediaRecorder.isTypeSupported(mimeType)) continue;
        try {
          const candidate = new MediaRecorder(stream, { mimeType });
          candidate.start();
          capture = candidate;
          break;
        } catch {
          // Try the next recording format supported by this browser.
        }
      }
      if (!capture) {
        stream.getTracks().forEach((track) => track.stop());
        setMicrophoneFailed(true);
        setSendError("Đã mở micro nhưng trình duyệt không khởi động được ghi âm. Bạn có thể chọn tệp ghi âm có sẵn.");
        return;
      }
      const chunks: Blob[] = [];
      capture.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: capture.mimeType });
        if (!blob.size) return;
        if (blob.size > 2 * 1024 * 1024) {
          setSendError("Ghi âm tối đa 2 MB. Hãy thử đoạn ngắn hơn.");
          return;
        }
        const type = capture.mimeType.split(";")[0];
        const file = new File([blob], `ghi-am.${type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm"}`, { type });
        setAudio((old) => {
          if (old) removePreview(old.url);
          return { file, url: preview(file) };
        });
        mediaVersion.current++;
      };
      recorder.current = capture;
      setRecording(true);
      setMicrophoneFailed(false);
      setSendError("");
      recordTimer.current = setTimeout(() => {
        if (capture.state === "recording") capture.stop();
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      }, 60000);
    } catch {
      microphone.current?.getTracks().forEach((track) => track.stop());
      setMicrophoneFailed(true);
      setSendError("Không thể bắt đầu ghi âm. Bạn có thể thử lại hoặc chọn tệp ghi âm có sẵn.");
    } finally {
      startingRecorder.current = false;
    }
  }

  function openImage(url: string) {
    setViewingImage(url);
    imageDialog.current?.showModal();
  }
  useEffect(() => {
    const dialog = imageDialog.current;
    const close = () => setViewingImage("");
    dialog?.addEventListener("close", close);
    return () => dialog?.removeEventListener("close", close);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const room = await apiFetch<ConversationDetail>(
          `/conversations/${id}`,
          { signal: controller.signal },
        );
        const firstLoad = !loaded.current;
        let after = lastNumber.current;
        let more = true;
        const items: Message[] = [];
        while (more && !controller.signal.aborted) {
          const query = firstLoad ? "" : `?after=${after}`;
          const page = await apiFetch<{ items: Message[]; hasMore: boolean }>(
            `/conversations/${id}/messages${query}`,
            { signal: controller.signal },
          );
          items.push(...page.items);
          if (firstLoad) {
            setHasOlder(page.hasMore);
            break;
          }
          more = page.hasMore;
          after = page.items.at(-1)?.number ?? after;
        }
        if (controller.signal.aborted) return;
        setDetail(room);
        setError("");
        loaded.current = true;
        if (items.length) {
          lastNumber.current = Math.max(
            lastNumber.current,
            items.at(-1)!.number,
          );
          setMessages((old) => mergeMessages(old, items));
        }
        if (
          document.visibilityState === "visible" &&
          lastNumber.current > room.readNumber
        )
          await post(`/conversations/${id}/read`, {
            number: lastNumber.current,
          });
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(communicationError(error));
        // Permission may have changed after a block: remove private data from view.
        if (
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status ?? 0)
        ) {
          setDetail(null);
          setMessages([]);
          loaded.current = false;
          lastNumber.current = 0;
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [id, revision, refresh]);

  const newestNumber = messages.at(-1)?.number;
  const peerTyping = typingByConversation[id] ?? false;
  useLayoutEffect(() => {
    if (stayAtBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [newestNumber, peerTyping]);
  async function older() {
    setLoadingOlder(true);
    try {
      const page = await apiFetch<{ items: Message[]; hasMore: boolean }>(
        `/conversations/${id}/messages?before=${messages[0].number}`,
      );
      setMessages((old) => mergeMessages(old, page.items));
      setHasOlder(page.hasMore);
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setLoadingOlder(false);
    }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!text.trim() && !images.length && !audio) || pending || recording) return;
    stopTyping();
    stayAtBottom.current = true;
    // Reuse the same ID on retry after a lost response; the API will not duplicate it.
    if (!draft.current || draft.current.text !== text.trim() || draft.current.mediaVersion !== mediaVersion.current)
      draft.current = { clientId: crypto.randomUUID(), text: text.trim(), mediaVersion: mediaVersion.current };
    const message = draft.current;
    setPending(true);
    setMicrophoneFailed(false);
    setSendError("");
    try {
      let saved: Message;
      if (images.length || audio) {
        const body = new FormData();
        body.set("clientId", message.clientId);
        body.set("text", message.text);
        images.forEach((item) => body.append("images", item.file));
        if (audio) body.set("audio", audio.file);
        saved = await apiFetch<Message>(`/conversations/${id}/messages`, {
          method: "POST", body, timeoutMs: 60000,
        });
      } else {
        saved = await post<Message>(`/conversations/${id}/messages`, {
          clientId: message.clientId, text: message.text,
        });
      }
      setMessages((old) => mergeMessages(old, [saved]));
      setText("");
      images.forEach((item) => removePreview(item.url));
      if (audio) removePreview(audio.url);
      setImages([]);
      setAudio(null);
      draft.current = null;
      setRefresh((value) => value + 1);
    } catch (error) {
      setSendError(
        `${communicationError(error)} Nội dung vẫn được giữ để gửi lại.`,
      );
    } finally {
      setPending(false);
    }
  }
  if (!detail)
    return (
      <Card className="message-loading">
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
          <LoadingState message="Đang tải hội thoại…" />
        )}
      </Card>
    );
  return (
    <>
      <Card className="message-thread">
        <header className="message-heading">
          <div>
            <h2>{detail.person.displayName}</h2>
            <p className="text-muted">
              {connected
                ? "Đã kết nối · tin nhắn tự cập nhật"
                : "Đang kết nối lại…"}
            </p>
          </div>
          <Link className="text-link" href={`/ho-so/${detail.person.userId}`}>
            Hồ sơ →
          </Link>
        </header>
        <div className="message-history" ref={history} aria-label="Lịch sử tin nhắn"
          onScroll={(event) => {
            const box = event.currentTarget;
            stayAtBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
          }}>
          {hasOlder && (
            <Button variant="secondary" disabled={loadingOlder} onClick={older}>
              {loadingOlder ? "Đang tải…" : "Tải tin nhắn cũ"}
            </Button>
          )}
          {!messages.length && (
            <p className="message-welcome">
              Hai bạn đã kết nối. Hãy bắt đầu bằng một lời chào và trao đổi về
              nếp sống.
            </p>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-bubble ${message.senderId === user?.id ? "message-own" : ""}`}
            >
              {message.text && <p>{message.text}</p>}
              {!!message.attachments.length && <MessageMedia conversationId={id}
                files={message.attachments} openImage={openImage} />}
              <small>
                {formatTime(message.createdAt)}
                {message.senderId === user?.id && " · Đã gửi"}
              </small>
            </article>
          ))}
          {typingByConversation[id] && (
            <div className="typing-indicator" role="status" aria-label={`${detail.person.displayName} đang nhập tin nhắn`}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
        </div>
        <form className="message-composer" onSubmit={send}>
          {error && <ErrorState message={error} />}
          {sendError && <div className="composer-error">
            <ErrorState message={sendError} />
            {microphoneFailed && <Button variant="secondary" onClick={() => audioInput.current?.click()}>
              Chọn tệp ghi âm có sẵn
            </Button>}
          </div>}
          <div className="composer-shortcuts">
            <Button variant="secondary" onClick={() => setProposing(true)}>
              ＋ Đề xuất lịch hẹn
            </Button>
            <small>Enter gửi · Shift + Enter xuống dòng</small>
          </div>
          {(images.length > 0 || audio) && (
            <div className="composer-previews" aria-label="Tệp đã chọn">
              {images.map((item, index) => (
                <div className="composer-preview-image" key={item.url}>
                  <Image unoptimized src={item.url} alt={`Ảnh đã chọn ${index + 1}`} width={88} height={88} />
                  <button type="button" aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => removeImage(item.url)} disabled={pending}>×</button>
                </div>
              ))}
              {audio && <div className="composer-preview-audio">
                <audio controls src={audio.url} aria-label="Nghe lại ghi âm" />
                <button type="button" aria-label="Bỏ ghi âm" onClick={removeAudio} disabled={pending}>×</button>
              </div>}
            </div>
          )}
          {recording && <p className="composer-recording" role="status">● Đang ghi âm… Nhấn micro để dừng (tối đa 60 giây).</p>}
          <div className="composer-row">
            <input ref={imageInput} className="composer-file-input" type="file" accept="image/jpeg,image/png,image/webp"
              multiple aria-label="Chọn ảnh gửi trong chat" onChange={(event) => {
                addImages(event.target.files); event.target.value = "";
              }} />
            <input ref={audioInput} className="composer-file-input" type="file" accept="audio/webm,audio/mp4,audio/ogg"
              aria-label="Chọn tệp ghi âm" onChange={(event) => {
                chooseAudio(event.target.files?.[0]); event.target.value = "";
              }} />
            <button type="button" className="composer-icon" aria-label="Thêm ảnh" title="Thêm ảnh"
              disabled={pending || recording || images.length >= 4} onClick={() => imageInput.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></svg>
            </button>
            <button type="button" className={`composer-icon ${recording ? "composer-icon-active" : ""}`}
              aria-label={recording ? "Dừng ghi âm" : "Ghi âm"} title={recording ? "Dừng ghi âm" : "Ghi âm"}
              disabled={pending} onClick={() => void toggleRecording()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8" /></svg>
            </button>
            <Textarea id="message-text" label={`Tin nhắn cho ${detail.person.displayName}`}
              value={text} onChange={(event) => { setText(event.target.value); updateTyping(event.target.value); }}
              onBlur={stopTyping} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!event.repeat && (text.trim() || images.length || audio) && !pending && !recording)
                    event.currentTarget.form?.requestSubmit();
                }
              }} maxLength={2000} rows={2} disabled={pending || recording}
              placeholder="Viết lời nhắn…" />
            <Button type="submit" className="composer-send" aria-label="Gửi tin nhắn"
              disabled={pending || recording || (!text.trim() && !images.length && !audio)}>
              {pending ? "…" : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m4 12 16-8-4 16-4-6-8-2Zm8 2 8-10" /></svg>}
            </Button>
          </div>
        </form>
        <dialog ref={imageDialog} className="message-image-dialog" onClick={(event) => {
          if (event.target === event.currentTarget) imageDialog.current?.close();
        }}>
          <button type="button" aria-label="Đóng ảnh" onClick={() => imageDialog.current?.close()}>×</button>
          {viewingImage && <Image unoptimized src={viewingImage} alt="Ảnh trong hội thoại" width={1400} height={1000} />}
        </dialog>
      </Card>
      <aside className="message-sidebar">
        <Card className="viewing-intro">
          <h2>Phòng & lịch hẹn</h2>
          <p className="text-muted">
            Cùng xem không gian và trao đổi trước khi quyết định ở ghép.
          </p>
          <Link className="text-link" href="/lich-xem-phong">
            Tất cả lịch hẹn →
          </Link>
        </Card>
        {proposing && (
          <Card>
            <AppointmentForm
              conversationId={id}
              rooms={detail.listings}
              onDone={() => {
                setProposing(false);
                setRefresh((value) => value + 1);
              }}
              onCancel={() => setProposing(false)}
            />
          </Card>
        )}
        {detail.listings.map((room) => (
          <Card key={room.id} className="conversation-room">
            <small className="text-muted">
              {room.ownerId === user?.id ? "Tin phòng của bạn" : `Tin phòng của ${detail.person.displayName}`}
            </small>
            {room.photos[0] && (
              <Image
                unoptimized
                className="conversation-room-image"
                src={room.photos[0].url}
                alt={room.title}
                width={400}
                height={250}
                sizes="(max-width: 700px) 90vw, 340px"
              />
            )}
            <h3>{room.title}</h3>
            <p className="text-muted">
              {[room.wardName, room.provinceName].filter(Boolean).join(", ")}
            </p>
            {room.rent && (
              <strong>
                {new Intl.NumberFormat("vi-VN").format(room.rent)} đ/tháng
              </strong>
            )}
            <Link className="text-link" href={`/phong/${room.id}`}>
              Xem tin phòng →
            </Link>
            {room.latitude !== null && room.longitude !== null && (
              <>
                <Button variant="secondary" onClick={() => setOpenMapId(openMapId === room.id ? null : room.id)}
                  aria-expanded={openMapId === room.id}>
                  {openMapId === room.id ? "Ẩn bản đồ khu vực" : "Xem bản đồ khu vực"}
                </Button>
                {openMapId === room.id && (
                  <>
                    <AreaMap latitude={room.latitude} longitude={room.longitude} />
                    <p className="text-muted">Ghim chỉ thể hiện khu vực gần phòng (khoảng 1 km), không phải địa chỉ chính xác.</p>
                  </>
                )}
              </>
            )}
          </Card>
        ))}
        {!detail.listings.length && (
          <Card>
            <p className="text-muted">
              Chưa có tin phòng công khai. Hai bạn vẫn có thể đề xuất lịch gặp để trao đổi.
            </p>
          </Card>
        )}
        {detail.appointments.map((item) => (
          <AppointmentCard
            key={item.id}
            item={item}
            onChange={() => setRefresh((value) => value + 1)}
          />
        ))}
        <Card className="viewing-safety">
          <h3>Gặp gỡ an toàn</h3>
          <p>
            Nên hẹn ban ngày hoặc đi cùng bạn bè. Lịch hẹn không phải là đặt cọc giữ chỗ.
          </p>
        </Card>
      </aside>
    </>
  );
}
