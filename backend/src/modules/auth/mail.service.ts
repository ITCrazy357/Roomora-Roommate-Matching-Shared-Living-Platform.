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
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  async sendVerification(email: string, code: string): Promise<void> {
    await this.sendOtp(email, 'Xác minh email Roomora', code);
  }

  async sendPasswordReset(email: string, code: string): Promise<void> {
    await this.sendOtp(email, 'Đặt lại mật khẩu Roomora', code);
  }

  async sendNotification(
    email: string,
    title: string,
    actionUrl: string,
  ): Promise<void> {
    await this.send(
      email,
      title,
      `${title}\n\nXem trong Roomora: ${actionUrl}`,
      actionUrl,
      'Mở Roomora',
    );
  }

  exposeDevelopmentOtp(
    code: string,
    requestIp: string | undefined,
  ): string | undefined {
    const loopback =
      requestIp === '127.0.0.1' ||
      requestIp === '::1' ||
      requestIp === '::ffff:127.0.0.1';
    return this.config.get<boolean>('AUTH_DEV_EXPOSE_LINKS') && loopback
      ? code
      : undefined;
  }

  private async send(
    email: string,
    subject: string,
    text: string,
    actionUrl: string,
    actionLabel: string,
  ): Promise<void> {
    await this.deliver(
      email,
      subject,
      text,
      `<p>${this.escape(subject)}</p><p><a href="${this.escape(actionUrl)}">${this.escape(actionLabel)}</a></p>`,
    );
  }

  private async sendOtp(
    email: string,
    subject: string,
    code: string,
  ): Promise<void> {
    const note =
      'Mã có hiệu lực 5 phút và chỉ dùng một lần. Không chia sẻ mã với bất kỳ ai. Nếu bạn không yêu cầu, hãy bỏ qua email này.';
    await this.deliver(
      email,
      subject,
      `${subject}\n\nMã OTP: ${code}\n\n${note}`,
      `<div style="max-width:480px;margin:24px auto;padding:32px;border:1px solid #eadbd3;border-radius:20px;font-family:Arial,sans-serif;color:#202824"><h2>Roomora</h2><h3>${this.escape(subject)}</h3><p>Nhập mã dưới đây để tiếp tục:</p><p style="font-size:36px;letter-spacing:10px;font-weight:700;text-align:center;background:#fff2ed;padding:24px;border-radius:12px;color:#c33d28">${this.escape(code)}</p><p>${note}</p></div>`,
    );
  }

  private async deliver(
    email: string,
    subject: string,
    text: string,
    html: string,
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
      html,
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
