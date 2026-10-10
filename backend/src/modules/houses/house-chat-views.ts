import type { Prisma } from '../../generated/prisma/client.js';

export const select = {
  id: true,
  houseId: true,
  senderId: true,
  clientId: true,
  number: true,
  text: true,
  version: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  attachments: {
    select: {
      id: true,
      kind: true,
      mimeType: true,
      byteSize: true,
      fileName: true,
      width: true,
      height: true,
    },
    orderBy: { position: 'asc' },
  },
  sender: {
    select: { profile: { select: { displayName: true, avatarUrl: true } } },
  },
  poll: {
    select: {
      question: true,
      closedAt: true,
      options: {
        select: { id: true, text: true },
        orderBy: { position: 'asc' },
      },
      votes: { select: { userId: true, optionId: true } },
    },
  },
} as const;

export type Row = Prisma.HouseMessageGetPayload<{ select: typeof select }>;
