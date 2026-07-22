import { chromium } from 'playwright-core';
import type { PdfRenderer } from '../index.js';

export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(private readonly executablePath = process.env.CHROMIUM_PATH) {}

  async render(html: string): Promise<Uint8Array> {
    const browser = await chromium.launch({ headless: true, ...(this.executablePath ? { executablePath: this.executablePath } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
      await page.setContent(html, { waitUntil: 'networkidle' });
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally {
      await browser.close();
    }
  }
}
