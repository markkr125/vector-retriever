const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * LibreOffice document conversion service
 * Converts legacy Office formats (.doc, .ppt, .xls) and OpenDocument formats (.odt, .odp, .ods)
 * to modern formats that can be parsed with existing extractors
 */
class LibreOfficeConverter {
  constructor({
    enabled = false,
    libreOfficePath = null,
    timeoutMs = 60000,
    maxConcurrency = 2
  }) {
    this.enabled = enabled;
    this.libreOfficePath = libreOfficePath || this.detectLibreOfficePath();
    this.timeoutMs = timeoutMs;
    this.maxConcurrency = maxConcurrency;
    this.activeConversions = 0;
  }

  detectLibreOfficePath() {
    // Common LibreOffice paths on different systems
    const possiblePaths = [
      '/usr/bin/soffice',
      '/usr/bin/libreoffice',
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    ];

    // Return the first path (will be validated when used)
    return possiblePaths[0];
  }

  /**
   * Check if LibreOffice conversion is available
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get conversion target format for a given input extension
   * @param {string} inputExt - Input file extension (e.g., 'doc', 'ppt', 'xls')
   * @returns {Object} - { format: 'pdf|docx|csv', ext: '.pdf|.docx|.csv' }
   */
  getTargetFormat(inputExt) {
    const conversions = {
      // Legacy Office formats
      'doc': { format: 'docx', ext: '.docx' },
      'ppt': { format: 'pdf', ext: '.pdf' },
      'xls': { format: 'csv', ext: '.csv' },
      
      // OpenDocument formats
      'odt': { format: 'docx', ext: '.docx' },
      'odp': { format: 'pdf', ext: '.pdf' },
      'ods': { format: 'csv', ext: '.csv' }
    };

    return conversions[inputExt.toLowerCase()] || null;
  }

  /**
   * Convert a document using LibreOffice headless
   * @param {Buffer} buffer - Input file buffer
   * @param {string} inputExt - Input file extension
   * @returns {Promise<{buffer: Buffer, ext: string}>} - Converted file buffer and extension
   */
  async convert(buffer, inputExt) {
    if (!this.enabled) {
      throw new Error('LibreOffice conversion is disabled. Set LIBREOFFICE_ENABLED=true in .env to enable legacy Office and OpenDocument format support.');
    }

    // Check concurrency limit
    if (this.activeConversions >= this.maxConcurrency) {
      throw new Error(`LibreOffice conversion queue full (max ${this.maxConcurrency} concurrent conversions)`);
    }

    const targetFormat = this.getTargetFormat(inputExt);
    if (!targetFormat) {
      throw new Error(`No conversion target defined for .${inputExt}`);
    }

    this.activeConversions++;

    try {
      return await this._convertFile(buffer, inputExt, targetFormat);
    } finally {
      this.activeConversions--;
    }
  }

  async _convertFile(buffer, inputExt, targetFormat) {
    // Create temporary directory for conversion
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libreoffice-'));
    const inputFile = path.join(tempDir, `input.${inputExt}`);
    const outputFile = path.join(tempDir, `input${targetFormat.ext}`);

    try {
      // Write input file
      await fs.writeFile(inputFile, buffer);

      // Run LibreOffice conversion
      await this._runConversion(inputFile, tempDir, targetFormat.format);

      // Read converted file
      const convertedBuffer = await fs.readFile(outputFile);

      console.log(`✓ LibreOffice converted .${inputExt} → ${targetFormat.ext} (${convertedBuffer.length} bytes)`);

      return {
        buffer: convertedBuffer,
        ext: targetFormat.ext.substring(1) // Remove leading dot
      };
    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', cleanupError.message);
      }
    }
  }

  _runConversion(inputFile, outputDir, format) {
    return new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--convert-to', format,
        '--outdir', outputDir,
        inputFile
      ];

      const process = spawn(this.libreOfficePath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`LibreOffice conversion timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        if (error.code === 'ENOENT') {
          reject(new Error(`LibreOffice not found at ${this.libreOfficePath}. Please install LibreOffice or set LIBREOFFICE_PATH in .env`));
        } else {
          reject(new Error(`LibreOffice process error: ${error.message}`));
        }
      });

      process.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`LibreOffice conversion failed with code ${code}: ${stderr || stdout}`));
        }
      });
    });
  }
}

function createLibreOfficeConverter(config) {
  return new LibreOfficeConverter(config);
}

module.exports = {
  LibreOfficeConverter,
  createLibreOfficeConverter
};
