"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { apiUrl } from "@/lib/api";
import { formatFileSize, type MessageAttachment } from "@/lib/communications";
export function MessageMedia({
  path,
  files,
  openImage,
}: {
  path: string;
  files: MessageAttachment[];
  openImage?: (url: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [viewingImage, setViewingImage] = useState("");
  const images = files.filter((file) => file.kind === "IMAGE");
  const audio = files.find((file) => file.kind === "AUDIO");
  const documents = files.filter((file) => file.kind === "FILE");
  return (
    <>
      {images.length > 0 && (
        <div
          className={`message-images ${images.length === 1 ? "message-image-single" : ""}`}
        >
          {images.map((file, index) => {
            const url = apiUrl(`${path}/${file.id}`);
            return (
              <button
                key={file.id}
                type="button"
                className="message-image-button"
                aria-label={`Xem ảnh ${index + 1}`}
                onClick={() => {
                  if (openImage) openImage(url);
                  else {
                    setViewingImage(url);
                    dialog.current?.showModal();
                  }
                }}
              >
                <Image
                  unoptimized
                  src={url}
                  alt={`Ảnh đã gửi ${index + 1}`}
                  width={file.width ?? 800}
                  height={file.height ?? 600}
                />
              </button>
            );
          })}
        </div>
      )}
      {audio && (
        <div className="message-audio">
          <span aria-hidden="true">♪</span>
          <audio
            controls
            preload="metadata"
            src={apiUrl(`${path}/${audio.id}`)}
            aria-label="Ghi âm trong tin nhắn"
          />
        </div>
      )}
      {documents.length > 0 && (
        <div className="message-documents">
          {documents.map((file) => (
            <a
              key={file.id}
              className="message-document"
              href={apiUrl(`${path}/${file.id}`)}
              download={file.fileName ?? "tep-dinh-kem"}
            >
              <span aria-hidden="true">↓</span>
              <span>
                <strong>{file.fileName ?? "Tệp đính kèm"}</strong>
                <small>{formatFileSize(file.byteSize)} · Tải tệp</small>
              </span>
            </a>
          ))}
        </div>
      )}
      {!openImage && images.length > 0 && (
        <dialog
          ref={dialog}
          className="message-image-dialog"
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close();
          }}
          onClose={() => setViewingImage("")}
        >
          <button
            type="button"
            aria-label="Đóng ảnh"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
          {viewingImage && (
            <Image
              unoptimized
              src={viewingImage}
              alt="Ảnh trong hội thoại"
              width={1400}
              height={1000}
            />
          )}
        </dialog>
      )}
    </>
  );
}
