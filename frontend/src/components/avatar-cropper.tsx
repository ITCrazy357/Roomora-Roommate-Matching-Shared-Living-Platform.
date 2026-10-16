"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";
import {
  avatarGeometry,
  drawAvatar,
  exportAvatar,
  initialAvatarCrop,
  MAX_AVATAR_PIXELS,
  type AvatarCrop,
  validAvatarBytes,
} from "@/lib/avatar-crop";

export function AvatarCropper({
  file,
  uploading,
  uploadError,
  onCancel,
  onSave,
}: {
  file: File;
  uploading: boolean;
  uploadError: string;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const titleId = useId();
  const hintId = useId();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<AvatarCrop>(initialAvatarCrop);
  const [error, setError] = useState("");
  const [encoding, setEncoding] = useState(false);
  const busy = encoding || uploading;

  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.current?.open) dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      });
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    let loaded: HTMLImageElement | undefined;
    async function load() {
      try {
        if (!(await validAvatarBytes(file)))
          throw new Error("Chọn tệp ảnh JPG, PNG hoặc WebP hợp lệ.");
        if (disposed) return;
        url = URL.createObjectURL(file);
        loaded = new window.Image();
        loaded.src = url;
        await loaded.decode();
        if (disposed) return;
        if (
          !loaded.naturalWidth ||
          !loaded.naturalHeight ||
          loaded.naturalWidth * loaded.naturalHeight > MAX_AVATAR_PIXELS
        )
          throw new Error(
            "Ảnh vượt quá 25 triệu điểm ảnh. Hãy chọn ảnh có kích thước nhỏ hơn.",
          );
        setImage(loaded);
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error && !(cause instanceof DOMException)
              ? cause.message
              : "Không đọc được ảnh. Hãy chọn ảnh khác.",
          );
      }
    }
    void load();
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
      if (loaded) loaded.src = "";
    };
  }, [file]);

  useEffect(() => {
    if (image && canvas.current) drawAvatar(canvas.current, image, crop);
  }, [image, crop]);

  function changeCrop(
    update: AvatarCrop | ((current: AvatarCrop) => AvatarCrop),
  ) {
    if (!image || busy) return;
    setCrop((current) => {
      const next = typeof update === "function" ? update(current) : update;
      const geometry = avatarGeometry(
        image.naturalWidth,
        image.naturalHeight,
        next,
      );
      return { ...next, zoom: geometry.zoom, x: geometry.x, y: geometry.y };
    });
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!image || busy || !event.isPrimary || event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const previous = drag.current;
    if (!previous || previous.pointerId !== event.pointerId) return;
    const size = event.currentTarget.getBoundingClientRect().width;
    const dx = (event.clientX - previous.x) / size;
    const dy = (event.clientY - previous.y) / size;
    changeCrop((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    const step = event.shiftKey ? 0.08 : 0.02;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    changeCrop((current) => ({
      ...current,
      x: current.x + delta[0],
      y: current.y + delta[1],
    }));
  }

  async function save() {
    if (!image || busy) return;
    setEncoding(true);
    setError("");
    try {
      await onSave(await exportAvatar(image, crop));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể xử lý ảnh. Hãy thử lại.",
      );
    } finally {
      setEncoding(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="avatar-crop-dialog"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onCancel();
      }}
    >
      <div className="avatar-crop-header">
        <div>
          <h2 id={titleId}>Căn chỉnh ảnh đại diện</h2>
          <p id={hintId}>Kéo ảnh để căn khuôn mặt trong vòng tròn.</p>
        </div>
        <button
          type="button"
          className="avatar-crop-close"
          aria-label="Đóng chỉnh ảnh"
          disabled={busy}
          onClick={onCancel}
        >
          ×
        </button>
      </div>
      <div className="avatar-crop-stage" aria-busy={!image && !error}>
        <canvas
          ref={canvas}
          width={640}
          height={640}
          tabIndex={image && !busy ? 0 : -1}
          aria-label="Vùng cắt ảnh. Kéo để di chuyển hoặc dùng các phím mũi tên."
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={moveWithKeyboard}
        />
        <span className="avatar-crop-mask" aria-hidden="true" />
        {!image && (
          <span className="avatar-crop-loading">
            {error ? "Không thể mở ảnh" : "Đang mở ảnh…"}
          </span>
        )}
      </div>
      <p className="avatar-crop-hint">
        Ảnh sẽ hiển thị trong vòng tròn. Có thể dùng phím mũi tên để căn chính
        xác.
      </p>
      <div className="avatar-crop-zoom">
        <label htmlFor={`${titleId}-zoom`}>Thu phóng</label>
        <output htmlFor={`${titleId}-zoom`}>
          {Math.round(crop.zoom * 100)}%
        </output>
        <input
          id={`${titleId}-zoom`}
          type="range"
          min="1"
          max="4"
          step="0.01"
          value={crop.zoom}
          disabled={!image || busy}
          onChange={(event) =>
            changeCrop({ ...crop, zoom: Number(event.target.value) })
          }
        />
      </div>
      <div className="avatar-crop-tools">
        <Button
          variant="secondary"
          disabled={!image || busy}
          onClick={() =>
            changeCrop({
              ...crop,
              rotation: (crop.rotation + 270) % 360,
              x: 0,
              y: 0,
            })
          }
        >
          ↶ Xoay trái
        </Button>
        <Button
          variant="secondary"
          disabled={!image || busy}
          onClick={() =>
            changeCrop({
              ...crop,
              rotation: (crop.rotation + 90) % 360,
              x: 0,
              y: 0,
            })
          }
        >
          ↷ Xoay phải
        </Button>
        <button
          type="button"
          className="text-link"
          disabled={!image || busy}
          onClick={() => changeCrop(initialAvatarCrop)}
        >
          Đặt lại
        </button>
      </div>
      {(error || uploadError) && (
        <p className="avatar-crop-error text-danger" role="alert">
          {error || uploadError}
        </p>
      )}
      <div className="avatar-crop-footer">
        <p>Ảnh chỉ được tải lên khi bạn bấm lưu.</p>
        <div>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Hủy
          </Button>
          <Button disabled={!image || busy} onClick={() => void save()}>
            {busy ? "Đang lưu ảnh…" : "Lưu ảnh"}
          </Button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
