"use client";
import { type FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import { adminError, reportReasons } from "@/lib/admin";
import { Button, ErrorState, Select, Textarea } from "../ui";

export function ReportListing({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await apiFetch(`/listings/${id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: data.get("reason"),
          details: data.get("details"),
        }),
      });
      setSent(true);
      setOpen(false);
    } catch (error) {
      setError(adminError(error));
    } finally {
      setPending(false);
    }
  }
  if (sent)
    return (
      <p className="success-state" role="status">
        Đã gửi báo cáo. Quản trị viên sẽ kiểm tra nội dung.
      </p>
    );
  return (
    <div className="listing-report-panel">
      <Button
        variant="secondary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Báo cáo tin đăng
      </Button>
      {open && (
        <form className="form-stack" onSubmit={submit}>
          <Select
            id="listing-report-reason"
            name="reason"
            label="Lý do báo cáo"
          >
            {Object.entries(reportReasons).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Textarea
            id="listing-report-details"
            name="details"
            label="Nội dung cần kiểm tra"
            required
            minLength={10}
            maxLength={1000}
            rows={4}
          />
          <Button type="submit" disabled={pending}>
            Gửi báo cáo
          </Button>
          {error && <ErrorState message={error} />}
        </form>
      )}
    </div>
  );
}
