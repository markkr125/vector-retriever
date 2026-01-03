const TurndownService = require('turndown');

// Polyfill DOM APIs for pdfjs-dist in Node.js
const { DOMMatrix, DOMPoint } = require('canvas');
global.DOMMatrix = DOMMatrix;
global.DOMPoint = DOMPoint;

// Dynamic import cache for pdfjs-dist (ES Module)
let pdfjsLib = null;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    // Configure worker - use require.resolve to find the worker file
    const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  }
  return pdfjsLib;
}

async function pdfToMarkdownViaHtml(buffer) {
  try {
    const pdfjsLib = await getPdfjs();

    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    let htmlContent = '<div class="pdf-content">\n';

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items by Y position (rows)
      const rows = new Map();

      textContent.items.forEach(item => {
        const y = Math.round(item.transform[5]); // Y position
        const x = item.transform[4]; // X position

        if (!rows.has(y)) {
          rows.set(y, []);
        }
        rows.get(y).push({ x, text: item.str, width: item.width });
      });

      // Sort rows by Y position (top to bottom)
      const sortedRows = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]);

      // Detect table regions
      let currentTable = [];
      let inTable = false;

      // Process each row
      sortedRows.forEach(([y, items], idx) => {
        // Sort items by X position (left to right)
        items.sort((a, b) => a.x - b.x);

        // Detect if this is a table row (multiple items with significant gaps)
        const gaps = [];
        for (let i = 1; i < items.length; i++) {
          gaps.push(items[i].x - (items[i - 1].x + items[i - 1].width));
        }
        const hasLargeGaps = gaps.some(g => g > 20); // Significant spacing
        const isTableRow = items.length >= 3 && hasLargeGaps;

        if (isTableRow) {
          // Add to current table
          currentTable.push(items);
          inTable = true;
        } else {
          // If we were building a table, close it
          if (inTable && currentTable.length > 0) {
            htmlContent += '<table>\n';
            currentTable.forEach(rowItems => {
              htmlContent += '<tr>\n';
              rowItems.forEach(item => {
                htmlContent += `<td>${item.text}</td>`;
              });
              htmlContent += '</tr>\n';
            });
            htmlContent += '</table>\n';
            currentTable = [];
            inTable = false;
          }

          // Regular text
          const text = items.map(i => i.text).join(' ');

          // Detect headings (short text, all caps or title case)
          if (text.length < 80 && text === text.toUpperCase() && text.length > 3) {
            htmlContent += `<h2>${text}</h2>\n`;
          } else if (text.length < 80 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(text)) {
            htmlContent += `<h3>${text}</h3>\n`;
          } else {
            htmlContent += `<p>${text}</p>\n`;
          }
        }
      });

      // Close any remaining table
      if (inTable && currentTable.length > 0) {
        htmlContent += '<table>\n';
        currentTable.forEach(rowItems => {
          htmlContent += '<tr>\n';
          rowItems.forEach(item => {
            htmlContent += `<td>${item.text}</td>`;
          });
          htmlContent += '</tr>\n';
        });
        htmlContent += '</table>\n';
      }

      if (pageNum < pdf.numPages) {
        htmlContent += '<hr/>\n'; // Page separator
      }
    }

    htmlContent += '</div>';

    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    });

    // Add table support
    turndownService.addRule('tables', {
      filter: 'table',
      replacement: function(content, node) {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (rows.length === 0) return content;

        let markdown = '\n';
        rows.forEach((row, idx) => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          markdown += '| ' + cells.map(c => c.textContent.trim()).join(' | ') + ' |\n';

          if (idx === 0) {
            markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
          }
        });
        return markdown + '\n';
      }
    });

    const markdown = turndownService.turndown(htmlContent);
    return markdown;

  } catch (error) {
    console.error('PDF to HTML conversion error:', error);
    throw error;
  }
}

function processPdfText(text) {
  if (!text) return '';

  let lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let result = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only detect actual tables: lines with 3+ items separated by 2+ spaces
    // This indicates columnar data, not just label-value pairs
    const columns = line.split(/\s{2,}/).filter(c => c.trim());
    const isActualTable = columns.length >= 3;

    // Detect headings (short, uppercase heavy, no currency)
    const isHeading = (
      line.length < 80 &&
      line.length > 3 &&
      !line.includes('$') &&
      !line.includes(':') &&
      (line === line.toUpperCase() || /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line))
    );

    if (isHeading && !inTable) {
      // Add heading
      if (result.length > 0) result.push('');
      result.push(`## ${line}`);
      result.push('');
      continue;
    }

    if (isActualTable) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(columns);
    } else {
      // Not a table row
      if (inTable && tableRows.length > 0) {
        // Flush the table
        result.push(...formatTable(tableRows));
        result.push('');
        tableRows = [];
        inTable = false;
      }

      // Add regular line with proper spacing
      result.push(line);
    }
  }

  // Flush any remaining table
  if (inTable && tableRows.length > 0) {
    result.push(...formatTable(tableRows));
  }

  return result.join('\n');
}

function formatTable(rows) {
  if (rows.length === 0) return [];

  // Determine max columns
  const maxCols = Math.max(...rows.map(r => r.length));

  // Pad rows to same length
  rows = rows.map(row => {
    while (row.length < maxCols) row.push('');
    return row;
  });

  const result = [];

  // Add all rows as table
  rows.forEach((row, idx) => {
    result.push(`| ${row.join(' | ')} |`);
    // Add separator after first row
    if (idx === 0 && rows.length > 1) {
      result.push(`| ${row.map(() => '---').join(' | ')} |`);
    }
  });

  return result;
}

module.exports = {
  pdfToMarkdownViaHtml,
  processPdfText
};
