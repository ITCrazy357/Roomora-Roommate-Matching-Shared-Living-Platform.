import { z } from 'zod';
import { Amenity, ListingType } from '../../generated/prisma/enums.js';

export const listingSearchSchema = z
  .object({
    search: z.string().trim().max(150).optional(),
    type: z.enum(ListingType).optional(),
    provinceCode: z
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    wardCode: z
      .string()
      .regex(/^\d{5}$/)
      .optional(),
    minRent: z.number().int().min(0).max(100_000_000).optional(),
    maxRent: z.number().int().min(0).max(100_000_000).optional(),
    amenities: z
      .array(z.enum(Amenity))
      .max(9)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    page: z.number().int().min(1).max(1000).default(1),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .strict()
  .refine(
    (value) => !value.wardCode || !!value.provinceCode,
    'Cần chọn tỉnh/thành phố',
  )
  .refine(
    (value) =>
      value.minRent === undefined ||
      value.maxRent === undefined ||
      value.minRent <= value.maxRent,
    'Khoảng giá không hợp lệ',
  );

export const listingDetailSchema = z.object({ id: z.uuid() }).strict();
export const lookupQuestionSchema = z
  .object({ message: z.string().trim().min(2).max(500) })
  .strict();
export const consentSchema = z.object({ allow: z.boolean() }).strict();
