import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthContext } from '../../common/request-context.js';

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(auth: AuthContext, idleSeconds: number) {
    // Use the server clock, never a client date. GREATEST preserves newer activity
    // when requests from multiple tabs/devices arrive out of order.
    await this.prisma.$transaction(async (tx) => {
      // Match login/account moderation: lock the user before touching sessions.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${auth.userId}::uuid FOR UPDATE`;
      await tx.$executeRaw`
      WITH activity AS (
        UPDATE sessions SET last_active_at = GREATEST(last_active_at,
          statement_timestamp() - ${idleSeconds} * INTERVAL '1 second')
        WHERE id = ${auth.sessionId}::uuid AND user_id = ${auth.userId}::uuid
          AND revoked_at IS NULL AND expires_at > statement_timestamp()
          AND EXISTS (SELECT 1 FROM users WHERE id = ${auth.userId}::uuid AND locked_at IS NULL)
          AND (last_active_at IS NULL OR last_active_at < statement_timestamp() - INTERVAL '15 seconds')
        RETURNING user_id, last_active_at
      )
      UPDATE users u SET last_active_at = GREATEST(u.last_active_at, a.last_active_at)
      FROM activity a WHERE u.id = a.user_id AND u.locked_at IS NULL`;
    });
    return { ok: true };
  }
}
