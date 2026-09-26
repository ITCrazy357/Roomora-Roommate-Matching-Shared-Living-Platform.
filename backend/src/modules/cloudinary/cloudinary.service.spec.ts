import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import { CloudinaryService, MAX_AVATAR_BYTES } from './cloudinary.service.js';

vi.mock('cloudinary', () => ({
  v2: { uploader: { upload_stream: vi.fn(), destroy: vi.fn() } },
}));

describe('Cloudinary avatar adapter', () => {
  let service: CloudinaryService;
  let encoded: Buffer;
  const config = new ConfigService({
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'private-secret',
  });
  beforeEach(() => {
    vi.clearAllMocks();
    service = new CloudinaryService(config);
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({ result: 'ok' });
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
      (options, callback) => {
        const chunks: Buffer[] = [];
        const stream = new Writable({
          write(chunk: Buffer, _, done) {
            chunks.push(chunk);
            done();
          },
        });
        stream.on('finish', () => {
          encoded = Buffer.concat(chunks);
          callback?.(undefined, {
            public_id: options.public_id,
            resource_type: 'image',
            secure_url:
              'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
          } as never);
        });
        return stream as unknown as ReturnType<
          typeof cloudinary.uploader.upload_stream
        >;
      },
    );
  });

  const file = (buffer: Buffer, mimetype = 'image/png') =>
    ({
      buffer,
      size: buffer.length,
      mimetype,
      originalname: 'photo.png',
    }) as Express.Multer.File;
  const png = () =>
    sharp({
      create: { width: 80, height: 50, channels: 4, background: '#c1dab1' },
    })
      .png()
      .toBuffer();

  it('decodes, crops and strips metadata before signed server-side upload', async () => {
    const image = await png();
    const result = await service.uploadAvatar(file(image), 'owner');
    expect(result.publicId).toMatch(/^roomora\/avatars\/owner\//);
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'upload',
        resource_type: 'image',
        overwrite: false,
        api_secret: 'private-secret',
      }),
      expect.any(Function),
    );
    const metadata = await sharp(encoded).metadata();
    expect(metadata).toMatchObject({ width: 640, height: 640, format: 'jpeg' });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it.each([
    Buffer.from('not an image'),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    ),
  ])(
    'rejects invalid or vector bytes even with a claimed image MIME',
    async (buffer) => {
      await expect(
        service.uploadAvatar(file(buffer), 'owner'),
      ).rejects.toMatchObject({ response: { code: 'AVATAR_FORMAT_INVALID' } });
      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    },
  );

  it('rejects oversized and empty uploads', async () => {
    for (const buffer of [Buffer.alloc(0), Buffer.alloc(MAX_AVATAR_BYTES + 1)])
      await expect(
        service.uploadAvatar(file(buffer), 'owner'),
      ).rejects.toMatchObject({ response: { code: 'AVATAR_SIZE_INVALID' } });
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it('keeps missing credentials non-fatal until an upload is requested', async () => {
    const missing = new CloudinaryService(new ConfigService());
    await expect(
      missing.uploadAvatar(file(await png()), 'owner'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('sanitizes provider errors and compensates a failed upload', async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
      (_, callback) => {
        const stream = new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        });
        stream.on('finish', () =>
          callback?.({ message: 'api_secret=private-secret' } as never),
        );
        return stream as never;
      },
    );
    await expect(
      service.uploadAvatar(file(await png()), 'owner'),
    ).rejects.toMatchObject({
      response: { code: 'AVATAR_UPLOAD_UNAVAILABLE' },
    });
    expect(cloudinary.uploader.destroy).toHaveBeenCalledOnce();
  });

  it('never deletes foreign assets and invalidates owned avatar delivery', async () => {
    await service.deleteAvatar('roomora/avatars/someone-else/image', 'owner');
    await service.deleteAvatar('officeflow/tickets/report', 'owner');
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    await service.deleteAvatar('roomora/avatars/owner/image', 'owner');
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'roomora/avatars/owner/image',
      expect.objectContaining({ invalidate: true, resource_type: 'image' }),
    );
  });

  it('reports rejected provider credentials without exposing the secret', async () => {
    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
      (_, callback) => {
        const stream = new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        });
        stream.on('finish', () =>
          callback?.({ http_code: 401, message: 'private-secret' } as never),
        );
        return stream as never;
      },
    );
    await expect(
      service.uploadAvatar(file(await png()), 'owner'),
    ).rejects.toMatchObject({
      response: {
        code: 'AVATAR_CONFIGURATION_INVALID',
        message: 'Không thể tải ảnh lên lúc này',
      },
    });
  });
});
