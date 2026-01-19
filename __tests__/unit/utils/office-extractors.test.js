const XLSX = require('xlsx');
const JSZip = require('jszip');

const { extractCSV, extractXLSX, extractPPTX, extractRTF } = require('../../../utils/office-extractors');

describe('office extractors (unit)', () => {
  test('extractCSV returns markdown table and metadata', async () => {
    const csv = 'Name,Age\nAlice,30\nBob,40\n';

    const { content, metadata } = await extractCSV(
      Buffer.from(csv, 'utf8'),
      (t) => t.length,
      10000
    );

    expect(content).toMatch(/# CSV Data/);
    expect(content).toMatch(/\| Name \| Age \|/);
    expect(metadata.total_rows).toBe(3);
    expect(metadata.included_rows).toBe(3);
    expect(metadata.content_truncated).toBeUndefined();
  });

  test('extractCSV truncates when token limit reached', async () => {
    const csv = 'Name,Age\nAlice,30\nBob,40\nCharlie,50\n';

    const { content, metadata } = await extractCSV(
      Buffer.from(csv, 'utf8'),
      (t) => t.length,
      60
    );

    expect(content).toMatch(/# CSV Data/);
    expect(metadata.total_rows).toBe(4);
    expect(metadata.content_truncated).toBe(true);
    expect(metadata.included_rows).toBeGreaterThanOrEqual(2); // header + at least one row
  });

  test('extractXLSX extracts rows across sheets and truncates safely', async () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['Name', 'Age'],
      ['Alice', 30],
      ['Bob', 40]
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['City', 'Country'],
      ['Paris', 'France'],
      ['Tokyo', 'Japan']
    ]);

    XLSX.utils.book_append_sheet(wb, ws1, 'People');
    XLSX.utils.book_append_sheet(wb, ws2, 'Places');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const { content, metadata } = await extractXLSX(
      buffer,
      (t) => t.length,
      120
    );

    expect(metadata.total_sheets).toBe(2);
    expect(metadata.included_sheets).toBeGreaterThanOrEqual(1);
    expect(metadata.included_rows).toBeGreaterThanOrEqual(1);
    expect(content).toMatch(/# Sheet: People|# Sheet: Places/);
  });

  test('extractPPTX includes speaker notes when present (../ target supported)', async () => {
    const zip = new JSZip();

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Slide text</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`;

    const notesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:t>Note text</a:t>
</p:notes>`;

    zip.file('ppt/slides/slide1.xml', slideXml);
    zip.file('ppt/slides/_rels/slide1.xml.rels', relsXml);
    zip.file('ppt/notesSlides/notesSlide1.xml', notesXml);

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const { content, metadata } = await extractPPTX(
      buffer,
      (t) => t.length,
      10000
    );

    expect(metadata.total_slides).toBe(1);
    expect(metadata.included_slides).toBe(1);
    expect(metadata.included_notes_slides).toBe(1);
    expect(content).toMatch(/# Slide 1/);
    expect(content).toMatch(/Slide text/);
    expect(content).toMatch(/## Speaker Notes/);
    expect(content).toMatch(/Note text/);
  });

  test('extractRTF extracts plain text', async () => {
    const rtf = '{\\rtf1\\ansi Hello \\b world\\b0 }';

    const { content, metadata } = await extractRTF(Buffer.from(rtf, 'utf8'));

    expect(content).toMatch(/Hello/);
    expect(content).toMatch(/world/);
    expect(metadata.document_type).toBe('rtf');
  });
});
