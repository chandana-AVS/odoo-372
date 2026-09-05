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

  /** Tells a manager that one of their reports needs an attendance decision. */
  async sendAttendanceRequestNotice(params: {
    to: string;
    managerName: string;
    employeeName: string;
    employeeCode: string;
    date: Date;
    workedHours: number;
    deltaHours: number;
    type: string;
    reason: string;
  }) {
    const { to, managerName, employeeName, employeeCode, date, workedHours } = params;
    const day = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const sign = params.deltaHours >= 0 ? '+' : '';
    const delta = `${sign}${params.deltaHours.toFixed(2)}h`;

    await this.transport.sendMail({
      from: this.from,
      to,
      subject: `Attendance request from ${employeeName} — ${day}`,
      text: [
        `Hi ${managerName},`,
        '',
        `${employeeName} (${employeeCode}) has raised an attendance request.`,
        '',
        `Date: ${day}`,
        `Worked: ${workedHours}h (${delta} vs the standard 8h)`,
        `Type: ${params.type}`,
        `Reason: ${params.reason}`,
        '',
        'Review it in PeoplePay360 under Attendance requests.',
        '',
        '— PeoplePay360',
      ].join('\n'),
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:520px">
          <h2 style="color:#4f46e5;margin:0 0 12px">Attendance request</h2>
          <p>Hi ${managerName},</p>
          <p><strong>${employeeName}</strong> (${employeeCode}) has raised a request for <strong>${day}</strong>.</p>
          <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
            <tr><td style="padding:4px 16px 4px 0;color:#71717a">Worked</td><td><strong>${workedHours}h</strong> (${delta} vs 8h)</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#71717a">Type</td><td>${params.type}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#71717a">Reason</td><td>${params.reason}</td></tr>
          </table>
          <p style="color:#71717a;font-size:13px">Review it in PeoplePay360 under Attendance requests.</p>
        </div>`,
    });

    this.logger.log(`Attendance request notice sent to ${to}`);
  }

  /** Tells the employee what HR decided, and what it is worth if approved. */
  async sendAttendanceRequestDecision(params: {
    to: string;
    employeeName: string;
    date: Date;
    approved: boolean;
    note: string | null;
    amount: number | null;
  }) {
    const { to, employeeName, date, approved, note, amount } = params;
    const day = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const outcome = approved ? 'approved' : 'rejected';
    const pay =
      approved && amount
        ? `Overtime of Rs ${amount.toLocaleString('en-IN')} will be added to your next payslip.`
        : approved
          ? 'No additional pay applies to this request.'
          : 'No additional pay will be applied.';

    await this.transport.sendMail({
      from: this.from,
      to,
      subject: `Your attendance request for ${day} was ${outcome}`,
      text: [
        `Hi ${employeeName},`,
        '',
        `Your attendance request for ${day} was ${outcome}.`,
        pay,
        ...(note ? ['', `Note: ${note}`] : []),
        '',
        '— PeoplePay360',
      ].join('\n'),
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:520px">
          <h2 style="color:${approved ? '#16a34a' : '#dc2626'};margin:0 0 12px">
            Request ${outcome}
          </h2>
          <p>Hi ${employeeName},</p>
          <p>Your attendance request for <strong>${day}</strong> was <strong>${outcome}</strong>.</p>
          ${
            approved && amount
              ? `<div style="background:#f4f4f5;border-radius:8px;padding:14px 18px;margin:18px 0">
                   <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#71717a">Overtime pay</div>
                   <div style="font-size:22px;font-weight:700">Rs ${amount.toLocaleString('en-IN')}</div>
                   <div style="font-size:12px;color:#71717a;margin-top:4px">Added to your next payslip.</div>
                 </div>`
              : `<p style="color:#71717a;font-size:13px">${pay}</p>`
          }
          ${note ? `<p style="font-size:13px"><strong>Note:</strong> ${note}</p>` : ''}
        </div>`,
    });

    this.logger.log(`Attendance decision (${outcome}) sent to ${to}`);
  }
}
