import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Response } from 'express';

export type MessageFiles = {
  images?: Express.Multer.File[];
  audio?: Express.Multer.File[];
  files?: Express.Multer.File[];
};

export async function prepareMessageMedia(
  text: string,
  files: MessageFiles = {},
) {
  const images = files.images ?? [],
    audio = files.audio ?? [],
    documents = files.files ?? [];
  if (!text && !images.length && !audio.length && !documents.length)
    throw new BadRequestException({ code: 'MESSAGE_EMPTY' });
  if (images.length > 4 || audio.length > 1 || documents.length > 4)
    throw new BadRequestException({ code: 'MESSAGE_MEDIA_LIMIT' });
  const hash = createHash('sha256').update(
    JSON.stringify({
      text: text,
      images: images.length,
      audio: audio.length,
      ...(documents.length ? { files: documents.length } : {}),
    }),
  );
  const attachments: Array<{
    kind: 'IMAGE' | 'AUDIO' | 'FILE';
    mimeType: string;
    byteSize: number;
    width?: number;
    height?: number;
    fileName?: string;
    data: Uint8Array<ArrayBuffer>;
  }> = [];
  for (const file of images) {
    hash.update(String(file.buffer.length)).update(':').update(file.buffer);
    attachments.push(await prepareImage(file));
  }
  for (const file of audio) {
    hash.update(String(file.buffer.length)).update(':').update(file.buffer);
    attachments.push(prepareAudio(file));
  }
  for (const file of documents) {
    if (!file.buffer?.length || file.buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException({ code: 'MESSAGE_FILE_SIZE' });
    // Multer decodes multipart filenames as latin1; browsers send UTF-8 bytes.
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalName = decoded.includes('\uFFFD')
      ? file.originalname
      : decoded;
    const baseName = originalName
      .split(/[\\/]/)
      .at(-1)!
      // Filenames must not contain control characters used in response headers.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    const fileName =
      Array.from(baseName).slice(0, 255).join('') || 'tep-dinh-kem';
    hash
      .update(JSON.stringify(fileName))
      .update(String(file.buffer.length))
      .update(':')
      .update(file.buffer);
    attachments.push({
      kind: 'FILE',
      mimeType: 'application/octet-stream',
      fileName,
      byteSize: file.buffer.length,
      data: Uint8Array.from(file.buffer),
    });
  }
  if (
    attachments.reduce((total, file) => total + file.byteSize, 0) >
    5 * 1024 * 1024
  )
    throw new BadRequestException({ code: 'MESSAGE_MEDIA_SIZE' });
  const contentHash = hash.digest('hex');

  return { contentHash, attachments };
}

export function sendMessageAttachment(
  response: Response,
  file: {
    data: Uint8Array;
    mimeType: string;
    kind: string;
    fileName: string | null;
  },
) {
  const downloadable = file.kind === 'FILE';
  response.set({
    'Content-Type': downloadable ? 'application/octet-stream' : file.mimeType,
    'Content-Length': String(file.data.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': downloadable
      ? `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.fileName ?? 'tep-dinh-kem').replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))}`
      : 'inline',
  });
  response.send(Buffer.from(file.data));
}

export async function prepareImage(file: Express.Multer.File) {
  if (!file.buffer?.length || file.size > 5 * 1024 * 1024)
    throw new BadRequestException({ code: 'MESSAGE_IMAGE_SIZE' });
  try {
    const source = sharp(file.buffer, {
      limitInputPixels: 25_000_000,
      failOn: 'warning',
    });
    const metadata = await source.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error('Invalid image');
    const data = await source
      .rotate()
      .resize(1600, 1200, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (data.length > 2 * 1024 * 1024) throw new Error('Image too large');
    const size = await sharp(data).metadata();
    return {
      kind: 'IMAGE' as const,
      mimeType: 'image/jpeg',
      byteSize: data.length,
      width: size.width,
      height: size.height,
      data: Uint8Array.from(data),
    };
  } catch {
    throw new BadRequestException({ code: 'MESSAGE_IMAGE_INVALID' });
  }
}
export function prepareAudio(file: Express.Multer.File) {
  if (!file.buffer?.length || file.size > 2 * 1024 * 1024)
    throw new BadRequestException({ code: 'MESSAGE_AUDIO_SIZE' });
  const mimeType = file.mimetype.split(';')[0].toLowerCase();
  const webm =
    mimeType === 'audio/webm' &&
    file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const mp4 =
    mimeType === 'audio/mp4' &&
    file.buffer.subarray(4, 8).toString() === 'ftyp';
  const ogg =
    mimeType === 'audio/ogg' &&
    file.buffer.subarray(0, 4).toString() === 'OggS';
  if (!webm && !mp4 && !ogg)
    throw new BadRequestException({ code: 'MESSAGE_AUDIO_INVALID' });
  return {
    kind: 'AUDIO' as const,
    mimeType,
    byteSize: file.size,
    data: Uint8Array.from(file.buffer),
  };
}
