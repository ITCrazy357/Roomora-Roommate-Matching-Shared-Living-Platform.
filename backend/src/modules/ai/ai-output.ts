import { aiUnavailable } from './ai-provider.service.js';

export const textSchema = { type: 'string' };
export const nullableTextSchema = { type: ['string', 'null'] };
export const nullableNumberSchema = { type: ['integer', 'null'] };
export function objectSchema(properties: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}
export function outputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    aiUnavailable();
  return value as Record<string, unknown>;
}
export function outputText(value: unknown, max = 5000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    aiUnavailable();
  return value.trim();
}
export function outputList(value: unknown, max = 9): string[] {
  if (!Array.isArray(value) || value.length > max) aiUnavailable();
  return value.map((item) => outputText(item, 300));
}
export function outputAmount(value: unknown, max: number): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > max
  )
    aiUnavailable();
  return value;
}
