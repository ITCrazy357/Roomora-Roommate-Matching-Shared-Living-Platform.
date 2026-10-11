"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import {
  post,
  communicationError,
  formatFileSize,
  type Message,
} from "@/lib/communications";
import { Button, ErrorState, Textarea } from "../ui";
type DraftImage = { file: File; url: string };
type DraftAudio = DraftImage;
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

export function MessageComposer<T extends Message = Message>({
  path,
  label,
  textId = "message-text",
  onSaved,
  onTyping,
  onBlur,
  shortcuts,
  onCreatePoll,
}: {
  path: string;
  label: string;
  textId?: string;
  onSaved: (message: T) => void;
  onTyping?: (text: string) => void;
  onBlur?: () => void;
  shortcuts?: ReactNode;
  onCreatePoll?: () => void;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<DraftImage[]>([]);
  const [audio, setAudio] = useState<DraftAudio | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [microphoneFailed, setMicrophoneFailed] = useState(false);

  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState("");
  const draft = useRef<{
    clientId: string;
    text: string;
    mediaVersion: number;
  } | null>(null);
  const mediaVersion = useRef(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const recorder = useRef<MediaRecorder | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRecorder = useRef(false);
  const mounted = useRef(false);
  const [startingRecording, setStartingRecording] = useState(false);
  const [stoppingRecording, setStoppingRecording] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const urls = previewUrls.current;
    return () => {
      mounted.current = false;
      if (recordTimer.current) clearTimeout(recordTimer.current);
      if (recorder.current) recorder.current.onstop = null;
      if (recorder.current?.state === "recording") recorder.current.stop();
      microphone.current?.getTracks().forEach((track) => track.stop());
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
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
    if (
      selected.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024,
      )
    ) {
      setSendError("Chọn ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB.");
      return;
    }
    setImages((old) => [
      ...old,
      ...selected.map((file) => ({ file, url: preview(file) })),
    ]);
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
  function chooseFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const combined = [...files, ...Array.from(selected)];
    if (
      combined.length > 4 ||
      combined.some((file) => !file.size) ||
      combined.reduce((total, file) => total + file.size, 0) > 5 * 1024 * 1024
    ) {
      setSendError(
        "Chọn tối đa 4 tệp có nội dung, tổng dung lượng không quá 5 MB.",
      );
      return;
    }
    setFiles(combined);
    mediaVersion.current++;
    setSendError("");
  }
  function chooseAudio(file?: File) {
    if (!file) return;
    const aliases: Record<string, string> = {
      "video/webm": "audio/webm",
      "video/mp4": "audio/mp4",
      "audio/x-m4a": "audio/mp4",
      "application/ogg": "audio/ogg",
    };
    const originalType = file.type.split(";")[0].toLowerCase();
    const type = aliases[originalType] ?? originalType;
    if (
      !["audio/webm", "audio/mp4", "audio/ogg"].includes(type) ||
      !file.size ||
      file.size > 2 * 1024 * 1024
    ) {
      setSendError("Chọn ghi âm WebM, MP4 hoặc Ogg, tối đa 2 MB.");
      return;
    }
    setAudio((old) => {
      if (old) removePreview(old.url);
      const audioFile = new File([file], file.name, {
        type,
        lastModified: file.lastModified,
      });
      return { file: audioFile, url: preview(audioFile) };
    });
    mediaVersion.current++;
    setMicrophoneFailed(false);
    setSendError("");
  }
  async function toggleRecording() {
    if (recorder.current?.state === "recording") {
      setStoppingRecording(true);
      recorder.current.stop();
      microphone.current?.getTracks().forEach((track) => track.stop());
      if (recordTimer.current) clearTimeout(recordTimer.current);
      return;
    }
    if (startingRecorder.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMicrophoneFailed(true);
      setSendError(
        "Trình duyệt hoặc địa chỉ trang này không hỗ trợ ghi âm trực tiếp. Bạn có thể chọn tệp ghi âm có sẵn.",
      );
      return;
    }
    startingRecorder.current = true;
    setStartingRecording(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        setMicrophoneFailed(true);
        setSendError(microphoneError(error));
        return;
      }
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone.current = stream;
      let capture: MediaRecorder | null = null;
      for (const mimeType of [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ]) {
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
        setSendError(
          "Đã mở micro nhưng trình duyệt không khởi động được ghi âm. Bạn có thể chọn tệp ghi âm có sẵn.",
        );
        return;
      }
      const chunks: Blob[] = [];
      capture.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      capture.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        if (recordTimer.current) clearTimeout(recordTimer.current);
        setRecording(false);
        setStoppingRecording(false);
        const blob = new Blob(chunks, { type: capture.mimeType });
        if (!blob.size) return;
        if (blob.size > 2 * 1024 * 1024) {
          setSendError("Ghi âm tối đa 2 MB. Hãy thử đoạn ngắn hơn.");
          return;
        }
        const type = capture.mimeType.split(";")[0];
        const file = new File(
          [blob],
          `ghi-am.${type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm"}`,
          { type },
        );
        setAudio((old) => {
          if (old) removePreview(old.url);
          return { file, url: preview(file) };
        });
        mediaVersion.current++;
      };
      capture.onerror = () => {
        if (capture.state === "recording") capture.stop();
        stream.getTracks().forEach((track) => track.stop());
        if (mounted.current)
          setSendError("Ghi âm bị gián đoạn. Hãy nghe lại trước khi gửi.");
      };
      recorder.current = capture;
      setRecording(true);
      setMicrophoneFailed(false);
      setSendError("");
      recordTimer.current = setTimeout(() => {
        setStoppingRecording(true);
        if (capture.state === "recording") capture.stop();
        stream.getTracks().forEach((track) => track.stop());
      }, 60000);
    } catch {
      microphone.current?.getTracks().forEach((track) => track.stop());
      setMicrophoneFailed(true);
      setSendError(
        "Không thể bắt đầu ghi âm. Bạn có thể thử lại hoặc chọn tệp ghi âm có sẵn.",
      );
    } finally {
      startingRecorder.current = false;
      if (mounted.current) setStartingRecording(false);
    }
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      (!text.trim() && !images.length && !audio && !files.length) ||
      pending ||
      recording ||
      startingRecording
    )
      return;
    onBlur?.();

    // Reuse the same ID on retry after a lost response; the API will not duplicate it.
    if (
      !draft.current ||
      draft.current.text !== text.trim() ||
      draft.current.mediaVersion !== mediaVersion.current
    )
      draft.current = {
        clientId: crypto.randomUUID(),
        text: text.trim(),
        mediaVersion: mediaVersion.current,
      };
    const message = draft.current;
    setPending(true);
    setMicrophoneFailed(false);
    setSendError("");
    try {
      let saved: T;
      if (images.length || audio || files.length) {
        const body = new FormData();
        body.set("clientId", message.clientId);
        body.set("text", message.text);
        images.forEach((item) => body.append("images", item.file));
        if (audio) body.set("audio", audio.file);
        files.forEach((file) => body.append("files", file));
        saved = await apiFetch<T>(path, {
          method: "POST",
          body,
          timeoutMs: 60000,
        });
      } else {
        saved = await post<T>(path, {
          clientId: message.clientId,
          text: message.text,
        });
      }
      onSaved(saved);
      setText("");
      images.forEach((item) => removePreview(item.url));
      if (audio) removePreview(audio.url);
      setImages([]);
      setAudio(null);
      setFiles([]);
      draft.current = null;
    } catch (error) {
      setSendError(
        `${communicationError(error)} Nội dung vẫn được giữ để gửi lại.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="message-composer" onSubmit={send}>
      {sendError && (
        <div className="composer-error">
          <ErrorState message={sendError} />
          {microphoneFailed && (
            <Button
              variant="secondary"
              onClick={() => audioInput.current?.click()}
            >
              Chọn tệp ghi âm có sẵn
            </Button>
          )}
        </div>
      )}
      <div className="composer-shortcuts">
        <div className="composer-shortcut-actions">
          {shortcuts}
          {onCreatePoll && (
            <Button
              variant="secondary"
              disabled={pending || recording || startingRecording}
              onClick={onCreatePoll}
            >
              Tạo bình chọn
            </Button>
          )}
        </div>
        <small>Enter gửi · Shift + Enter xuống dòng</small>
      </div>
      {files.length > 0 && (
        <div className="composer-documents" aria-label="Tệp đã chọn">
          {files.map((file, index) => (
            <div className="composer-document" key={`${index}-${file.name}`}>
              <span>
                {file.name}
                <small>{formatFileSize(file.size)}</small>
              </span>
              <button
                type="button"
                aria-label={`Bỏ tệp ${file.name}`}
                disabled={pending}
                onClick={() => {
                  setFiles((old) =>
                    old.filter((_, position) => position !== index),
                  );
                  mediaVersion.current++;
                }}
              >
                ×
              </button>
            </div>
          ))}
          <small>
            Tối đa 4 tệp · Tổng ảnh, ghi âm và tệp sau xử lý không quá 5 MB
          </small>
        </div>
      )}
      {(images.length > 0 || audio) && (
        <div className="composer-previews" aria-label="Tệp đã chọn">
          {images.map((item, index) => (
            <div className="composer-preview-image" key={item.url}>
              <Image
                unoptimized
                src={item.url}
                alt={`Ảnh đã chọn ${index + 1}`}
                width={88}
                height={88}
              />
              <button
                type="button"
                aria-label={`Bỏ ảnh ${index + 1}`}
                onClick={() => removeImage(item.url)}
                disabled={pending}
              >
                ×
              </button>
            </div>
          ))}
          {audio && (
            <div className="composer-preview-audio">
              <audio controls src={audio.url} aria-label="Nghe lại ghi âm" />
              <button
                type="button"
                aria-label="Bỏ ghi âm"
                onClick={removeAudio}
                disabled={pending}
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}
      {recording && (
        <p className="composer-recording" role="status">
          ● Đang ghi âm… Nhấn micro để dừng (tối đa 60 giây).
        </p>
      )}
      <div className="composer-row">
        <input
          ref={fileInput}
          className="composer-file-input"
          type="file"
          multiple
          aria-label="Chọn tệp gửi trong chat"
          onChange={(event) => {
            chooseFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={imageInput}
          className="composer-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="Chọn ảnh gửi trong chat"
          onChange={(event) => {
            addImages(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={audioInput}
          className="composer-file-input"
          type="file"
          accept="audio/webm,audio/mp4,audio/ogg,.webm,.m4a,.ogg"
          aria-label="Chọn tệp ghi âm"
          onChange={(event) => {
            chooseAudio(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="composer-icon"
          aria-label="Thêm ảnh"
          title="Thêm ảnh"
          disabled={
            pending || recording || startingRecording || images.length >= 4
          }
          onClick={() => imageInput.current?.click()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m3 17 5-5 4 4 3-3 6 6" />
          </svg>
        </button>
        <button
          type="button"
          className="composer-icon"
          aria-label="Thêm tệp"
          title="Thêm tệp (tối đa 4 tệp, tổng 5 MB)"
          disabled={
            pending || recording || startingRecording || files.length >= 4
          }
          onClick={() => fileInput.current?.click()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-6 13 8-8" />
          </svg>
        </button>
        <button
          type="button"
          className={`composer-icon ${recording ? "composer-icon-active" : ""}`}
          aria-label={recording ? "Dừng ghi âm" : "Ghi âm"}
          title={recording ? "Dừng ghi âm" : "Ghi âm"}
          disabled={pending || startingRecording || stoppingRecording}
          onClick={() => void toggleRecording()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8" />
          </svg>
        </button>
        <Textarea
          id={textId}
          label={label}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onTyping?.(event.target.value);
          }}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (
                !event.repeat &&
                (text.trim() || images.length || audio || files.length) &&
                !pending &&
                !recording
              )
                event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={2000}
          rows={2}
          disabled={pending || recording || startingRecording}
          placeholder="Viết lời nhắn…"
        />
        <Button
          type="submit"
          className="composer-send"
          aria-label="Gửi tin nhắn"
          disabled={
            pending ||
            recording ||
            startingRecording ||
            (!text.trim() && !images.length && !audio && !files.length)
          }
        >
          {pending ? (
            "…"
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m4 12 16-8-4 16-4-6-8-2Zm8 2 8-10" />
            </svg>
          )}
        </Button>
      </div>
    </form>
  );
}
