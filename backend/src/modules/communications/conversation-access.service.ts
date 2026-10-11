import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma, Conversation } from '../../generated/prisma/client.js';
import { participant, type ConversationRow } from './conversation-views.js';
import { presenceView } from './presence-views.js';

@Injectable()
export class ConversationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async withConversation<T>(
    userId: string,
    id: string,
    work: (
      tx: Prisma.TransactionClient,
      row: Conversation & {
        connection: { senderId: string; receiverId: string };
      },
    ) => Promise<T>,
  ) {
    const existing = await this.access(this.prisma, userId, id);
    return this.prisma.$transaction(async (tx) => {
      // Same lock order as connection/block operations. Recheck permission after locking.
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${existing.connection.senderId}::uuid, ${existing.connection.receiverId}::uuid) ORDER BY id FOR UPDATE`;
      const row = await this.access(tx, userId, id);
      return work(tx, row);
    });
  }

  async access(tx: Prisma.TransactionClient, userId: string, id: string) {
    const row = await tx.conversation.findFirst({
      where: { id, connection: participant(userId) },
      include: { connection: true },
    });
    if (!row) this.unavailable();
    return row;
  }

  view(row: ConversationRow, userId: string) {
    const person =
      row.connection.senderId === userId
        ? row.connection.receiver
        : row.connection.sender;
    const profile = person.profile;
    return {
      id: row.id,
      connectionId: row.connectionId,
      lastNumber: row.lastNumber,
      readNumber:
        row.connection.senderId === userId ? row.senderRead : row.receiverRead,
      person: {
        userId: this.otherUser(row, userId),
        displayName: profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: profile?.avatarUrl ?? null,
        presence: presenceView(person),
      },
    };
  }

  otherUser(
    row: { connection: { senderId: string; receiverId: string } },
    userId: string,
  ) {
    return row.connection.senderId === userId
      ? row.connection.receiverId
      : row.connection.senderId;
  }

  unavailable(): never {
    throw new NotFoundException({ code: 'CONVERSATION_UNAVAILABLE' });
  }
}
