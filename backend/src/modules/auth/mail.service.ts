import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    if (!host) return;

    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');
    this.transporter = nodemailer.createTransport({
      host,
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: config.getOrThrow<boolean>('SMTP_SECURE'),
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  async sendVerification(email: string, actionUrl: string): Promise<void> {
    await this.send(
      email,
      'Xác minh email Roomora',
      `Xác minh tài khoản Roomora của bạn: ${actionUrl}\n\nLiên kết hết hạn sau 24 giờ.`,
      actionUrl,
      'Xác minh email',
    );
  }

  async sendPasswordReset(email: string, actionUrl: string): Promise<void> {
    await this.send(
      email,
      'Đặt lại mật khẩu Roomora',
      `Đặt lại mật khẩu Roomora: ${actionUrl}\n\nLiên kết hết hạn sau 1 giờ. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
      actionUrl,
      'Đặt lại mật khẩu',
    );
  }

  exposeDevelopmentUrl(
    actionUrl: string,
    requestIp: string | undefined,
  ): string | undefined {
    const loopback =
      requestIp === '127.0.0.1' ||
      requestIp === '::1' ||
      requestIp === '::ffff:127.0.0.1';
    return this.config.get<boolean>('AUTH_DEV_EXPOSE_LINKS') && loopback
      ? actionUrl
      : undefined;
  }

  private async send(
    email: string,
    subject: string,
    text: string,
    actionUrl: string,
    actionLabel: string,
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error(
        `SMTP chưa được cấu hình; không thể gửi "${subject}" tới ${email}`,
      );
    }

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: email,
      subject,
      text,
      html: `<p>${this.escape(subject)}</p><p><a href="${this.escape(actionUrl)}">${this.escape(actionLabel)}</a></p>`,
    });
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  }
}
