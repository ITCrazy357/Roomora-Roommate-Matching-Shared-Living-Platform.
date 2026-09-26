import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export interface UploadedAvatar {
  publicId: string;
  secureUrl: string;
}

/** Avatar-only adapter. Credentials and signing stay on the API server. */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly credentials: {
    cloud_name: string;
    api_key: string;
    api_secret: string;
  };

  constructor(config: ConfigService) {
    this.credentials = {
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '',
      api_key: config.get<string>('CLOUDINARY_API_KEY') ?? '',
      api_secret: config.get<string>('CLOUDINARY_API_SECRET') ?? '',
    };
  }

  async uploadAvatar(
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadedAvatar> {
    if (!file?.buffer?.length || file.buffer.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException({
        code: 'AVATAR_SIZE_INVALID',
        message: 'Ảnh phải nhỏ hơn hoặc bằng 5 MB',
      });
    }
    let buffer: Buffer;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 25_000_000,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      // Decode actual bytes, not filename or browser-provided MIME. No SVG/GIF.
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported image');
      buffer = await image
        .rotate()
        .resize(640, 640, { fit: 'cover' })
        .flatten({ background: '#f8f7f4' })
        .jpeg({ quality: 85 })
        .toBuffer();
      // Re-encoding also removes EXIF/GPS and other source metadata.
    } catch {
      throw new BadRequestException({
        code: 'AVATAR_FORMAT_INVALID',
        message: 'Chọn ảnh JPG, PNG hoặc WebP hợp lệ',
      });
    }
    if (Object.values(this.credentials).some((value) => !value)) {
      throw new ServiceUnavailableException({
        code: 'AVATAR_UPLOAD_UNAVAILABLE',
        message: 'Chưa cấu hình dịch vụ ảnh',
      });
    }
    const publicId = `roomora/avatars/${userId}/${randomUUID()}`;
    try {
      return await new Promise<UploadedAvatar>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            ...this.credentials,
            public_id: publicId,
            resource_type: 'image',
            type: 'upload',
            format: 'jpg',
            overwrite: false,
            timeout: 45_000,
          },
          (error, response) => {
            if (
              error ||
              !response ||
              response.public_id !== publicId ||
              response.resource_type !== 'image' ||
              !response.secure_url?.startsWith('https://res.cloudinary.com/')
            ) {
              const unauthorized = error?.http_code === 401;
              if (unauthorized)
                this.logger.warn(
                  'Cloudinary rejected avatar credentials (HTTP 401)',
                );
              reject(
                new ServiceUnavailableException({
                  code: unauthorized
                    ? 'AVATAR_CONFIGURATION_INVALID'
                    : 'AVATAR_UPLOAD_UNAVAILABLE',
                  message: 'Không thể tải ảnh lên lúc này',
                }),
              );
            } else {
              resolve({
                publicId: response.public_id,
                secureUrl: response.secure_url,
              });
            }
          },
        );
        stream.on('error', reject);
        stream.end(buffer);
      });
    } catch (error) {
      await this.deleteAvatar(publicId, userId);
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'AVATAR_UPLOAD_UNAVAILABLE',
        message: 'Không thể tải ảnh lên lúc này',
      });
    }
  }

  async deleteAvatar(publicId: string | null, userId: string): Promise<void> {
    if (!publicId?.startsWith(`roomora/avatars/${userId}/`)) return;
    try {
      // The SDK forwards timeout/credentials; its destroy overload only lists
      // delivery flags, so use a structurally compatible options object.
      const options = {
        ...this.credentials,
        resource_type: 'image' as const,
        type: 'upload' as const,
        invalidate: true,
        timeout: 10_000,
      };
      const result = (await cloudinary.uploader.destroy(publicId, options)) as {
        result: string;
      };
      if (!['ok', 'not found'].includes(result.result))
        throw new Error('Cleanup failed');
    } catch {
      // Cleanup failure must not roll back an already-persisted new avatar.
      this.logger.warn('Avatar cleanup failed; manual cleanup may be needed');
    }
  }
}
