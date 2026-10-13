"use client";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { type AdminAction, type AdminPage } from "@/lib/admin";
import { Button, Card, Input } from "../ui";
import {
  AdminHistory,
  AdminPagination,
  AdminResult,
  useAdminPage,
} from "./admin-shared";
export function AdminAudit() {
  const [entity, setEntity] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useAdminPage<AdminPage<AdminAction>>(
    `/admin/audit?page=${page}${query ? `&entityId=${encodeURIComponent(query)}` : ""}`,
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(entity.trim());
    setPage(1);
  }
  return (
    <section className="admin-page">
      <h1>Nhật ký thao tác</h1>
      <p className="text-muted">
        Quyết định kiểm duyệt, khóa tài khoản, báo cáo, hỗ trợ và thông báo hệ
        thống. Lịch sử hoàn tiền nằm trong{" "}
        <Link href="/admin/hoan-tien">từng yêu cầu hoàn tiền</Link>.
      </p>
      <form className="admin-filters" onSubmit={submit}>
        <Input
          id="audit-entity"
          label="Mã đối tượng (UUID)"
          value={entity}
          maxLength={36}
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          onChange={(event) => setEntity(event.target.value)}
        />
        <Button type="submit">Lọc lịch sử</Button>
        <Button variant="secondary" onClick={reload}>
          Tải lại
        </Button>
      </form>
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <Card>
          <AdminHistory actions={data.items} showEntity />
          <AdminPagination page={page} pages={data.pages} onPage={setPage} />
        </Card>
      )}
    </section>
  );
}
