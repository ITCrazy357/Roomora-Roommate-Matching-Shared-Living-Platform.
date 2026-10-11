import { createHmac } from 'node:crypto';

// payOS payment-requests signs sorted raw values; null/undefined are empty.
export function payosSignature(data: Record<string, unknown>, secret: string) {
  const text = Object.keys(data)
    .sort()
    .map((key) => {
      const value = data[key];
      if (value == null || value === 'null' || value === 'undefined')
        return `${key}=`;
      if (Array.isArray(value)) {
        const items = value.map((item: unknown) => {
          if (!item || typeof item !== 'object' || Array.isArray(item))
            return item;
          const row = item as Record<string, unknown>;
          return Object.fromEntries(
            Object.keys(row)
              .sort()
              .map((name) => [name, row[name]]),
          );
        });
        return `${key}=${JSON.stringify(items)}`;
      }
      if (!['string', 'number', 'boolean'].includes(typeof value))
        throw new Error('Unsupported PayOS signature value');
      return `${key}=${value as string | number | boolean}`;
    })
    .join('&');
  return createHmac('sha256', secret).update(text).digest('hex');
}
