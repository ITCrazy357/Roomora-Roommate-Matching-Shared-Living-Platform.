"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { Button, ButtonLink, Card, ErrorState, LoadingState } from "../ui";
import { apiFetch } from "@/lib/api";
import {
  Listing,
  listingError,
  listingLocation,
  listingStatuses,
  money,
} from "@/lib/listings";
import { ListingEditorFields } from "./listing-editor-fields";
import {
  emptyForm,
  formFromListing,
  formInput,
  type ListingForm,
  type LocationUnit,
} from "@/lib/listing-form";

const steps = [
  "Loại tin",
  "Thông tin",
  "Chi phí & Vị trí",
  "Ảnh & Tiêu chí",
  "Xem trước",
];
export function ListingEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [provinces, setProvinces] = useState<LocationUnit[]>([]);
  const [wards, setWards] = useState<LocationUnit[]>([]);
  const [locationError, setLocationError] = useState("");
  const [retry, setRetry] = useState(0);
  const feedback = useRef<HTMLDivElement>(null);
  const submitted = listing?.status === "PENDING" && !dirty;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    apiFetch<Listing>(`/listings/mine/${id}`, { signal: controller.signal })
      .then((data) => {
        setListing(data);
        setForm(formFromListing(data));
        setLoaded(true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(listingError(error));
      });
    return () => controller.abort();
  }, [id, retry]);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<LocationUnit[]>("/locations/provinces", {
      signal: controller.signal,
    })
      .then(setProvinces)
      .catch(() => {
        if (!controller.signal.aborted)
          setLocationError(
            "Không tải được danh mục khu vực. Tải lại trang để thử lại.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!form.provinceCode) return;
    const controller = new AbortController();
    apiFetch<LocationUnit[]>(
      `/locations/provinces/${form.provinceCode}/wards`,
      {
        signal: controller.signal,
      },
    )
      .then(setWards)
      .catch(() => {
        if (!controller.signal.aborted)
          setLocationError(
            "Không tải được phường/xã. Tải lại trang để thử lại.",
          );
      });
    return () => controller.abort();
  }, [form.provinceCode]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (error || notice)
      feedback.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [error, notice]);

  function change<Key extends keyof ListingForm>(
    key: Key,
    value: ListingForm[Key],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setNotice("");
  }
  async function save(): Promise<Listing> {
    if (listing && !dirty) return listing;
    const saved = await apiFetch<Listing>(
      listing ? `/listings/${listing.id}` : "/listings",
      {
        method: listing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formInput(form),
          ...(listing ? { version: listing.version } : {}),
        }),
      },
    );
    setListing(saved);
    setForm({
      ...formFromListing(saved),
      // Keep the chosen pin in this editor; the server stores a rounded area.
      latitude: form.latitude,
      longitude: form.longitude,
    });
    setDirty(false);
    // Keep the saved draft in the URL so a reload can continue it.
    if (!listing && !id)
      window.history.replaceState(
        null,
        "",
        `/tin-cua-toi/${saved.id}/chinh-sua`,
      );
    return saved;
  }
  async function saveProgress(next = false, exit = false) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await save();
      setNotice("Đã lưu bản nháp trên máy chủ.");
      if (next) setStep((value) => Math.min(4, value + 1));
      if (exit) router.push("/tin-cua-toi");
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  async function submit() {
    if (pending || submitted) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const saved = await save();
      const sent = await apiFetch<Listing>(`/listings/${saved.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: saved.version }),
      });
      setListing(sent);
      setDirty(false);
      setNotice(
        "Đã gửi tin để duyệt. Tin sẽ hiển thị công khai sau khi admin duyệt.",
      );
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if ((listing?.photos.length ?? 0) + selected.length > 8) {
      setError("Mỗi tin có tối đa 8 ảnh.");
      return;
    }
    if (
      selected.some(
        (file) =>
          file.size > 5 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(file.type),
      )
    ) {
      setError("Chọn ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB.");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      let current = await save();
      for (const file of selected) {
        const body = new FormData();
        body.set("version", String(current.version));
        body.set("photo", file);
        current = await apiFetch<Listing>(`/listings/${current.id}/photos`, {
          method: "POST",
          body,
          timeoutMs: 60000,
        });
        setListing(current);
      }
      setNotice("Đã tải và lưu ảnh phòng. Ảnh đầu tiên là ảnh bìa.");
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  async function removePhoto(photoId: string) {
    setPending(true);
    setError("");
    try {
      const saved = await save();
      setListing(
        await apiFetch<Listing>(`/listings/${saved.id}/photos/${photoId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: saved.version }),
        }),
      );
      setNotice("Đã xóa ảnh.");
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  function selectLocation(latitude: number, longitude: number) {
    if (latitude < 8 || latitude > 24 || longitude < 102 || longitude > 110) {
      setError("Vui lòng chọn vị trí trong khu vực Việt Nam.");
      return;
    }
    setForm((previous) => ({
      ...previous,
      latitude: latitude.toString(),
      longitude: longitude.toString(),
    }));
    setDirty(true);
    setError("");
    setNotice("");
  }
  function locate() {
    if (!navigator.geolocation) {
      setError(
        "Trình duyệt không hỗ trợ xác định vị trí. Bạn có thể chọn trực tiếp trên bản đồ.",
      );
      return;
    }
    setPending(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectLocation(position.coords.latitude, position.coords.longitude);
        setPending(false);
      },
      () => {
        setError(
          "Không lấy được vị trí. Cho phép truy cập vị trí hoặc chọn trực tiếp trên bản đồ.",
        );
        setPending(false);
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  }

  if (!loaded)
    return (
      <section className="container page-section">
        {error ? (
          <ErrorState
            message={error}
            action={
              <Button
                onClick={() => {
                  setError("");
                  setRetry((value) => value + 1);
                }}
              >
                Thử lại
              </Button>
            }
          />
        ) : (
          <LoadingState />
        )}
      </section>
    );
  const preview: Listing | null = listing
    ? {
        ...listing,
        ...formInput(form),
        availableFrom: form.availableFrom || null,
        provinceName:
          provinces.find((item) => item.code === form.provinceCode)?.name ??
          listing.provinceName,
        wardName:
          wards.find((item) => item.code === form.wardCode)?.name ?? null,
      }
    : null;
  const messages = (
    <>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
    </>
  );

  return (
    <section className="container page-section listings-page">
      <div className="listing-page-heading">
        <div>
          <span className="eyebrow">CÓ PHÒNG, TÌM NGƯỜI Ở GHÉP</span>
          <h1>{id || listing ? "Chỉnh sửa tin đăng" : "Tạo tin đăng mới"}</h1>
          <p className="text-muted">
            Thông tin rõ ràng để tìm người cùng nhà phù hợp.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => saveProgress(false, true)}
        >
          Lưu bản nháp & Thoát
        </Button>
      </div>
      <Card className="listing-progress">
        <div>
          <h2>
            Bước {step + 1}: {steps[step]}
          </h2>
          <span className="text-muted">
            {listing ? listingStatuses[listing.status] : "Chưa lưu"}
            {dirty ? " · Có thay đổi chưa lưu" : ""}
          </span>
        </div>
        <progress value={step + 1} max={5} aria-label="Tiến độ đăng tin" />
        <ol>
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={pending}
                aria-current={step === index ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </Card>
      {step !== 4 && messages}
      {listing?.rejectionReason && (
        <ErrorState
          message={`Ghi chú kiểm duyệt: ${listing.rejectionReason}`}
        />
      )}
      {listing?.status === "PUBLISHED" && (
        <p className="listing-privacy">
          Lưu thay đổi hoặc tải/xóa ảnh sẽ đưa tin về bản nháp. Cần gửi duyệt
          lại để hiển thị công khai.
        </p>
      )}
      <div className="listing-editor-grid">
        <div>
          <form
            className="card listing-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 4) void submit();
              else void saveProgress(true);
            }}
          >
            <fieldset disabled={pending}>
              <legend className="visually-hidden">
                Nội dung bước {step + 1}
              </legend>
              <ListingEditorFields
                step={step}
                form={form}
                change={change}
                listing={listing}
                preview={preview}
                provinces={provinces}
                wards={wards}
                setWards={setWards}
                locationError={locationError}
                pending={pending}
                locate={locate}
                selectLocation={selectLocation}
                upload={upload}
                removePhoto={removePhoto}
              />
            </fieldset>
            {step === 4 && <div ref={feedback}>{messages}</div>}
            <div className="listing-editor-actions">
              <Button
                variant="secondary"
                disabled={pending || step === 0}
                onClick={() => setStep((value) => value - 1)}
              >
                ← Quay lại
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => saveProgress()}
              >
                Lưu bản nháp
              </Button>
              <Button
                type="submit"
                disabled={pending || (step === 4 && submitted)}
              >
                {pending
                  ? step === 4
                    ? "Đang gửi duyệt…"
                    : "Đang lưu…"
                  : step === 4
                    ? submitted
                      ? "Đã gửi duyệt"
                      : "Gửi duyệt"
                    : "Tiếp tục →"}
              </Button>
            </div>
          </form>
        </div>
        <aside className="listing-editor-summary">
          <Card>
            <span className="eyebrow">TÓM TẮT TIN ĐĂNG</span>
            <h2>{form.title || "Căn phòng của bạn"}</h2>
            <dl className="listing-costs">
              <div>
                <dt>Giá thuê / tháng</dt>
                <dd>{money(form.rent ? Number(form.rent) : null)}</dd>
              </div>
              <div>
                <dt>Diện tích</dt>
                <dd>{form.area || "—"} m²</dd>
              </div>
              <div>
                <dt>Ảnh đã lưu</dt>
                <dd>{listing?.photos.length ?? 0} / 8</dd>
              </div>
              <div>
                <dt>Khu vực</dt>
                <dd>{preview ? listingLocation(preview) : "Chưa chọn"}</dd>
              </div>
            </dl>
            <p className="text-muted">
              {dirty
                ? "Có thay đổi chưa lưu."
                : listing
                  ? `Đã lưu lúc ${new Date(listing.updatedAt).toLocaleTimeString("vi-VN")}.`
                  : "Bấm lưu bản nháp để tiếp tục sau."}
            </p>
          </Card>
          <Card>
            <h3>Mẹo tìm người cùng nhà</h3>
            <p className="text-muted">
              Ảnh sáng rõ, chi phí đầy đủ và mô tả nếp sinh hoạt giúp người xem
              cân nhắc đúng nhu cầu.
            </p>
            <ButtonLink href="/tin-cua-toi" variant="secondary">
              Tin của tôi
            </ButtonLink>
          </Card>
          <p className="text-muted text-sm">Người đăng: {user?.displayName}</p>
        </aside>
      </div>
    </section>
  );
}
