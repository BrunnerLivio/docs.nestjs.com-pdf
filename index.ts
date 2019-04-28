import { promisify } from 'util';
import { dirname } from 'path';

import { Browser, launch } from 'puppeteer';

import * as fs from 'fs';

import * as rimraf from 'rimraf';
import * as async from 'async';
import * as cheerio from 'cheerio';
import * as sanitize from 'sanitize-filename';
import * as ProgressBar from 'progress';

const mkdir = promisify(fs.mkdir);

const DOCS_URL = 'https://docs.nestjs.com';
const PDF_FOLDER = 'pdf';
const DEFAULT_WORKERS = 5;

interface PDFPage {
  url: string;
  filepath: string;
}

async function savePDFromPDFPage(browser: Browser, pdfPage: PDFPage): Promise<void> {
  const page = await browser.newPage();

  await mkdir(dirname(pdfPage.filepath), { recursive: true });

  await page.goto(pdfPage.url, { waitUntil: 'networkidle2' });
  await page.pdf({ path: pdfPage.filepath, format: 'A4', printBackground: true });
}

function aElementToPDFPage($: CheerioStatic, element: CheerioElement): PDFPage {
  const filename = sanitize($(element).text())
    .trim()
    .replace(/ /g, '_')
    .toLowerCase();

  let fileIndex = 0;
  let li = element.parent;
  while ((li = li.previousSibling) !== null) {
    fileIndex++;
  }
  const category = $(element)
    .parentsUntil('ul')
    .siblings('.heading')
    .find('h3')
    .text()
    .toLowerCase();

  let categoryIndex = 0;
  let appMenuItem = element.parent.parent.parent.parent;
  while ((appMenuItem = appMenuItem.previousSibling) !== null) {
    categoryIndex++;
  }

  const filepath = `${__dirname}/${PDF_FOLDER}/${categoryIndex}_${category}/${fileIndex}_${filename}.pdf`;
  const url = `${DOCS_URL}${element.attribs.href}`;
  return { filepath, url };
}

function runPDFPagesJob(browser: Browser, pdfPages: PDFPage[]) {
  const bar = new ProgressBar(':bar :current/:total', { total: pdfPages.length });

  return new Promise<void>((resolve, reject) => {
    async.forEachLimit(
      pdfPages,
      DEFAULT_WORKERS,
      async (pdfPage, callback) => {
        await savePDFromPDFPage(browser, pdfPage);
        bar.tick();
        callback();
      },
      err => (err ? reject(err) : resolve()),
    );
  });
}

async function main(browser: Browser): Promise<Browser> {
  const page = await browser.newPage();
  await page.goto(DOCS_URL, { waitUntil: 'networkidle2' });
  const content = await page.content();

  const $ = cheerio.load(content);
  const pdfPages = $('.nav-container ul li a')
    .toArray()
    .filter(element => !element.attribs.href.startsWith('https'))
    .map(element => aElementToPDFPage($, element));

  await runPDFPagesJob(browser, pdfPages);
  return browser;
}

rimraf.sync(PDF_FOLDER);
console.log(`Scraping ${DOCS_URL}`);
launch()
  .then(browser => main(browser))
  .then(browser => browser.close())
  .then(() => console.log('All done! :)'));
