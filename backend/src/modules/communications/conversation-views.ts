import type { Prisma } from '../../generated/prisma/client.js';

export const participant = (userId: string): Prisma.ConnectionWhereInput => ({
  status: 'ACCEPTED',
  OR: [{ senderId: userId }, { receiverId: userId }],
  sender: {
    blockedUsers: { none: { targetId: userId } },
    blockedBy: { none: { blockerId: userId } },
  },
  receiver: {
    blockedUsers: { none: { targetId: userId } },
    blockedBy: { none: { blockerId: userId } },
  },
});

export const personSelect = {
  profile: { select: { displayName: true, avatarUrl: true } },
} as const;

export const connectionInclude = {
  sender: { select: personSelect },
  receiver: { select: personSelect },
} as const;

export type ConversationRow = Prisma.ConversationGetPayload<{
  include: { connection: { include: typeof connectionInclude } };
}>;

export const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  clientId: true,
  number: true,
  text: true,
  version: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
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
} as const;
