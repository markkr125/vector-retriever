const { parse: csvParse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');
const rtfParser = require('rtf-parser');
const path = require('path');

/**
 * Extract text from CSV file with truncation support
 * @param {Buffer} buffer - CSV file buffer
 * @param {Function} estimateTokens - Token estimation function
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {Object} - { content, metadata }
 */
async function extractCSV(buffer, estimateTokens, maxTokens) {
  const csvText = buffer.toString('utf-8');
  
  let records;
  try {
    records = csvParse(csvText, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }

  if (!records || records.length === 0) {
    throw new Error('CSV file is empty');
  }

  const metadata = {
    total_rows: records.length,
    total_columns: records[0]?.length || 0
  };

  // Build content incrementally with truncation
  const lines = [];
  let includedRows = 0;
  let contentTruncated = false;

  // Add header if available (assume first row is header)
  const hasHeader = records.length > 1;
  if (hasHeader) {
    lines.push('# CSV Data\n');
    lines.push('| ' + records[0].join(' | ') + ' |');
    lines.push('|' + records[0].map(() => '---').join('|') + '|');
    includedRows++;
  }

  // Add data rows with truncation check
  for (let i = hasHeader ? 1 : 0; i < records.length; i++) {
    const rowLine = '| ' + records[i].join(' | ') + ' |';
    const testContent = lines.join('\n') + '\n' + rowLine;
    
    const tokens = estimateTokens(testContent);
    if (tokens > maxTokens) {
      contentTruncated = true;
      break;
    }
    
    lines.push(rowLine);
    includedRows++;
  }

  const content = lines.join('\n');

  // Check if at least header + 1 row could fit
  if (includedRows < 2 && hasHeader) {
    throw new Error('CSV file too large: cannot fit even header and one row within token limit');
  }

  if (contentTruncated) {
    metadata.content_truncated = true;
    metadata.included_rows = includedRows;
    metadata.truncated_rows = records.length - includedRows;
    metadata.extraction_summary = `Included ${includedRows} of ${records.length} rows due to token limit`;
  } else {
    metadata.included_rows = records.length;
  }

  return { content, metadata };
}

/**
 * Extract text from XLSX file with truncation support
 * @param {Buffer} buffer - XLSX file buffer
 * @param {Function} estimateTokens - Token estimation function
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {Object} - { content, metadata }
 */
async function extractXLSX(buffer, estimateTokens, maxTokens) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (error) {
    throw new Error(`XLSX parsing failed: ${error.message}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('XLSX file has no sheets');
  }

  const metadata = {
    total_sheets: workbook.SheetNames.length,
    sheet_names: workbook.SheetNames
  };

  const lines = [];
  let includedSheets = 0;
  let includedRows = 0;
  let contentTruncated = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (sheetData.length === 0) continue;

    // Try to add sheet header
    const sheetHeader = `\n# Sheet: ${sheetName}\n`;
    const testWithHeader = lines.join('\n') + sheetHeader;
    
    if (estimateTokens(testWithHeader) > maxTokens) {
      contentTruncated = true;
      break;
    }

    lines.push(sheetHeader);
    let sheetRows = 0;

    // Add rows with truncation check
    for (const row of sheetData) {
      const rowLine = '| ' + row.join(' | ') + ' |';
      const testContent = lines.join('\n') + '\n' + rowLine;
      
      if (estimateTokens(testContent) > maxTokens) {
        contentTruncated = true;
        break;
      }
      
      lines.push(rowLine);
      sheetRows++;
      includedRows++;
    }

    if (sheetRows > 0) {
      includedSheets++;
    }

    if (contentTruncated) break;
  }

  const content = lines.join('\n');

  // Check if at least one sheet with one row could fit
  if (includedSheets === 0 || includedRows === 0) {
    throw new Error('XLSX file too large: cannot fit even one sheet with one row within token limit');
  }

  if (contentTruncated) {
    metadata.content_truncated = true;
    metadata.included_sheets = includedSheets;
    metadata.included_rows = includedRows;
    metadata.extraction_summary = `Included ${includedSheets} of ${metadata.total_sheets} sheets (${includedRows} rows total) due to token limit`;
  } else {
    metadata.included_sheets = includedSheets;
    metadata.included_rows = includedRows;
  }

  return { content, metadata };
}

/**
 * Extract text from PPTX file including speaker notes with truncation support
 * @param {Buffer} buffer - PPTX file buffer
 * @param {Function} estimateTokens - Token estimation function
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {Object} - { content, metadata }
 */
async function extractPPTX(buffer, estimateTokens, maxTokens) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new Error(`PPTX unzip failed: ${error.message}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  // Get slide count
  const slideFiles = Object.keys(zip.files).filter(name => 
    name.match(/^ppt\/slides\/slide\d+\.xml$/)
  ).sort();

  if (slideFiles.length === 0) {
    throw new Error('PPTX file has no slides');
  }

  const metadata = {
    total_slides: slideFiles.length
  };

  const lines = [];
  let includedSlides = 0;
  let includedNotesSlides = 0;
  let contentTruncated = false;

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const slideNum = i + 1;

    try {
      // Extract slide content
      const slideXml = await zip.file(slideFile).async('text');
      const slideData = parser.parse(slideXml);
      const slideText = extractTextFromPPTXSlide(slideData);

      // Try to add slide
      const slideBlock = `\n# Slide ${slideNum}\n\n${slideText}`;
      const testWithSlide = lines.join('\n') + slideBlock;
      
      if (estimateTokens(testWithSlide) > maxTokens) {
        contentTruncated = true;
        break;
      }

      lines.push(slideBlock);
      includedSlides++;

      // Try to extract speaker notes
      const notesText = await extractPPTXNotes(zip, parser, slideNum);
      if (notesText) {
        const notesBlock = `\n## Speaker Notes\n\n${notesText}`;
        const testWithNotes = lines.join('\n') + notesBlock;
        
        if (estimateTokens(testWithNotes) > maxTokens) {
          // Slide fits but notes don't - keep slide without notes
          contentTruncated = true;
          break;
        }
        
        lines.push(notesBlock);
        includedNotesSlides++;
      }
    } catch (error) {
      console.warn(`Failed to extract slide ${slideNum}:`, error.message);
      // Continue with other slides
    }
  }

  const content = lines.join('\n');

  // Check if at least one slide could fit
  if (includedSlides === 0) {
    throw new Error('PPTX file too large: cannot fit even one slide within token limit');
  }

  if (contentTruncated) {
    metadata.content_truncated = true;
    metadata.included_slides = includedSlides;
    metadata.included_notes_slides = includedNotesSlides;
    metadata.truncated_slides = metadata.total_slides - includedSlides;
    metadata.extraction_summary = `Included ${includedSlides} of ${metadata.total_slides} slides (${includedNotesSlides} with speaker notes) due to token limit`;
  } else {
    metadata.included_slides = includedSlides;
    metadata.included_notes_slides = includedNotesSlides;
  }

  return { content, metadata };
}

