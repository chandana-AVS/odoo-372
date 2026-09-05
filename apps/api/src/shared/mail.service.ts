import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    // Defaults point at the MailHog container from docker-compose.
    this.transport = nodemailer.createTransport({
      host: config.get('SMTP_HOST') ?? 'localhost',
      port: Number(config.get('SMTP_PORT') ?? 1025),
      secure: false,
      ignoreTLS: true,
      auth: config.get('SMTP_USER')
        ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
        : undefined,
    });
    this.from = config.get('SMTP_FROM') ?? 'PeoplePay360 <payroll@peoplepay360.local>';
  }

  async sendPayslip(params: {
    to: string;
    employeeName: string;
    period: string;
    netAmount: number;
    pdf: Buffer;
    fileName: string;
  }) {
    const { to, employeeName, period, netAmount, pdf, fileName } = params;

    await this.transport.sendMail({
      from: this.from,
      to,
      subject: `Your payslip for ${period}`,
      text:
        `Hi ${employeeName},\n\n` +
        `Your payslip for ${period} is attached.\n` +
        `Net salary: ${netAmount.toLocaleString('en-IN')}\n\n` +
        `If anything looks wrong, reply to this email and payroll will pick it up.\n\n` +
        `— PeoplePay360`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:520px">
          <h2 style="color:#4f46e5;margin:0 0 12px">Your payslip is ready</h2>
          <p>Hi ${employeeName},</p>
          <p>Your payslip for <strong>${period}</strong> is attached as a PDF.</p>
          <div style="background:#f4f4f5;border-radius:8px;padding:14px 18px;margin:18px 0">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#71717a">Net salary</div>
            <div style="font-size:22px;font-weight:700">${netAmount.toLocaleString('en-IN')}</div>
          </div>
          <p style="color:#71717a;font-size:13px">
            If anything looks wrong, reply to this email and payroll will pick it up.
          </p>
        </div>`,
      attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
    });

    this.logger.log(`Payslip sent to ${to}`);
  }
}
