import { RoomMap } from "./room-map";

export function AreaMap({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  if (latitude === null || longitude === null)
    return <p className="text-muted">Chưa chọn vị trí khu vực.</p>;
  const center = `${latitude},${longitude}`;
  return (
    <div className="area-map">
      <RoomMap latitude={latitude} longitude={longitude} />
      <a
        className="text-link"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Mở bản đồ khu vực ↗
      </a>
    </div>
  );
}

