"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Map, Marker } from "leaflet";
import { mapsKey, mapAttribution, mapTiles } from "@/lib/maps";
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
  const editable = Boolean(onChange);

  useEffect(() => () => window.clearTimeout(confirmationTimer.current), []);

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
    if (!mapsKey) return;
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
        const leaflet = await import("leaflet");
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

  const unavailable = !mapsKey || status === "error";
  return (
    <div className={`room-map${editable ? "" : " room-map-preview"}`}>
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
            {!mapsKey
              ? editable
                ? "Bản đồ chưa sẵn sàng. Bạn vẫn có thể lưu nháp và chọn vị trí sau."
                : "Bản đồ khu vực chưa sẵn sàng."
              : status === "error"
                ? "Không tải được bản đồ. Kiểm tra kết nối và tải lại trang để thử lại."
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
