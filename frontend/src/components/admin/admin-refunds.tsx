"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  billingError,
  billingPost,
  refundLabels,
  serviceDate,
  type RefundDetail,
  type RefundStatus,
  type ServiceRefund,
} from "@/lib/billing";
import { money } from "@/lib/listings";
import { Button, Card, ErrorState, Input, Select, Textarea } from "../ui";
import { AdminPagination, AdminResult, useAdminPage } from "./admin-shared";
import { RefundProof } from "../billing/refund-proof";
import {
  RefundAccountComparison,
  RefundCopyValue,
  RefundNoteOptions,
  RefundTransferSummary,
} from "./refund-review-tools";

function RefundDetailView({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const {
    data: refund,
    error: loadError,
    reload,
  } = useAdminPage<RefundDetail>(`/admin/refunds/${id}`);
  const [note, setNote] = useState(""),
    [evidence, setEvidence] = useState("");
  const [differentVersion, setDifferentVersion] = useState<number | null>(null);
  const [checkedVersion, setCheckedVersion] = useState<number | null>(null);
  const [noTransferVersion, setNoTransferVersion] = useState<number | null>(
    null,
  );
  const [reference, setReference] = useState(""),
    [transferredAt, setTransferredAt] = useState("");
  const [selectedProof, setSelectedProof] = useState("");
  const [recipientCheckVersion, setRecipientCheckVersion] = useState<
    number | null
  >(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function act(action: string, data: object = {}) {
    if (!refund || pending) return;
    setPending(true);
    setError("");
    try {
      await billingPost(
        `/admin/refunds/${id}/${action}`,
        {
          version: refund.version,
          ...(action === "reconcile" ? {} : { note }),
          ...data,
        },
        75000,
      );
      setCheckedVersion(null);
      setNoTransferVersion(null);
      setDifferentVersion(null);
      setRecipientCheckVersion(null);
      setNote("");
      reload();
      onChanged();
    } catch (error) {
      setError(billingError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  async function upload(file?: File) {
    if (!refund || !file || pending) return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("proof", file);
      form.set("version", String(refund.version));
      const updated = await apiFetch<RefundDetail>(
        `/admin/refunds/${id}/proofs`,
        {
          method: "POST",
          body: form,
        },
      );
      const added = updated.proofs.find(
        (item) => !refund.proofs.some((old) => old.id === item.id),
      );
      if (added) setSelectedProof(added.id);
      setCheckedVersion(null);
      reload();
      onChanged();
    } catch (error) {
      setError(billingError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  if (!refund) return <AdminResult error={loadError} reload={reload} />;
  const different = differentVersion === refund.version;
  const checked = checkedVersion === refund.version;
  const noTransfer = noTransferVersion === refund.version;
  const needsNote = note.trim().length < 10;
  const hasRecipient = !!(
    refund.bankId &&
    refund.bankName &&
    refund.accountNumber &&
    refund.accountName
  );
  const currentProofs = refund.proofs.filter(
    (item) =>
      refund.processingAt &&
      new Date(item.createdAt) >= new Date(refund.processingAt),
  );
  const originalReference = [
    refund.id,
    refund.orderId,
    refund.order.providerTransId,
  ].some(
    (value) => value && value.toUpperCase() === reference.trim().toUpperCase(),
  );
  const missingCompletion = [
    needsNote && "Chọn mẫu hoặc nhập ghi chú kiểm tra.",
    !currentProofs.some((item) => item.id === selectedProof) &&
      "Tải và chọn chứng từ của lần xử lý này.",
    (!/^[a-zA-Z0-9_:.-]{6,128}$/.test(reference.trim()) || originalReference) &&
      "Nhập mã giao dịch hoàn tiền trên chứng từ ngân hàng; không dùng mã đơn hoặc mã thu tiền gốc.",
    (!transferredAt || !Number.isFinite(new Date(transferredAt).getTime())) &&
      "Nhập thời điểm chuyển khoản trên chứng từ.",
    !checked && "Xác nhận đã đối chiếu giao dịch thực tế.",
  ].filter(Boolean);
  const step =
    refund.status === "PENDING"
      ? "Bước 1 · Xét duyệt yêu cầu"
      : refund.status === "APPROVED"
        ? refund.method === "MANUAL_BANK" && !refund.verifiedAt
          ? "Bước 2 · Xác minh tài khoản nhận"
          : "Bước 3 · Đối soát và bắt đầu xử lý"
        : refund.status === "PROCESSING"
          ? "Bước 4 · Đối chiếu kết quả hoàn tiền"
          : refundLabels[refund.status];
  return (
    <Card className="admin-refund-detail">
      <h2>
        {refund.order.planName} · {refundLabels[refund.status]}
      </h2>
      <p className="refund-step">{step}</p>
      <dl className="refund-facts">
        <div>
          <dt>Người mua / người yêu cầu</dt>
          <dd>
            {refund.order.buyerName} · {refund.order.buyerEmail}
          </dd>
        </div>
        <div>
          <dt>Đơn gốc</dt>
          <dd>
            <RefundCopyValue label="Mã đơn để tra cứu" value={refund.orderId} />
          </dd>
        </div>
        <div>
          <dt>Giao dịch thanh toán</dt>
          <dd>
            <RefundCopyValue
              label="Mã giao dịch thu tiền gốc"
              value={refund.order.providerTransId}
            />
          </dd>
        </div>
        <div>
          <dt>Đã thanh toán / đề nghị hoàn</dt>
          <dd>
            {money(refund.order.amount)} / {money(refund.amount)}
          </dd>
        </div>
        <div>
          <dt>Thanh toán thành công</dt>
          <dd>{refund.order.paidAt && serviceDate(refund.order.paidAt)}</dd>
        </div>
        <div>
          <dt>Gửi yêu cầu</dt>
          <dd>
            {serviceDate(refund.createdAt)} ·{" "}
            {refund.source === "SYSTEM" ? "Đối soát tự động" : "Người dùng"}
          </dd>
        </div>
        <div>
          <dt>Phương thức hoàn</dt>
          <dd>
            {refund.method === "MOMO"
              ? "MoMo sandbox · Về phương thức gốc"
              : "Chuyển khoản thủ công"}
          </dd>
        </div>
      </dl>
      <h3>Lý do yêu cầu</h3>
      <p>{refund.reason}</p>
      {refund.decisionNote && <p>Quyết định: {refund.decisionNote}</p>}
      {refund.lastError && <p className="text-danger">{refund.lastError}</p>}
      {refund.method === "MANUAL_BANK" && (
        <div className="service-notice">
          <h3>Đối chiếu tài khoản</h3>
          <RefundAccountComparison refund={refund} />
          {refund.bankName && (
            <p>Ngân hàng nhận khách cung cấp: {refund.bankName}</p>
          )}
          {refund.differentAccountReason && (
            <p>Lý do tài khoản khác: {refund.differentAccountReason}</p>
          )}
          <p>
            {refund.verifiedAt
              ? `Đã được ADMIN kiểm tra ${serviceDate(refund.verifiedAt)}: ${refund.verificationNote}`
              : "Cần kiểm tra thủ công với chứng từ gốc và xác minh chủ tài khoản. Trùng tên/số tài khoản không tự chứng minh quyền sở hữu."}
          </p>
          {refund.verificationReference && (
            <p>Căn cứ xác minh: {refund.verificationReference}</p>
          )}
        </div>
      )}
      {error && <ErrorState message={error} />}
      {!["COMPLETED", "REJECTED"].includes(refund.status) && (
        <div className="form-stack" aria-busy={pending}>
          {!(refund.status === "PROCESSING" && refund.method === "MOMO") && (
            <>
              <RefundNoteOptions
                refund={refund}
                note={note}
                disabled={pending}
                onChange={setNote}
              />
              <Textarea
                id="refund-admin-note"
                label="Kết quả kiểm tra / lý do thao tác"
                hint="Chọn mẫu để điền nhanh, sửa lại theo kết quả kiểm tra thực tế. Ghi chú cần ít nhất 10 ký tự; chọn mẫu chưa gửi quyết định."
                value={note}
                minLength={10}
                maxLength={1000}
                disabled={pending}
                onChange={(event) => setNote(event.target.value)}
              />
            </>
          )}
          {pending && (
            <p role="status" className="text-muted text-sm">
              Đang xử lý yêu cầu…
            </p>
          )}
          {refund.status === "PENDING" && (
            <div className="admin-actions">
              <Button
                disabled={pending || needsNote}
                onClick={() => void act("review", { decision: "APPROVED" })}
              >
                Phê duyệt yêu cầu
              </Button>
              <Button
                variant="secondary"
                disabled={pending || needsNote}
                onClick={() => void act("review", { decision: "REJECTED" })}
              >
                Từ chối yêu cầu
              </Button>
            </div>
          )}
          {refund.status === "APPROVED" && (
            <>
              <p>
                Phê duyệt chưa có nghĩa tiền đã hoàn. Chỉ bắt đầu sau khi đối
                soát giao dịch gốc chưa bị hoàn hoặc đảo.
              </p>
              {refund.method === "MANUAL_BANK" && !hasRecipient && (
                <p className="service-notice">
                  Chờ người dùng cung cấp đủ ngân hàng, số tài khoản và tên chủ
                  tài khoản. Thông tin sẽ tự cập nhật tại đây.
                </p>
              )}
              {refund.method === "MANUAL_BANK" &&
                hasRecipient &&
                !refund.verifiedAt && (
                  <>
                    <Select
                      id="refund-evidence-source"
                      label="Chọn căn cứ đã đối chiếu"
                      value={
                        refund.order.providerTransId &&
                        evidence ===
                          `Giao dịch gốc: ${refund.order.providerTransId}`
                          ? "original"
                          : "custom"
                      }
                      disabled={pending}
                      onChange={(event) =>
                        setEvidence(
                          event.target.value === "original"
                            ? `Giao dịch gốc: ${refund.order.providerTransId}`
                            : "",
                        )
                      }
                    >
                      <option value="custom">
                        Sao kê / chứng từ khác — nhập tham chiếu
                      </option>
                      {refund.order.providerTransId && (
                        <option value="original">
                          Giao dịch thu tiền gốc ·{" "}
                          {refund.order.providerTransId}
                        </option>
                      )}
                    </Select>
                    <Input
                      id="refund-recipient-evidence"
                      label="Tham chiếu chứng từ xác minh chủ tài khoản / đối chiếu giao dịch gốc"
                      value={evidence}
                      maxLength={200}
                      disabled={pending}
                      hint="Mã này giúp tra cứu căn cứ đã kiểm tra. Khi cổng thiếu dữ liệu người chuyển, cần thêm căn cứ xác minh chủ tài khoản trong ghi chú."
                      onChange={(event) => setEvidence(event.target.value)}
                    />
                    <label className="refund-check">
                      <input
                        type="checkbox"
                        disabled={pending}
                        checked={recipientCheckVersion === refund.version}
                        onChange={(event) =>
                          setRecipientCheckVersion(
                            event.target.checked ? refund.version : null,
                          )
                        }
                      />
                      Tôi đã đối chiếu giao dịch gốc và kiểm tra căn cứ xác minh
                      chủ tài khoản nhận tiền.
                    </label>
                    <label className="refund-check">
                      <input
                        type="checkbox"
                        checked={different}
                        disabled={pending}
                        onChange={(event) =>
                          setDifferentVersion(
                            event.target.checked ? refund.version : null,
                          )
                        }
                      />
                      Tôi đã kiểm tra bổ sung và chấp thuận tài khoản/tên khác
                      người chuyển gốc (nếu có).
                    </label>
                    <Button
                      variant="secondary"
                      disabled={
                        pending ||
                        needsNote ||
                        evidence.trim().length < 5 ||
                        recipientCheckVersion !== refund.version ||
                        !refund.accountNumber
                      }
                      onClick={() =>
                        void act("verify-recipient", {
                          evidenceReference: evidence,
                          differentAccountApproved: different,
                        })
                      }
                    >
                      Xác minh tài khoản nhận tiền
                    </Button>
                  </>
                )}
              <label className="refund-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending}
                  onChange={(event) =>
                    setCheckedVersion(
                      event.target.checked ? refund.version : null,
                    )
                  }
                />
                Đã đối soát giao dịch gốc chưa hoàn/đảo tiền; số tiền hoàn bằng
                đúng đơn gốc.
              </label>
              <div className="admin-actions">
                <Button
                  disabled={
                    pending ||
                    needsNote ||
                    !checked ||
                    (refund.method === "MANUAL_BANK"
                      ? !refund.verifiedAt
                      : !refund.gatewayAvailable)
                  }
                  onClick={() =>
                    void act("process", { originalUnrefunded: true })
                  }
                >
                  {refund.method === "MOMO"
                    ? "Gửi lệnh hoàn MoMo sandbox"
                    : "Bắt đầu xử lý chuyển khoản"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || needsNote}
                  onClick={() => void act("review", { decision: "REJECTED" })}
                >
                  Từ chối sau kiểm tra
                </Button>
              </div>
              {refund.method === "MOMO" && !refund.gatewayAvailable && (
                <p className="text-muted">
                  Chưa cấu hình merchant MoMo sandbox; yêu cầu vẫn được lưu để
                  xử lý sau.
                </p>
              )}
            </>
          )}
          {refund.status === "PROCESSING" && refund.method === "MOMO" && (
            <>
              <p>
                Chỉ đối soát mã hoàn hiện tại. Không gửi một lệnh hoàn khác khi
                chưa biết kết quả.
              </p>
              <Button disabled={pending} onClick={() => void act("reconcile")}>
                Đối soát kết quả MoMo
              </Button>
            </>
          )}
          {refund.status === "PROCESSING" &&
            refund.method === "MANUAL_BANK" && (
              <>
                <RefundTransferSummary refund={refund} />
                <p>
                  Chuyển khoản bên ngoài Roomora vào tài khoản đã xác minh, số
                  tiền {money(refund.amount)}. Sau đó tải ảnh chứng từ và kiểm
                  tra giao dịch ngân hàng trước khi xác nhận.
                </p>
                <label className="field">
                  Ảnh chứng từ chuyển khoản (JPG/PNG/WebP, tối đa 5 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={pending}
                    onChange={(event) => {
                      void upload(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <Select
                  id="refund-proof-choice"
                  label="Chứng từ dùng để xác nhận"
                  value={selectedProof}
                  disabled={pending}
                  onChange={(event) => setSelectedProof(event.target.value)}
                >
                  <option value="">Chọn chứng từ</option>
                  {currentProofs.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      Chứng từ {index + 1} · {serviceDate(item.createdAt)}
                    </option>
                  ))}
                </Select>
                <Input
                  id="refund-transfer-reference"
                  label="Mã giao dịch hoàn tiền do ngân hàng cấp"
                  hint="Lấy từ chi tiết chuyển khoản hoặc chứng từ; 6–128 ký tự, gồm chữ, số và _ : . -. Mã đơn, mã thu tiền gốc và nội dung chuyển khoản không thay thế mã này."
                  value={reference}
                  disabled={pending}
                  error={
                    originalReference
                      ? "Đây là mã yêu cầu/đơn/giao dịch thu tiền gốc. Cần mã của giao dịch hoàn tiền."
                      : undefined
                  }
                  maxLength={128}
                  onChange={(event) => setReference(event.target.value)}
                />
                <Input
                  id="refund-transfer-time"
                  label="Thời điểm chuyển khoản trên chứng từ"
                  type="datetime-local"
                  step={1}
                  value={transferredAt}
                  disabled={pending}
                  onChange={(event) => setTransferredAt(event.target.value)}
                />
                <label className="refund-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    onChange={(event) =>
                      setCheckedVersion(
                        event.target.checked ? refund.version : null,
                      )
                    }
                  />
                  Đã kiểm tra chứng từ/giao dịch thực tế, đúng người nhận, đúng{" "}
                  {money(refund.amount)} và chưa hoàn trước đó.
                </label>
                <Button
                  disabled={pending || missingCompletion.length > 0}
                  onClick={() =>
                    void act("complete", {
                      amount: refund.amount,
                      reference,
                      transferredAt: new Date(transferredAt).toISOString(),
                      proofId: selectedProof,
                      originalUnrefunded: true,
                    })
                  }
                >
                  Xác nhận đã hoàn tiền
                </Button>
                {missingCompletion.length > 0 && (
                  <div className="refund-missing" aria-live="polite">
                    <strong>Để xác nhận hoàn tiền:</strong>
                    <ul>
                      {missingCompletion.map((item) => (
                        <li key={String(item)}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <label className="refund-check">
                  <input
                    type="checkbox"
                    checked={noTransfer}
                    disabled={pending}
                    onChange={(event) =>
                      setNoTransferVersion(
                        event.target.checked ? refund.version : null,
                      )
                    }
                  />
                  Ngân hàng xác nhận không chuyển tiền; lỗi chắc chắn, không
                  phải chưa rõ kết quả.
                </label>
                <Button
                  variant="secondary"
                  disabled={pending || needsNote || !noTransfer}
                  onClick={() =>
                    void act("fail", { confirmedNoTransfer: true })
                  }
                >
                  Ghi nhận chuyển khoản thất bại
                </Button>
              </>
            )}
          {refund.status === "FAILED" && (
            <Button
              disabled={pending || needsNote}
              onClick={() => void act("retry")}
            >
              Duyệt xử lý lại mã hoàn hiện tại
            </Button>
          )}
        </div>
      )}
      {refund.status === "COMPLETED" && (
        <p className="success-state">
          Đã hoàn {money(refund.amount)} · {refund.refundReference} ·{" "}
          {refund.completedAt && serviceDate(refund.completedAt)}. Quyền lợi
          dịch vụ đã dừng.
        </p>
      )}
      {selectedProof && (
        <RefundProof
          key={selectedProof}
          path={`/admin/refunds/${id}/proofs/${selectedProof}`}
        />
      )}
      <h3>Chứng từ đã lưu</h3>
      <div className="admin-actions">
        {refund.proofs.map((item) => (
          <Button
            key={item.id}
            variant="secondary"
            onClick={() => setSelectedProof(item.id)}
          >
            Xem chứng từ {serviceDate(item.createdAt)}
          </Button>
        ))}
      </div>
      <h3>Lịch sử thao tác</h3>
      <ol className="refund-history">
        {refund.actions.map((item) => (
          <li key={item.id}>
            <strong>{item.actor?.profile?.displayName ?? "Hệ thống"}</strong> ·{" "}
            {serviceDate(item.createdAt)}
            <p>
              {item.fromStatus ? refundLabels[item.fromStatus] + " → " : ""}
              {refundLabels[item.toStatus]} · {item.note}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function AdminRefunds() {
  const [status, setStatus] = useState<RefundStatus | "all">("PENDING"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState("");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  const history = status === "COMPLETED";
  const { data, error, reload } = useAdminPage<{
    items: (ServiceRefund & {
      order: { buyerName: string; buyerEmail: string; planName: string };
    })[];
    total: number;
    pages: number;
  }>(
    `/admin/refunds?status=${status}&page=${page}&q=${encodeURIComponent(query)}`,
  );
  function filter(next: RefundStatus | "all") {
    setStatus(next);
    setPage(1);
    setSelected("");
  }
  useEffect(() => {
    const timer = setInterval(
      () => window.dispatchEvent(new Event("roomora:admin-change")),
      15000,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">ĐỐI SOÁT DỊCH VỤ</span>
          <h1>Hoàn tiền dịch vụ</h1>
          <p>
            Gửi trong 24 giờ từ thanh toán; xét duyệt có thể sau hạn. Phê duyệt
            và tiền thực nhận được theo dõi riêng.
          </p>
        </div>
      </div>
      <nav className="admin-actions" aria-label="Tra cứu hoàn tiền">
        <Button
          variant={status === "PENDING" ? "primary" : "secondary"}
          aria-pressed={status === "PENDING"}
          onClick={() => filter("PENDING")}
        >
          Chờ kiểm tra
        </Button>
        <Button
          variant={history ? "primary" : "secondary"}
          aria-pressed={history}
          onClick={() => filter("COMPLETED")}
        >
          Lịch sử đã hoàn tiền
        </Button>
        <Button
          variant={status === "all" ? "primary" : "secondary"}
          aria-pressed={status === "all"}
          onClick={() => filter("all")}
        >
          Tất cả yêu cầu
        </Button>
      </nav>
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
          setSelected("");
        }}
      >
        <Input
          id="refund-search"
          label="Tìm kiếm yêu cầu hoàn tiền"
          type="search"
          maxLength={100}
          value={search}
          placeholder="Tên, email, tài khoản, mã đơn hoặc giao dịch"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          id="refund-status-filter"
          label="Trạng thái yêu cầu"
          value={status}
          onChange={(event) => {
            filter(event.target.value as RefundStatus | "all");
          }}
        >
          <option value="all">Tất cả</option>
          {Object.entries(refundLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit">Tìm kiếm</Button>
        {(search || query) && (
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setQuery("");
              setPage(1);
              setSelected("");
            }}
          >
            Xóa tìm kiếm
          </Button>
        )}
      </form>
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <>
          <p role="status">
            {data.total} {history ? "giao dịch đã hoàn tiền" : "yêu cầu"}
            {query && ` · Tìm kiếm: ${query}`}
          </p>
          {data.total === 0 && (
            <p className="text-muted">
              {query
                ? "Không tìm thấy yêu cầu phù hợp với từ khóa và trạng thái đã chọn."
                : history
                  ? "Chưa có giao dịch hoàn tiền đã hoàn tất."
                  : "Không có yêu cầu ở trạng thái đã chọn."}
            </p>
          )}
          <div className="refund-list">
            {data.items.map((item) => (
              <button
                className="card refund-list-item"
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                <strong>
                  {item.order.buyerName} · {item.order.planName}
                </strong>
                <small>{item.order.buyerEmail}</small>
                <span>
                  {money(item.amount)} · {refundLabels[item.status]}
                </span>
                <small>
                  {history && item.completedAt
                    ? `Hoàn tiền: ${serviceDate(item.completedAt)}`
                    : `Gửi: ${serviceDate(item.createdAt)}`}
                </small>
                <small>Mã đơn: {item.orderId}</small>
                {item.refundReference && (
                  <small>Mã giao dịch hoàn: {item.refundReference}</small>
                )}
              </button>
            ))}
          </div>
          <AdminPagination page={page} pages={data.pages} onPage={setPage} />
        </>
      )}
      {selected && (
        <RefundDetailView key={selected} id={selected} onChanged={reload} />
      )}
    </section>
  );
}
