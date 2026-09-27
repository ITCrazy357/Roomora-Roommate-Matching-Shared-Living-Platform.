export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = config.NODE_ENV ?? 'development';

  if (
    typeof nodeEnv !== 'string' ||
    !['development', 'test', 'production'].includes(nodeEnv)
  ) {
    throw new Error('NODE_ENV phải là development, test hoặc production');
  }

  const portValue = config.PORT ?? '5000';
  if (typeof portValue !== 'string' && typeof portValue !== 'number') {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535');
  }
  const rawPort = `${portValue}`.trim();

  if (!/^\d+$/.test(rawPort)) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535');
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535');
  }

  const rawOrigin = config.FRONTEND_ORIGIN;

  if (typeof rawOrigin !== 'string' || rawOrigin.trim() === '') {
    throw new Error('FRONTEND_ORIGIN là bắt buộc');
  }

  let origin: URL;

  try {
    origin = new URL(rawOrigin.trim());
  } catch {
    throw new Error('FRONTEND_ORIGIN phải là URL hợp lệ');
  }

  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      'FRONTEND_ORIGIN chỉ gồm giao thức, hostname và port nếu có',
    );
  }

  const booleanValue = (key: string, fallback: boolean) => {
    const value = config[key];
    if (value === undefined || value === '') return fallback;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    throw new Error(`${key} phải là true hoặc false`);
  };

  const optionalText = (key: string) => {
    const value = config[key];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${key} phải là chuỗi không rỗng`);
    }
    return value.trim();
  };

  const smtpHost = optionalText('SMTP_HOST');
  const smtpUser = optionalText('SMTP_USER');
  const smtpPassword = optionalText('SMTP_PASSWORD');
  const mailFrom = optionalText('MAIL_FROM');

  if ((smtpUser && !smtpPassword) || (!smtpUser && smtpPassword)) {
    throw new Error('SMTP_USER và SMTP_PASSWORD phải được cấu hình cùng nhau');
  }

  if (smtpHost && !mailFrom) {
    throw new Error('MAIL_FROM là bắt buộc khi cấu hình SMTP_HOST');
  }

  const smtpPortValue = config.SMTP_PORT ?? '587';
  if (typeof smtpPortValue !== 'string' && typeof smtpPortValue !== 'number') {
    throw new Error('SMTP_PORT phải là số nguyên từ 1 đến 65535');
  }
  const rawSmtpPort = `${smtpPortValue}`;
  if (!/^\d+$/.test(rawSmtpPort)) {
    throw new Error('SMTP_PORT phải là số nguyên từ 1 đến 65535');
  }
  const smtpPort = Number(rawSmtpPort);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error('SMTP_PORT phải là số nguyên từ 1 đến 65535');
  }

  const devExposeLinks = booleanValue('AUTH_DEV_EXPOSE_LINKS', false);
  const googleClientId = optionalText('GOOGLE_CLIENT_ID');
  const googleClientSecret = optionalText('GOOGLE_CLIENT_SECRET');
  const googleRedirectUri = optionalText('GOOGLE_REDIRECT_URI');
  const googleSettings = [
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
  ];
  if (googleSettings.some(Boolean) && !googleSettings.every(Boolean)) {
    throw new Error(
      'Cần cấu hình đủ GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và GOOGLE_REDIRECT_URI',
    );
  }
  if (googleRedirectUri) {
    let callback: URL;
    try {
      callback = new URL(googleRedirectUri);
    } catch {
      throw new Error('GOOGLE_REDIRECT_URI phải là URL hợp lệ');
    }
    const localHttp =
      nodeEnv !== 'production' &&
      callback.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if (
      (callback.protocol !== 'https:' && !localHttp) ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash ||
      callback.pathname !== '/api/v1/auth/google/callback'
    ) {
      throw new Error(
        'GOOGLE_REDIRECT_URI cần HTTPS (HTTP chỉ dùng localhost) và đường dẫn /api/v1/auth/google/callback',
      );
    }
  }
  const cloudName = optionalText('CLOUDINARY_CLOUD_NAME');
  const cloudKey = optionalText('CLOUDINARY_API_KEY');
  const cloudSecret = optionalText('CLOUDINARY_API_SECRET');
  if (
    [cloudName, cloudKey, cloudSecret].some(Boolean) &&
    ![cloudName, cloudKey, cloudSecret].every(Boolean)
  ) {
    throw new Error(
      'Cần cấu hình đủ CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET',
    );
  }
  if (nodeEnv === 'production' && devExposeLinks) {
    throw new Error('AUTH_DEV_EXPOSE_LINKS không được bật ở production');
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    FRONTEND_ORIGIN: origin.origin,
    AUTH_DEV_EXPOSE_LINKS: devExposeLinks,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    GOOGLE_REDIRECT_URI: googleRedirectUri,
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_SECURE: booleanValue('SMTP_SECURE', false),
    SMTP_USER: smtpUser,
    SMTP_PASSWORD: smtpPassword,
    MAIL_FROM: mailFrom,
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: cloudKey,
    CLOUDINARY_API_SECRET: cloudSecret,
  };
}
