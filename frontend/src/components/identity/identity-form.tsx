"use client";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import {
  identityError,
  type IdentityFields,
  type IdentityRecord,
} from "@/lib/identity";
import { ListingAccess } from "../listings/listing-access";
import { useAdminPage, AdminResult } from "../admin/admin-shared";
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  ErrorState,
  Input,
  Textarea,
} from "../ui";
import { IdentityBadge } from "./identity-badge";

const empty: IdentityFields = {
  fullName: "",
  birthDate: "",
  documentNumber: "",
  phone: "",
  contactAddress: "",
};
const sample: IdentityFields = {
  fullName: "Nguyễn Văn Mẫu",
  birthDate: "2001-01-01",
  documentNumber: "000000000123",
  phone: "0900000000",
  contactAddress: "Địa chỉ minh họa, chỉ dùng cho demo Roomora",
};

function Form({
  record,
  reload,
  onSaved,
}: {
  record: IdentityRecord | null;
  reload: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<IdentityFields>(record?.fields ?? empty);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  function change(key: keyof IdentityFields, value: string) {
    setFields((old) => ({ ...old, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await apiFetch("/identity/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          version: record?.version ?? 0,
          confirmDemo: confirmed,
        }),
      });
      onSaved();
      reload();
      window.dispatchEvent(new Event("roomora:admin-change"));
    } catch (error) {
      setError(identityError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <IdentityBadge status={record?.status} />
      {record?.reviewNote && (
        <p className="listing-privacy">
          Ghi chú từ quản trị: {record.reviewNote}
        </p>
      )}
      {record && (
        <p className="text-muted">
          Đã lưu hồ sơ. Nếu cần bổ sung, sửa thông tin và nộp lại. Hồ sơ đã nộp
          không bị yêu cầu chờ ADMIN duyệt để tiếp tục.
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setFields(sample);
          }}
        >
          Điền dữ liệu mẫu
        </Button>
        <fieldset disabled={pending} className="form-stack">
          <legend className="visually-hidden">Thông tin khai báo demo</legend>
          <div className="form-grid">
            <Input
              id="identity-name"
              label="Họ và tên (demo)"
              required
              minLength={2}
              maxLength={100}
              value={fields.fullName}
              onChange={(event) => change("fullName", event.target.value)}
              autoComplete="off"
            />
            <Input
              id="identity-birth"
              label="Ngày sinh (demo)"
              type="date"
              required
              value={fields.birthDate}
              onChange={(event) => change("birthDate", event.target.value)}
            />
            <Input
              id="identity-document"
              label="Số CCCD (demo)"
              required
              inputMode="numeric"
              pattern="[0-9]{12}"
              minLength={12}
              maxLength={12}
              value={fields.documentNumber}
              onChange={(event) => change("documentNumber", event.target.value)}
              hint="12 chữ số. Chỉ dùng số giả để minh họa."
              autoComplete="off"
            />
            <Input
              id="identity-phone"
              label="Số điện thoại (demo)"
              required
              inputMode="tel"
              pattern="0[0-9]{9}"
              maxLength={10}
              value={fields.phone}
              onChange={(event) => change("phone", event.target.value)}
              autoComplete="off"
            />
          </div>
          <Textarea
            id="identity-address"
            label="Địa chỉ liên hệ (demo)"
            required
            minLength={5}
            maxLength={300}
            value={fields.contactAddress}
            onChange={(event) => change("contactAddress", event.target.value)}
          />
          <Checkbox
            label="Tôi chỉ sử dụng dữ liệu giả để minh họa, hiểu rằng đây chưa phải xác minh danh tính chính thức."
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
          />
        </fieldset>
        {error && <ErrorState message={error} />}
        <div className="admin-actions">
          <Button type="submit" disabled={pending || !confirmed}>
            {pending
              ? "Đang lưu…"
              : record
                ? "Cập nhật khai báo"
                : "Nộp hồ sơ demo"}
          </Button>
          <ButtonLink href="/tai-khoan/ho-so" variant="secondary">
            Hồ sơ cá nhân
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}

function Workspace() {
  const { data, error, reload } = useAdminPage<{
    declaration: IdentityRecord | null;
  }>("/identity/me");
  const [saved, setSaved] = useState(false);
  return (
    <section className="container page-section narrow form-stack">
      <div>
        <h1>Khai báo danh tính</h1>
        <p className="text-muted">Hồ sơ minh họa nghiệp vụ của Roomora.</p>
      </div>
      <p className="listing-privacy">
        Chỉ dùng dữ liệu giả. Đây là khai báo demo, chưa kết nối RAR/VNeID.
        Roomora không thu ảnh CCCD, ảnh khuôn mặt hoặc dữ liệu sinh trắc học
        trong luồng này.
      </p>
      {saved && (
        <p className="success-state" role="status">
          Đã nộp hồ sơ demo. Bạn có thể tiếp tục tạo/vào nhà chung hoặc gửi tin
          cho thuê.
        </p>
      )}
      {data === undefined ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <Form
          key={data.declaration?.version ?? 0}
          record={data.declaration}
          reload={reload}
          onSaved={() => setSaved(true)}
        />
      )}
    </section>
  );
}
export function IdentityForm() {
  return (
    <ListingAccess>
      <Workspace />
    </ListingAccess>
  );
}
