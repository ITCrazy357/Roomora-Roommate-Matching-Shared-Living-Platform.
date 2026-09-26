"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
import type { MyProfile } from "@/lib/profile";
import { ProfileIcon } from "./profile-icon";

export function AvatarUpload({
  profile,
  disabled,
  onUpdated,
  onBusy,
}: {
  profile: MyProfile;
  disabled: boolean;
  onUpdated: (profile: MyProfile) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Chọn ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh không được lớn hơn 5 MB.");
      return;
    }
    setPending(true);
    onBusy(true);
    try {
      const body = new FormData();
      body.append("avatar", file);
      // Let the browser supply the multipart boundary. No Cloudinary secrets here.
      const updated = await apiFetch<MyProfile>("/profiles/me/avatar", {
        method: "POST",
        body,
        timeoutMs: 60000,
      });
      onUpdated(updated);
      setMessage("Ảnh đại diện đã được cập nhật.");
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setPending(true);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await apiFetch<MyProfile>("/profiles/me/avatar", {
        method: "DELETE",
        timeoutMs: 60000,
      });
      onUpdated(updated);
      setMessage("Đã xóa ảnh đại diện.");
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  return (
    <div className="avatar-field">
      <div className="avatar-upload-row">
        <div className="avatar-upload-preview">
          {profile.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt="Ảnh đại diện của bạn"
              width={96}
              height={96}
              unoptimized
              referrerPolicy="no-referrer"
            />
          ) : (
            <span>
              {profile.displayName.trim().charAt(0).toLocaleUpperCase("vi")}
            </span>
          )}
          <span className="avatar-camera">
            <ProfileIcon name="camera" width={16} height={16} />
          </span>
        </div>
        <div className="avatar-upload-copy">
          <strong>Một bức ảnh, một lời chào.</strong>
          <p>Để bạn cùng nhà dễ nhận ra bạn.</p>
          <div className="avatar-upload-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={pending || disabled}
              onClick={() => input.current?.click()}
            >
              {pending
                ? "Đang xử lý ảnh…"
                : profile.avatarUrl
                  ? "Thay ảnh"
                  : "Tải ảnh lên"}
            </button>
            {profile.avatarUrl && (
              <button
                className="text-link"
                type="button"
                disabled={pending || disabled}
                onClick={remove}
              >
                Xóa ảnh
              </button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Chọn ảnh đại diện"
          className="visually-hidden"
          disabled={pending || disabled}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </div>
      <p className="avatar-hint">
        JPG, PNG hoặc WebP · tối đa 5 MB. Ảnh được lưu ngay và có liên kết công
        khai; không dùng ảnh chứa thông tin nhạy cảm.
      </p>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="upload-success" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
