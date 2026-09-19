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

  const rawPort = String(config.PORT ?? '5000').trim();

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

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    FRONTEND_ORIGIN: origin.origin,
  };
}
