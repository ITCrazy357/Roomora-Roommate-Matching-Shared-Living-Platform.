"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Map, Marker } from "leaflet";
import { mapAttribution, mapTiles } from "@/lib/maps";
import { apiFetch } from "@/lib/api";
import { Button } from "../ui";

interface Props {
  latitude: number | null;
  longitude: number | null;
  disabled?: boolean;
  onChange?: (latitude: number, longitude: number) => void;
}

export function RoomMap({
  latitude,
  longitude,
  disabled = false,
  onChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const marker = useRef<Marker | null>(null);
  const userMoved = useRef(false);
  const syncing = useRef(false);
  const confirmationTimer = useRef<number | undefined>(undefined);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<
    { name: string; latitude: number; longitude: number }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const searchRequest = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const manualLatitude = useRef<HTMLInputElement>(null);
  const manualLongitude = useRef<HTMLInputElement>(null);
  const editable = Boolean(onChange);

  useEffect(() => () => window.clearTimeout(confirmationTimer.current), []);
  useEffect(() => () => searchRequest.current?.abort(), []);
  useEffect(
    () => () => {
      locationRequest.current += 1;
    },
    [],
  );

  function locate() {
    if (disabled || locating) return;
    if (!navigator.geolocation) {
      setMessage(
        "Trình duyệt không hỗ trợ định vị. Kéo bản đồ hoặc nhập tọa độ thủ công.",
      );
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        selectPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        setMessage(
          error.code === 1
            ? "Bạn đã từ chối quyền vị trí. Kéo bản đồ hoặc nhập tọa độ thủ công."
            : "Chưa lấy được vị trí. Thử lại hoặc chọn tọa độ thủ công.",
        );
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  }

  useEffect(() => {
    const resize = requestAnimationFrame(() => map.current?.invalidateSize());
    if (!expanded) return () => cancelAnimationFrame(resize);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restoreFocus = expandButton.current;
    restoreFocus?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]',
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length && !element.closest("[inert]"),
      );
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      const edge = event.shiftKey ? controls[0] : controls.at(-1);
      if (
        document.activeElement === edge ||
        !root.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        target?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(resize);
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = overflow;
      restoreFocus?.focus();
    };
  }, [expanded]);

  async function search() {
    if (query.trim().length < 2 || disabled) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setPlaces([]);
    setSearchMessage("");
    try {
      const results = await apiFetch<typeof places>(
        `/locations/map/search?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal, timeoutMs: 10000 },
      );
      if (controller.signal.aborted) return;
      setPlaces(results);
      if (!results.length)
        setSearchMessage(
          "Không tìm thấy địa điểm. Thử tên khu vực khác hoặc chọn vị trí thủ công.",
        );
    } catch {
      if (!controller.signal.aborted)
        setSearchMessage(
          "Chưa tìm được địa điểm. Bạn vẫn có thể kéo bản đồ, định vị hoặc nhập tọa độ.",
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  const currentPosition = useEffectEvent(() =>
    latitude === null || longitude === null
      ? null
      : { lat: latitude, lng: longitude },
  );
  function selectPosition(position: { lat: number; lng: number }) {
    if (disabled || !onChange) return false;
    setConfirmed(false);
    if (
      position.lat < 8 ||
      position.lat > 24 ||
      position.lng < 102 ||
      position.lng > 110
    ) {
      setMessage("Vui lòng chọn vị trí trong khu vực Việt Nam.");
      return false;
    }
    setMessage("");
    if (
      latitude !== null &&
      longitude !== null &&
      Math.abs(position.lat - latitude) < 0.0000001 &&
      Math.abs(position.lng - longitude) < 0.0000001
    )
      return true;
    onChange(position.lat, position.lng);
    return true;
  }
  const selectFromMap = useEffectEvent(selectPosition);

  useEffect(() => {
    let active = true;
    let view: Map | undefined;
    let timeout: number | undefined;
    const fail = () => {
      if (active) setStatus("error");
    };
    const startLoading = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(fail, 20000);
    };

    async function openMap() {
      startLoading();
      try {
        // Leaflet uses window, so load it only in the browser.
        const [leaflet, configuration] = await Promise.all([
          import("leaflet"),
          apiFetch<{ available: boolean }>("/locations/map/config"),
        ]);
        if (!configuration.available) {
          window.clearTimeout(timeout);
          fail();
          return;
        }
        if (!active || !container.current) return;
        const position = currentPosition();
        view = leaflet.map(container.current, {
          center: position ?? [16.05, 108.2],
          zoom: position ? 14 : 6,
          minZoom: 5,
          maxZoom: 20,
          maxBounds: [
            [8, 102],
            [24, 110],
          ],
          maxBoundsViscosity: 1,
          scrollWheelZoom: "center",
          touchZoom: "center",
          doubleClickZoom: "center",
        });
        if (editable) {
          view.on("click", (event) => selectFromMap(event.latlng));
          view.on("dragstart", () => {
            if (!syncing.current) userMoved.current = true;
          });
          view.on("moveend", () => {
            if (!userMoved.current || syncing.current) return;
            userMoved.current = false;
            selectFromMap(view!.getCenter());
          });
        } else {
          const icon = leaflet.divIcon({
            className: "room-map-marker",
            html: '<span class="room-map-pin"></span>',
            iconSize: [32, 40],
            iconAnchor: [16, 40],
          });
          marker.current = leaflet.marker(position ?? [16.05, 108.2], {
            icon,
            title: "Vị trí khu vực gần phòng",
            alt: "Ghim vị trí phòng",
          });
          if (position) marker.current.addTo(view);
        }
        map.current = view;
        let tileLoaded = false;
        const tiles = leaflet.tileLayer(mapTiles(leaflet.Browser.retina), {
          attribution: mapAttribution,
          maxZoom: 20,
          updateWhenIdle: true,
          keepBuffer: 1,
          noWrap: true,
        });
        tiles.on("loading", () => {
          tileLoaded = false;
          startLoading();
        });
        tiles.on("tileload", () => {
          tileLoaded = true;
          window.clearTimeout(timeout);
          if (active) setStatus("ready");
        });
        tiles.on("load", () => {
          window.clearTimeout(timeout);
          if (!tileLoaded) fail();
        });
        tiles.addTo(view);
      } catch {
        window.clearTimeout(timeout);
        fail();
      }
    }
    void openMap();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      view?.remove();
      map.current = null;
      marker.current = null;
      userMoved.current = false;
    };
  }, [editable]);

  useEffect(() => {
    if (!map.current || status !== "ready") return;
    const view = map.current;
    const pin = marker.current;
    if (latitude === null || longitude === null) {
      pin?.remove();
    } else {
      const position = { lat: latitude, lng: longitude };
      pin?.setLatLng(position).addTo(view);
      if (!view.getCenter().equals(position, 0.0000001)) {
        // Restoring or saving a position must not mark the form as changed.
        syncing.current = true;
        userMoved.current = false;
        view.setView(position, Math.max(view.getZoom(), 14), {
          animate: false,
        });
        syncing.current = false;
      }
    }
  }, [latitude, longitude, status]);

  const unavailable = status === "error";
  return (
    <div
      ref={root}
      className={`room-map${editable ? "" : " room-map-preview"}${expanded ? " room-map-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "Chọn vị trí trên bản đồ mở rộng" : undefined}
    >
      <div className="room-map-tools">
        <button
          ref={expandButton}
          type="button"
          className="button button-secondary"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Thu gọn bản đồ" : "Mở rộng bản đồ"}
        </button>
        {editable && (
          <Button
            variant="secondary"
            onClick={locate}
            disabled={disabled || locating}
          >
            {locating ? "Đang định vị…" : "Lấy vị trí hiện tại"}
          </Button>
        )}
      </div>
      {editable && (
        <div className="room-map-search">
          <label>
            Tìm địa điểm hoặc khu vực
            <input
              value={query}
              maxLength={200}
              disabled={disabled}
              placeholder="Ví dụ: Cầu Giấy, Hà Nội"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => void search()}
            disabled={disabled || searching || query.trim().length < 2}
          >
            {searching ? "Đang tìm…" : "Tìm địa điểm"}
          </Button>
        </div>
      )}
      {places.length > 0 && (
        <ul className="room-map-results" aria-label="Kết quả tìm địa điểm">
          {places.map((place, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  selectPosition({ lat: place.latitude, lng: place.longitude });
                  map.current?.setView([place.latitude, place.longitude], 14);
                  setPlaces([]);
                  setSearchMessage(
                    "Đã chọn địa điểm. Kéo bản đồ để điều chỉnh ghim nếu cần.",
                  );
                }}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchMessage && (
        <p className="text-muted" role="status">
          {searchMessage}
        </p>
      )}
      <div
        className="room-map-frame"
        aria-busy={!unavailable && status === "loading"}
      >
        <div
          ref={container}
          className="room-map-canvas"
          role="region"
          aria-label={
            editable ? "Bản đồ chọn vị trí phòng" : "Bản đồ khu vực gần phòng"
          }
          inert={disabled || unavailable || status === "loading"}
          onKeyDownCapture={(event) => {
            if (editable && !disabled && event.key.startsWith("Arrow"))
              userMoved.current = true;
          }}
        />
        {editable && !unavailable && status === "ready" && (
          <svg
            className="room-map-center-pin"
            viewBox="0 0 32 40"
            aria-hidden="true"
          >
            <path d="M16 1C7.7 1 1 7.7 1 16c0 10 15 24 15 24s15-14 15-24C31 7.7 24.3 1 16 1Z" />
            <circle cx="16" cy="15" r="5" />
          </svg>
        )}
        {(unavailable || status === "loading") && (
          <p
            className="room-map-message"
            role={unavailable ? "alert" : "status"}
          >
            {status === "error"
              ? editable
                ? "Không tải được bản đồ. Bạn có thể định vị hoặc nhập tọa độ thủ công bên dưới."
                : "Không tải được bản đồ khu vực. Thử tải lại trang sau."
              : "Đang tải bản đồ…"}
          </p>
        )}
      </div>
      {editable && (
        <>
          <Button
            variant="secondary"
            disabled={disabled || unavailable || status !== "ready"}
            onClick={() => {
              const position = map.current?.getCenter();
              if (!position || !selectPosition(position)) return;
              setConfirmed(true);
              window.clearTimeout(confirmationTimer.current);
              confirmationTimer.current = window.setTimeout(
                () => setConfirmed(false),
                4000,
              );
            }}
          >
            Chọn vị trí tại tâm
          </Button>
          {confirmed && latitude !== null && longitude !== null && (
            <p className="success-state" role="status">
              Đã chọn vị trí tại tâm bản đồ.
            </p>
          )}
          {message && (
            <p className="text-danger" role="alert">
              {message}
            </p>
          )}
          <p className="text-muted" role="status">
            {latitude === null || longitude === null
              ? "Chưa chọn vị trí. Kéo bản đồ hoặc bấm “Chọn vị trí tại tâm”."
              : "Đã chọn vị trí tại ghim giữa bản đồ. Kéo bản đồ để thay đổi."}
          </p>
          {latitude !== null && longitude !== null && (
            <p className="text-muted">
              Tọa độ đã chọn: {latitude.toFixed(5)}, {longitude.toFixed(5)}.
            </p>
          )}
          <details className="room-map-manual">
            <summary>Nhập tọa độ thủ công</summary>
            <div className="form-grid" key={`${latitude}:${longitude}`}>
              <label>
                Vĩ độ
                <input
                  ref={manualLatitude}
                  type="number"
                  min={8}
                  max={24}
                  step="any"
                  defaultValue={latitude ?? ""}
                  disabled={disabled}
                />
              </label>
              <label>
                Kinh độ
                <input
                  ref={manualLongitude}
                  type="number"
                  min={102}
                  max={110}
                  step="any"
                  defaultValue={longitude ?? ""}
                  disabled={disabled}
                />
              </label>
            </div>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                const lat = manualLatitude.current?.value ?? "",
                  lng = manualLongitude.current?.value ?? "";
                if (
                  !lat ||
                  !lng ||
                  !Number.isFinite(Number(lat)) ||
                  !Number.isFinite(Number(lng))
                ) {
                  setMessage("Nhập đầy đủ vĩ độ và kinh độ hợp lệ.");
                  return;
                }
                selectPosition({ lat: Number(lat), lng: Number(lng) });
              }}
            >
              Áp dụng tọa độ
            </Button>
          </details>
          <p className="text-muted">
            Ghim luôn nằm ở giữa. Dùng chuột, cảm ứng hoặc phím mũi tên để di
            chuyển bản đồ. Lăn chuột, chụm/tách hai ngón tay hoặc dùng +/− để
            phóng to hay thu nhỏ.
          </p>
        </>
      )}
    </div>
  );
}