/**
 * Extract text runs from PPTX slide XML
 */
function extractTextFromPPTXSlide(slideData) {
  const texts = [];
  
  function traverse(obj) {
    if (!obj) return;
    
    if (typeof obj === 'object') {
      // Look for text runs (a:t elements in DrawingML)
      if (obj['a:t']) {
        const text = obj['a:t'];
        if (typeof text === 'string' && text.trim()) {
          texts.push(text.trim());
        }
      }
      
      // Recursively traverse all properties
      for (const key in obj) {
        traverse(obj[key]);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => traverse(item));
    }
  }
  
  traverse(slideData);
  return texts.join('\n');
}

/**
 * Extract speaker notes for a slide
 */
async function extractPPTXNotes(zip, parser, slideNum) {
  try {
    // Read slide relationship file to find notes
    const relsFile = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    if (!zip.file(relsFile)) {
      return null;
    }

    const relsXml = await zip.file(relsFile).async('text');
    const relsData = parser.parse(relsXml);
    
    // Find notes relationship
    const relationships = relsData?.Relationships?.Relationship;
    if (!relationships) return null;

    const relArray = Array.isArray(relationships) ? relationships : [relationships];
    const notesRel = relArray.find(rel => 
      rel['@_Type']?.includes('notesSlide')
    );

    if (!notesRel) return null;

    // Extract notes file path
    const notesTarget = notesRel['@_Target'];
    if (!notesTarget || typeof notesTarget !== 'string') return null;

    // Targets are typically relative (e.g. "../notesSlides/notesSlide1.xml")
    const notesPath = path.posix.normalize(`ppt/slides/${notesTarget}`);
    if (!zip.file(notesPath)) return null;

    const notesXml = await zip.file(notesPath).async('text');
    const notesData = parser.parse(notesXml);
    
    return extractTextFromPPTXSlide(notesData);
  } catch (error) {
    console.warn(`Failed to extract notes for slide ${slideNum}:`, error.message);
    return null;
  }
}

/**
 * Extract text from RTF file
 * @param {Buffer} buffer - RTF file buffer
 * @returns {Object} - { content, metadata }
 */
async function extractRTF(buffer) {
  return new Promise((resolve, reject) => {
    const texts = [];
    
    rtfParser.string(buffer.toString('utf8'), (err, doc) => {
      if (err) {
        return reject(new Error(`RTF parsing failed: ${err.message}`));
      }

      // Extract text content
      function extractText(node) {
        if (!node) return;
        
        if (node.content) {
          node.content.forEach(item => {
            if (item.value && typeof item.value === 'string') {
              texts.push(item.value);
            }
            if (item.content) {
              extractText(item);
            }
          });
        }
      }

      extractText(doc);
      
      const content = texts.join('\n').trim();
      
      if (!content) {
        return reject(new Error('RTF file is empty or could not extract content'));
      }

      resolve({
        content,
        metadata: {
          document_type: 'rtf'
        }
      });
    });
  });
}

module.exports = {
  extractCSV,
  extractXLSX,
  extractPPTX,
  extractRTF
};
