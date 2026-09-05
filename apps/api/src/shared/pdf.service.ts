import { Injectable, Logger } from '@nestjs/common';
import { RuleCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  async renderPayslip(payslipId: string): Promise<Buffer> {
    const html = await this.payslipHtml(payslipId);

    // Puppeteer is heavy; import lazily so the API boots fast in dev.
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** Exposed separately so the UI can preview the exact print layout. */
  async payslipHtml(payslipId: string): Promise<string> {
    const payslip = await this.prisma.payslip.findUniqueOrThrow({
      where: { id: payslipId },
      include: {
        employee: { include: { department: true, jobPosition: true, company: true } },
        contract: true,
        salaryStructure: true,
        payrun: true,
        lines: { orderBy: { sequence: 'asc' } },
      },
    });

    const money = (value: number | string | { toString(): string }) =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: payslip.employee.company.currency || 'INR',
        maximumFractionDigits: 2,
      }).format(Number(value));

    const date = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const rows = payslip.lines
      .map((line) => {
        const isTotal = line.category === RuleCategory.GROSS || line.category === RuleCategory.NET;
        return `
      <tr class="${isTotal ? 'total' : ''}">
        <td>${line.name}</td>
        <td class="muted">${line.code}</td>
        <td class="muted">${line.category}</td>
        <td class="num ${Number(line.amount) < 0 ? 'neg' : ''}">${money(line.amount)}</td>
      </tr>`;
      })
      .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #18181b; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #4f46e5; padding-bottom: 14px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 700; color: #4f46e5; letter-spacing: -.3px; }
  .sub { color: #71717a; font-size: 11px; margin-top: 2px; }
  h1 { font-size: 15px; margin: 0; text-align: right; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 20px; margin-bottom: 22px; }
  .k { color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }
  .v { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
       color: #71717a; border-bottom: 1px solid #e4e4e7; padding: 8px 6px; }
  td { padding: 9px 6px; border-bottom: 1px solid #f4f4f5; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .neg { color: #dc2626; }
  .muted { color: #71717a; font-size: 11px; }
  tr.total td { background: #fafafa; font-weight: 700; }
  .net { margin-top: 22px; background: #4f46e5; color: #fff; border-radius: 8px;
         padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; }
  .net .label { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; opacity: .85; }
  .net .amount { font-size: 22px; font-weight: 700; }
  footer { margin-top: 26px; color: #a1a1aa; font-size: 10px; text-align: center; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">PeoplePay360</div>
      <div class="sub">${payslip.employee.company.name}</div>
    </div>
    <div>
      <h1>Payslip</h1>
      <div class="sub">${payslip.number}</div>
    </div>
  </div>

  <div class="grid">
    <div><div class="k">Employee</div><div class="v">${payslip.employee.firstName} ${payslip.employee.lastName}</div></div>
    <div><div class="k">Employee Code</div><div class="v">${payslip.employee.code}</div></div>
    <div><div class="k">Department</div><div class="v">${payslip.employee.department?.name ?? '—'}</div></div>
    <div><div class="k">Job Position</div><div class="v">${payslip.employee.jobPosition?.name ?? '—'}</div></div>

    <div><div class="k">Period</div><div class="v">${date(payslip.periodStart)} — ${date(payslip.periodEnd)}</div></div>
    <div><div class="k">Salary Structure</div><div class="v">${payslip.salaryStructure.name}</div></div>
    <div><div class="k">Worked Days</div><div class="v">${Number(payslip.workedDays)}</div></div>
    <div><div class="k">Contract</div><div class="v">${payslip.contract?.reference ?? '—'}</div></div>
  </div>

  <table>
    <thead>
      <tr><th>Rule</th><th>Code</th><th>Category</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="net">
    <span class="label">Net Salary</span>
    <span class="amount">${money(payslip.netAmount)}</span>
  </div>

  <footer>
    Computer-generated payslip — no signature required.
    Generated ${new Date().toLocaleString('en-GB')}.
  </footer>
</body>
</html>`;
  }
}
