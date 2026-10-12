"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import {
  billingError,
  billingPost,
  paymentLabels,
  type BoostListing,
  type ServiceCatalog,
  type ServiceOrder,
  type ServiceOrderPage,
} from "@/lib/billing";
import { money } from "@/lib/listings";
import { ProfileIcon } from "../profile-icon";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
} from "../ui";
import { Pagination } from "../communications/pagination";
import { useUpdates } from "../communications/updates-provider";
import { ServiceAccess } from "./service-access";
import { ServiceOrderCard } from "./service-order-card";

type Tab = "plans" | "services" | "history";
export function Services({
  initialTab = "plans",
  initialListing = "",
}: {
  initialTab?: Tab;
  initialListing?: string;
}) {
  return (
    <ServiceAccess>
      <ServicesContent
        initialTab={initialTab}
        initialListing={initialListing}
      />
    </ServiceAccess>
  );
}

function ServicesContent({
  initialTab,
  initialListing,
}: {
  initialTab: Tab;
  initialListing: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab),
    [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null),
    [listings, setListings] = useState<BoostListing[]>([]);
  const [orders, setOrders] = useState<ServiceOrderPage | null>(null),
    [listingId, setListingId] = useState(initialListing);
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [retry, setRetry] = useState(0);
  const purchase = useRef<{ listingId: string; clientId: string } | null>(null);
  const { revision } = useUpdates();
  const reload = () => setRetry((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch<ServiceCatalog>("/services/catalog", {
        signal: controller.signal,
      }),
      apiFetch<BoostListing[]>("/services/listings", {
        signal: controller.signal,
      }),
      apiFetch<ServiceOrderPage>(
        `/services/orders?page=${page}&kind=${tab === "services" ? "boosts" : "all"}`,
        { signal: controller.signal, timeoutMs: 60000 },
      ),
    ])
      .then(([catalog, listings, orders]) => {
        setCatalog(catalog);
        setListings(
          listings.map((listing) => ({
            ...listing,
            paymentCompleted:
              listing.paymentCompleted ||
              orders.items.some(
                (order) =>
                  order.status === "PAID" &&
                  order.listingId === listing.id &&
                  order.postingRound === listing.postingRound,
              ),
          })),
        );
        setOrders(orders);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(billingError(error));
      });
    return () => controller.abort();
  }, [page, retry, tab, revision]);
  useEffect(() => {
    const timer = setInterval(reload, 30000);
    return () => clearInterval(timer);
  }, []);
  async function buy(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !listingId) return;
    if (purchase.current?.listingId !== listingId)
      purchase.current = { listingId, clientId: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const order = await billingPost<ServiceOrder>(
        "/services/orders",
        purchase.current,
      );
      setTab("history");
      setPage(1);
      reload();
      if (order.status !== "PENDING") {
        purchase.current = null;
        return;
      }
      const result = await billingPost<{ payUrl: string }>(
        `/services/orders/${order.id}/checkout`,
      );
      window.location.assign(result.payUrl);
    } catch (error) {
      if (
        error instanceof ApiError &&
        ["ORDER_CANCELLED", "ORDER_NOT_PENDING"].includes(error.code ?? "")
      )
        purchase.current = null;
      setError(billingError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  const tabs: [Tab, string][] = [
    ["plans", "Gói dịch vụ"],
    ["services", "Dịch vụ của tôi"],
    ["history", "Lịch sử & hoàn tiền"],
  ];
  return (
    <section className="container page-section services-page">
      <div className="service-hero">
        <div>
          <span className="content-label">
            Dịch vụ Roomora
            {catalog ? ` · ${paymentLabels[catalog.provider]}` : ""}
          </span>
          <h1>
            Để tin của bạn
            <br />
            <span>được nhìn thấy nhiều hơn.</span>
          </h1>
          <p>
            Ưu tiên hiển thị có thời hạn, rõ giá và rõ quyền lợi. Bạn quyết định
            khi nào cần nâng cấp.
          </p>
        </div>
        <div className="service-hero-mark" aria-hidden="true">
          <ProfileIcon name="arrow" />
        </div>
      </div>
      <div className="service-notice">
        <strong>
          {!catalog
            ? "Đang kiểm tra cổng thanh toán…"
            : catalog.sandbox
              ? "Thanh toán thử nghiệm · Không thu tiền thật"
              : "PayOS · Thanh toán bằng tiền thật"}
        </strong>
        <p>
          Gói chỉ tăng hiển thị, không bảo đảm tìm được người thuê hoặc ở ghép.
          Tin trả phí luôn có nhãn “Được tài trợ”. Công nợ nhà chung và tiền
          thuê phòng được quản lý riêng.
        </p>
      </div>
      <nav className="service-tabs" aria-label="Dịch vụ Roomora">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            variant="secondary"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => {
              setTab(key);
              setPage(1);
              setError("");
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      {error && (
        <ErrorState
          message={error}
          action={
            <Button
              onClick={() => {
                setError("");
                reload();
              }}
            >
              Thử lại
            </Button>
          }
        />
      )}
      {!catalog ? (
        <LoadingState />
      ) : (
        <>
          {!catalog.paymentAvailable && (
            <div className="service-notice">
              <strong>Thanh toán chưa sẵn sàng</strong>
              <p>
                Gói dịch vụ và lịch sử vẫn xem được. Liên kết thanh toán sẽ khả
                dụng khi cổng thanh toán được cấu hình.
              </p>
            </div>
          )}
          {tab === "plans" && (
            <>
              <div className="service-plans">
                <Card className="service-plan">
                  <span className="content-label">Dùng hằng ngày</span>
                  <h2>Kết nối & chung nhà</h2>
                  <p className="service-price">Miễn phí</p>
                  <p>
                    Tìm chỗ ở, trò chuyện và quản lý sinh hoạt chung với những
                    tính năng hiện có.
                  </p>
                  <ul>
                    <li>Khám phá tin đăng và tìm người ở ghép</li>
                    <li>Kết nối, nhắn tin và hẹn xem phòng</li>
                    <li>Việc nhà, khoản chi và công nợ</li>
                  </ul>
                  <ButtonLink variant="secondary" href="/tim-phong">
                    Khám phá phòng
                  </ButtonLink>
                </Card>
                <Card className="service-plan service-plan-featured">
                  <span className="content-label">Ưu tiên hiển thị</span>
                  <h2>{catalog.plan.name}</h2>
                  <p className="service-price">
                    {money(catalog.plan.amount)}{" "}
                    <small>/ {catalog.plan.durationDays} ngày</small>
                  </p>
                  <p>
                    Đưa tin lên trước các tin thường khi xem danh sách theo “Mới
                    nhất”.
                  </p>
                  <ul>
                    <li>Áp dụng bộ lọc khu vực, loại tin và ngân sách</li>
                    <li>Nhãn “Được tài trợ” trên thẻ và chi tiết</li>
                    <li>Đủ thời hạn từ lúc được cấp quyền lợi</li>
                    <li>Biên nhận PDF cho mỗi thanh toán thành công</li>
                  </ul>
                  <form onSubmit={(event) => void buy(event)}>
                    <Select
                      id="boost-listing"
                      label="Chọn tin đang công khai"
                      value={listingId}
                      required
                      onChange={(event) => setListingId(event.target.value)}
                    >
                      <option value="">Chọn tin của bạn</option>
                      {listings.map((listing) => (
                        <option
                          key={listing.id}
                          value={listing.id}
                          disabled={listing.paymentCompleted}
                        >
                          {listing.title}
                          {listing.paymentCompleted ? " · Đã thanh toán" : ""}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="submit"
                      disabled={
                        pending ||
                        !catalog.paymentAvailable ||
                        !listings.some(
                          (listing) =>
                            listing.id === listingId &&
                            !listing.paymentCompleted,
                        )
                      }
                    >
                      {pending
                        ? "Đang tạo thanh toán…"
                        : `Chọn tin & thanh toán ${paymentLabels[catalog.provider]}`}
                    </Button>
                  </form>
                  {listings.length > 0 &&
                    listings.every((listing) => listing.paymentCompleted) && (
                      <p className="text-muted">
                        Các tin hiện tại đã thanh toán. Mỗi đợt đăng chỉ thanh
                        toán một lần; xem quyền lợi trong Dịch vụ của tôi.
                      </p>
                    )}
                  {!listings.length && (
                    <p className="text-muted">
                      Cần có tin đang công khai và còn nhận người.{" "}
                      <Link className="text-link" href="/tin-cua-toi">
                        Xem tin của tôi →
                      </Link>
                    </p>
                  )}
                </Card>
              </div>
              <Card className="service-faq">
                <h2>Trước khi nâng cấp</h2>
                <div>
                  <section>
                    <h3>Gói bắt đầu khi nào?</h3>
                    <p>
                      Cổng thanh toán xác nhận qua máy chủ thì gói mới được cấp.
                      Mỗi tin chỉ thanh toán một lần trong cùng đợt đăng, kể cả
                      khi gói đã hết hạn. Không tự gia hạn hoặc trừ tiền.
                    </p>
                  </section>
                  <section>
                    <h3>Đóng hoặc sửa tin thì sao?</h3>
                    <p>
                      Tin chỉ được ưu tiên khi công khai và còn nhận người. Thời
                      hạn vẫn chạy khi đã đủ hoặc chờ duyệt lại. Đóng tin kết
                      thúc đợt đăng; đăng lại bắt đầu đợt mới.
                    </p>
                  </section>
                  <section>
                    <h3>Cần hoàn tiền?</h3>
                    <p>
                      Gửi lý do trong lịch sử thanh toán trong 24 giờ kể từ
                      thanh toán thành công. Yêu cầu được kiểm tra trước khi xử
                      lý; gửi yêu cầu chưa có nghĩa là đã hoàn tiền.
                    </p>
                  </section>
                  <section>
                    <h3>Thanh toán đến chậm?</h3>
                    <p>
                      Đơn hết thời gian chờ vẫn được ghi nhận nếu cổng thanh
                      toán xác nhận thành công sau đó. Tin không còn đủ điều
                      kiện sẽ có yêu cầu hoàn tiền để kiểm tra.
                    </p>
                  </section>
                </div>
              </Card>
            </>
          )}
          {tab !== "plans" &&
            (!orders ? (
              <LoadingState />
            ) : (
              <div className="service-order-list">
                <div className="service-section-heading">
                  <h2>
                    {tab === "services"
                      ? "Quyền lợi đã mua"
                      : "Lịch sử thanh toán"}
                  </h2>
                  <Button variant="secondary" onClick={reload}>
                    Cập nhật
                  </Button>
                </div>
                <p className="text-muted">
                  {tab === "services"
                    ? `${orders.total} quyền lợi đã mua · Thời gian hiển thị theo UTC+7`
                    : `${orders.total} đơn hàng · Thời gian hiển thị theo UTC+7`}
                </p>
                {orders.items.map((order) => (
                  <ServiceOrderCard
                    key={order.id}
                    order={order}
                    reload={reload}
                    paymentAvailable={catalog.providers[order.provider]}
                    retryAvailable={
                      catalog.paymentAvailable &&
                      listings.some(
                        (listing) =>
                          listing.id === order.listingId &&
                          !listing.paymentCompleted,
                      )
                    }
                  />
                ))}
                {!orders.items.length && (
                  <EmptyState
                    title={
                      tab === "services"
                        ? "Chưa có quyền lợi đã mua"
                        : "Chưa có giao dịch"
                    }
                  >
                    <p>Chọn tin và gói dịch vụ khi bạn cần tăng hiển thị.</p>
                  </EmptyState>
                )}
                <Pagination
                  page={page}
                  pages={orders.pages}
                  onChange={setPage}
                />
              </div>
            ))}
        </>
      )}
    </section>
  );
}
