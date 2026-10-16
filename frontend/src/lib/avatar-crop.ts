export const AVATAR_SIZE = 640;
export const MAX_AVATAR_PIXELS = 25_000_000;

export interface AvatarCrop {
  zoom: number;
  rotation: number;
  x: number;
  y: number;
}

export const initialAvatarCrop: AvatarCrop = {
  zoom: 1,
  rotation: 0,
  x: 0,
  y: 0,
};

// Positions are fractions of the square frame, independent of screen size.
export function avatarGeometry(
  width: number,
  height: number,
  crop: AvatarCrop,
) {
  const sideways = crop.rotation % 180 !== 0;
  const rotatedWidth = sideways ? height : width;
  const rotatedHeight = sideways ? width : height;
  const zoom = Math.max(1, Math.min(4, crop.zoom));
  const scale = zoom / Math.min(rotatedWidth, rotatedHeight);
  const limitX = Math.max(0, (rotatedWidth * scale - 1) / 2);
  const limitY = Math.max(0, (rotatedHeight * scale - 1) / 2);
  return {
    scale,
    zoom,
    x: Math.max(-limitX, Math.min(limitX, crop.x)),
    y: Math.max(-limitY, Math.min(limitY, crop.y)),
  };
}

export function drawAvatar(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: AvatarCrop,
) {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Trình duyệt không hỗ trợ chỉnh ảnh. Hãy thử trình duyệt khác.",
    );
  const geometry = avatarGeometry(
    image.naturalWidth,
    image.naturalHeight,
    crop,
  );
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  // Match the backend's background when flattening transparent images.
  context.fillStyle = "#f8f7f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(
    canvas.width * (0.5 + geometry.x),
    canvas.height * (0.5 + geometry.y),
  );
  context.rotate((crop.rotation * Math.PI) / 180);
  context.scale(geometry.scale * canvas.width, geometry.scale * canvas.height);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}

export async function exportAvatar(image: HTMLImageElement, crop: AvatarCrop) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  drawAvatar(canvas, image, crop);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Không thể xử lý ảnh. Hãy thử lại.")),
      "image/jpeg",
      0.9,
    ),
  );
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

export async function validAvatarBytes(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, i) => bytes[i] === value,
    ) ||
    (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
  );
}
