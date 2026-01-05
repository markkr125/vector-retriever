/**
 * PII Detection Module
 * Supports multiple detection backends: Ollama LLM, Regex, Hybrid, or Compromise
 */

const axios = require('axios');
const nlp = require('compromise');
const { phone } = require('phone');

/**
 * Standardized PII result format
 */
class PIIResult {
  constructor() {
    this.hasPII = false;
    this.piiTypes = [];
    this.piiDetails = [];
    this.riskLevel = 'low';
    this.detectionMethod = '';
    this.scanTimestamp = new Date().toISOString();
    this.processingTimeMs = 0;
  }
}

/**
 * Base class for PII detection strategies
 */
class PIIDetector {
  async detect(content, options = {}) {
    throw new Error('Must implement detect()');
  }
  
  getName() {
    throw new Error('Must implement getName()');
  }

  /**
   * Calculate risk level based on PII types found
   */
  calculateRiskLevel(piiTypes) {
    const criticalTypes = ['credit_card', 'ssn', 'bank_account', 'passport', 'medical'];
    const highTypes = ['date_of_birth', 'address', 'driver_license'];
    const mediumTypes = ['phone', 'email', 'ip_address'];
    const lowTypes = ['name', 'credit_card_last4'];
    
    const hasCritical = piiTypes.some(t => criticalTypes.includes(t));
    const hasHigh = piiTypes.some(t => highTypes.includes(t));
    const hasMedium = piiTypes.some(t => mediumTypes.includes(t));
    const hasOnlyLow = piiTypes.every(t => lowTypes.includes(t));
    
    if (hasCritical) return 'critical';
    if (hasHigh && piiTypes.length >= 2) return 'high';
    if (hasHigh || (hasMedium && piiTypes.length >= 3)) return 'medium';
    if (hasOnlyLow) return 'low';
    return 'low';
  }

  /**
   * Mask sensitive value
   */
  maskValue(value, type) {
    if (!value) return '';
    
    switch(type) {
      case 'credit_card':
        // Show last 4 digits
        return value.replace(/\d(?=\d{4})/g, 'X');
      case 'ssn':
        // Show last 4 digits
        return value.replace(/\d(?=\d{4})/g, '*');
      case 'email':
        const [local, domain] = value.split('@');
        if (local && domain) {
          const maskedLocal = local.charAt(0) + '***' + (local.length > 1 ? local.charAt(local.length - 1) : '');
          return `${maskedLocal}@${domain}`;
        }
        return value;
      case 'phone':
        // Show last 4 digits
        return value.replace(/\d(?=\d{4})/g, 'X');
      case 'bank_account':
        return value.replace(/\d(?=\d{4})/g, '*');
      default:
        // Generic masking - show first and last 2 chars
        if (value.length <= 4) return '***';
        return value.substring(0, 2) + '***' + value.substring(value.length - 2);
    }
  }
}

/**
 * Regex-based PII detector (fast, fallback)
 */
class RegexPIIDetector extends PIIDetector {
  detect(content, options = {}) {
    const startTime = Date.now();
    const result = new PIIResult();
    result.detectionMethod = 'regex';

    // Credit Card Pattern (Visa, MC, Amex, Discover)
    const creditCardPattern = /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g;
    const creditCards = content.match(creditCardPattern) || [];
    creditCards.forEach((cc, idx) => {
      if (this.validateLuhn(cc.replace(/\D/g, ''))) {
        result.piiDetails.push({
          type: 'credit_card',
          value: this.maskValue(cc, 'credit_card'),
          confidence: 0.95,
          location: this.findLocation(content, cc),
          context: this.extractContext(content, cc),
          detectedBy: 'regex'
        });
        if (!result.piiTypes.includes('credit_card')) {
          result.piiTypes.push('credit_card');
        }
      }
    });

    // Last 4 digits of credit card pattern (e.g., "ending in 6460", "last 4: 1234")
    const last4Pattern = /(?:ending in|last 4|last four)[:\s]*\d{4}\b/gi;
    const last4Matches = content.match(last4Pattern) || [];
    last4Matches.forEach(match => {
      const digits = match.match(/\d{4}/)[0];
      result.piiDetails.push({
        type: 'credit_card_last4',
        value: digits,
        confidence: 0.9,
        location: this.findLocation(content, match),
        context: this.extractContext(content, match),
        detectedBy: 'regex'
      });
      if (!result.piiTypes.includes('credit_card_last4')) {
        result.piiTypes.push('credit_card_last4');
      }
    });

    // Email Pattern
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = content.match(emailPattern) || [];
    emails.forEach((email, idx) => {
      result.piiDetails.push({
        type: 'email',
        value: email,
        confidence: 1.0,
        location: this.findLocation(content, email),
        context: this.extractContext(content, email),
        detectedBy: 'regex'
      });
      if (!result.piiTypes.includes('email')) {
        result.piiTypes.push('email');
      }
    });

    // SSN Pattern (US)
    const ssnPattern = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
    const ssns = content.match(ssnPattern) || [];
    ssns.forEach((ssn, idx) => {
      result.piiDetails.push({
        type: 'ssn',
        value: ssn,
        confidence: 0.9,
        location: this.findLocation(content, ssn),
        context: this.extractContext(content, ssn),
        detectedBy: 'regex'
      });
      if (!result.piiTypes.includes('ssn')) {
        result.piiTypes.push('ssn');
      }
    });

    // Phone Pattern (International) - with validation
    const phonePattern = /\b(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    const phones = content.match(phonePattern) || [];
    phones.forEach((phoneMatch, idx) => {
      // Validate with phone library
      const validation = phone(phoneMatch, { country: '' });
      if (validation.isValid) {
        result.piiDetails.push({
          type: 'phone',
          value: validation.phoneNumber, // Use normalized format
          confidence: 0.9,
          location: this.findLocation(content, phoneMatch),
          context: this.extractContext(content, phoneMatch),
          detectedBy: 'regex'
        });
        if (!result.piiTypes.includes('phone')) {
          result.piiTypes.push('phone');
        }
      } else {
        console.warn(`Regex detected invalid phone number (rejected by phone library): "${phoneMatch}"`);
      }
    });

    // IBAN Pattern
    const ibanPattern = /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g;
    const ibans = content.match(ibanPattern) || [];
    ibans.forEach((iban, idx) => {
      if (iban.length >= 15 && iban.length <= 34) {
        result.piiDetails.push({
          type: 'bank_account',
          value: iban,
          confidence: 0.8,
          location: this.findLocation(content, iban),
          context: this.extractContext(content, iban),
          detectedBy: 'regex'
        });
        if (!result.piiTypes.includes('bank_account')) {
          result.piiTypes.push('bank_account');
        }
      }
    });

    // IPv4 Pattern - with stricter validation
    const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const ips = content.match(ipv4Pattern) || [];
    ips.forEach((ip, idx) => {
      // Validate IP format
      const parts = ip.split('.');
      const isValidIP = parts.every(p => parseInt(p) >= 0 && parseInt(p) <= 255);
      
      // Exclude private/reserved IPs that are not real PII
      const isPrivateIP = ip.startsWith('10.') || 
                          ip.startsWith('192.168.') || 
                          ip.startsWith('172.16.') ||
                          ip.startsWith('127.') ||
                          ip === '0.0.0.0';
      
      // Exclude IPs that appear inside URLs (not real PII in documents)
      const context = this.extractContext(content, ip, 30);
      const isInURL = context.includes('http') || 
                      context.includes('www.') || 
                      context.includes('://') ||
                      context.includes('.com') ||
                      context.includes('.html');
      
      // Only flag if it's a valid public IP not in a URL
      if (isValidIP && !isPrivateIP && !isInURL) {
        result.piiDetails.push({
          type: 'ip_address',
          value: ip,
          confidence: 0.7,
          location: this.findLocation(content, ip),
          context: this.extractContext(content, ip),
          detectedBy: 'regex'
        });
        if (!result.piiTypes.includes('ip_address')) {
          result.piiTypes.push('ip_address');
        }
      }
    });

    // Address Pattern (basic - street with number)
    const addressPattern = /\b\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/gi;
    const addresses = content.match(addressPattern) || [];
    addresses.forEach((address, idx) => {
      result.piiDetails.push({
        type: 'address',
        value: address,
        confidence: 0.75,
        location: this.findLocation(content, address),
        context: this.extractContext(content, address),
        detectedBy: 'regex'
      });
      if (!result.piiTypes.includes('address')) {
        result.piiTypes.push('address');
      }
    });

    // Date of Birth Pattern
    const dobPattern = /\b(?:DOB|Date of Birth|Born|Birthday)[:=\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/gi;
    const dobs = content.match(dobPattern) || [];
    dobs.forEach((dob, idx) => {
      result.piiDetails.push({
        type: 'date_of_birth',
        value: dob,
        confidence: 0.8,
        location: this.findLocation(content, dob),
        context: this.extractContext(content, dob),
        detectedBy: 'regex'
      });
      if (!result.piiTypes.includes('date_of_birth')) {
        result.piiTypes.push('date_of_birth');
      }
    });

    result.hasPII = result.piiDetails.length > 0;
    result.riskLevel = this.calculateRiskLevel(result.piiTypes);
    result.processingTimeMs = Date.now() - startTime;

    return result;
  }

  /**
   * Validate credit card using Luhn algorithm
   */
  validateLuhn(cardNumber) {
    const digits = cardNumber.split('').reverse().map(d => parseInt(d));
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let digit = digits[i];
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }

  /**
   * Find line number of text
   */
  findLocation(content, text) {
    const index = content.indexOf(text);
    if (index === -1) return 'Unknown';
    const lines = content.substring(0, index).split('\n');
    return `Line ${lines.length}`;
  }

  /**
   * Extract surrounding context
   */
  extractContext(content, text, contextLength = 50) {
    const index = content.indexOf(text);
    if (index === -1) return '';
    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + text.length + contextLength);
    return '...' + content.substring(start, end).replace(/\n/g, ' ') + '...';
  }

  getName() {
    return 'regex';
  }
}

/**
 * Ollama LLM-based PII detector
 */
class OllamaPIIDetector extends PIIDetector {
  constructor(ollamaUrl, authToken, model) {
    super();
    this.ollamaUrl = ollamaUrl.replace('/api/embed', '/api/chat');
    this.authToken = authToken;
    this.model = model;
  }

  async detect(content, options = {}) {
    const startTime = Date.now();
    const result = new PIIResult();
    result.detectionMethod = 'ollama';

    try {
      // Truncate content if too long
      const textSample = content

      const systemPrompt = `You are a PII (Personally Identifiable Information) detection specialist.
Your task: scan the supplied text once only and return every exact instance of sensitive personal data that meets the rules below. Do not repeat any item, combine lines, or add new formatting.

CRITICAL RULES - READ CAREFULLY:
1. ONLY extract values that appear EXACTLY WORD-FOR-WORD in the provided text
2. DO NOT reformat, rearrange, or combine information from multiple lines
3. DO NOT add commas, spaces, or punctuation that isn't in the original
4. COPY AND PASTE the exact text - do not type it from memory
5. If information spans multiple lines, extract each line separately, NOT combined

Detect these types:
- credit_card: Credit card numbers (must be 13-19 digits, NOT order numbers)
- credit_card_last4: Last 4 digits when prefixed by "ending in" or "last 4"
- email: Email addresses (must have @ symbol and domain)
- phone: Phone numbers (must be actual phone numbers, NOT order numbers, NOT postal codes)
- name: Personal names ONLY (real people: first + last name like "John Smith" or "Maria Garcia")
- address: Physical street addresses (extract address lines separately, not combined)

WHAT IS A NAME vs WHAT IS NOT:
✓ NAMES ARE: John Smith, Maria Garcia, Robert Johnson (first + last name of real people)
✗ NAMES ARE NOT:
  - Order numbers (112-5176379-5390659)
  - Transaction IDs
  - Reference numbers with dashes and many digits
  - Product names
  - Company names
  - Single words without clear first+last name structure
  
CONFIDENCE SCORING - BE STRICT:
- 0.9-1.0: Absolutely certain (clear email with @, perfect phone format, obvious name)
- 0.7-0.8: Fairly confident (likely valid but could be edge case)
- Below 0.7: DO NOT INCLUDE - too uncertain

DO NOT DETECT:
- Order numbers, transaction IDs (like 112-9434585-9931408)
- Reference numbers with multiple dashes
- Postal codes as phone numbers
- Product names, company names (like "OrCAD", "ARMv6", "Motorolla")
- Technical terms, architecture names
- Dates formatted as numbers

CRITICAL OUTPUT RULES - FOLLOW EXACTLY:
1. Output ONLY a valid JSON array starting with [ and ending with ]
2. Each finding appears ONCE - no duplicates, no repetition
3. After listing all findings, immediately close with ] and STOP
4. Each finding MUST have the EXACT value - character by character copy
5. Test: If you cannot find your exact value with CTRL+F in the text, DO NOT include it
6. Do NOT combine separate lines into one value
7. Confidence MUST be realistic - be conservative, not optimistic

COMPLETION RULES:
- Make ONE pass through the text
- List each unique PII item once
- Close the array with ]
- STOP generating - do not continue after closing bracket
- NEVER repeat the same finding multiple times

Format example:
[
  {
    "type": "name",
    "value": "John Smith",
    "confidence": 0.9,
    "location": "Line 1"
  },
  {
    "type": "email",
    "value": "john@example.com",
    "confidence": 1.0,
    "location": "Line 2"
  }
]

If no PII found, return exactly: []`;

      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await axios.post(this.ollamaUrl, {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: textSample }
        ],
        stream: true
      }, { 
        headers, 
        timeout: 60000,
        responseType: 'stream'
      });

      // Collect streaming response with duplicate detection
      let responseText = '';
      const maxOccurrences = 3; // Stop if same finding appears more than 3 times
      
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              responseText += json.message.content;
              
              // Extract complete PII findings from accumulated response
              // Match complete objects: {"type":"...","value":"...",...}
              const findingPattern = /\{\s*"type"\s*:\s*"([^"]+)"[^}]*"value"\s*:\s*"([^"]+)"/g;
              const findingCounts = new Map();
              let match;
              
              while ((match = findingPattern.exec(responseText)) !== null) {
                const key = `${match[1]}:${match[2]}`;
                findingCounts.set(key, (findingCounts.get(key) || 0) + 1);
              }
              
              // Check if any finding exceeds max occurrences
              for (const [key, count] of findingCounts.entries()) {
                if (count > maxOccurrences) {
                  console.warn(`Ollama detection: Finding repeated ${count} times (${key}), stopping stream`);
                  // Force stop the stream
                  if (response.data.destroy) {
                    response.data.destroy();
                  }
                  break;
                }
              }
            }
            // Check for done signal
            if (json.done === true) {
              break;
            }
          } catch (e) {
            // Skip invalid JSON chunks
          }
        }
      }
      
      responseText = responseText.trim();
      
      // Debug: Print full Ollama detection response
      console.log('\n=== OLLAMA DETECTION RESPONSE ===');
      console.log(responseText);
      console.log('=== END RESPONSE ===\n');
      
      // Parse JSON response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        let findings;
        try {
          findings = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          console.error('Ollama PII detection JSON parse error:', parseError.message);
          console.error('Failed JSON:', jsonMatch[0].substring(0, 500));
          // Simple fix: escape quotes that appear between ": " and ",
          try {
            const lines = jsonMatch[0].split('\n');
            const fixedLines = lines.map(line => {
              // If line contains "value": "...", fix the value part
              if (line.includes('"value":')) {
                return line.replace(/"value":\s*"([^"]*)"/g, (match, val) => {
                  // This won't match if there are internal quotes, so try manual approach
                  const valueStart = line.indexOf('"value":');
                  if (valueStart === -1) return line;
                  
                  const firstQuote = line.indexOf('"', valueStart + 8);
                  if (firstQuote === -1) return line;
                  
                  // Find the real closing quote (before , or })
                  let closingQuote = -1;
                  for (let i = line.length - 1; i > firstQuote; i--) {
                    if (line[i] === '"') {
                      const afterQuote = line.substring(i + 1).trim();
                      if (afterQuote.startsWith(',') || afterQuote.startsWith('}')) {
                        closingQuote = i;
                        break;
                      }
                    }
                  }
                  
                  if (closingQuote > firstQuote) {
                    const value = line.substring(firstQuote + 1, closingQuote);
                    const escaped = value.replace(/"/g, '\\\\"');
                    return line.substring(0, firstQuote + 1) + escaped + line.substring(closingQuote);
                  }
                  return line;
                });
              }
              return line;
            });
            
            findings = JSON.parse(fixedLines.join('\n'));
            console.log('Successfully parsed after fixing quotes');
          } catch (secondError) {
            console.error('Failed to parse even after quote fixing:', secondError.message);
            findings = [];
          }
        }
        
        findings.forEach(finding => {
          if (finding.type && finding.value) {
            // VALIDATION 1: Confidence threshold - reject low confidence findings
            const confidence = finding.confidence || 0;
            if (confidence < 0.7) {
              console.warn(`Low confidence PII rejected: ${finding.type} = "${finding.value}" (confidence: ${confidence})`);
              return; // Skip this finding
            }
            
            // VALIDATION 2: Check if the value actually exists in the content
            let valueExists = content.includes(finding.value);
            
            // If exact match fails, try normalized whitespace matching
            if (!valueExists) {
              const normalizedContent = content.replace(/\s+/g, ' ').toLowerCase();
              const normalizedValue = finding.value.replace(/\s+/g, ' ').toLowerCase();
              valueExists = normalizedContent.includes(normalizedValue);
            }
            
            // If still not found AND it's an address, try partial word matching (70%+)
            if (!valueExists && finding.type === 'address') {
              const addressWords = finding.value.split(/[\s,]+/).filter(word => 
                word.length >= 3 && !/^\d+$/.test(word) // Skip short words and pure numbers
              );
              const contentLower = content.toLowerCase();
              const matchedWords = addressWords.filter(word => 
                contentLower.includes(word.toLowerCase())
              );
              const matchRate = matchedWords.length / addressWords.length;
              
              if (matchRate >= 0.7) {
                valueExists = true;
                console.log(`Address validated via partial match: "${finding.value}" (${Math.round(matchRate * 100)}% words found)`);
              }
            }
            
            if (!valueExists) {
              console.warn(`Ollama hallucinated PII: ${finding.type} = "${finding.value}" (not found in text)`);
              return; // Skip this finding
            }
            
            // VALIDATION 3: Filter out obvious non-PII junk values
            const normalizedValue = finding.value.toLowerCase().trim();
            const junkPatterns = [
              'none', 'n/a', 'na', 'null', 'unknown', 'not applicable',
              'none found', 'not found', 'no data', 'not available',
              'tbd', 'to be determined', 'pending', 'n.a.', 'n.a',
              'xxx', 'redacted', 'hidden', '[redacted]'
            ];
            
            if (junkPatterns.includes(normalizedValue)) {
              console.warn(`Filtered junk PII value: ${finding.type} = "${finding.value}"`);
              return; // Skip this finding
            }
            
            // VALIDATION 4: Minimum length validation (avoid very short non-meaningful values)
            if (finding.value.trim().length < 3) {
              console.warn(`Value too short to be valid PII: ${finding.type} = "${finding.value}"`);
              return; // Skip this finding
            }
            
            // VALIDATION 5: Type-specific validation
            if (finding.type === 'credit_card') {
              // Credit cards should be 13-19 digits (Visa, MC, Amex, Discover)
              const digitsOnly = finding.value.replace(/\D/g, '');
              if (digitsOnly.length < 13 || digitsOnly.length > 19) {
                console.warn(`Invalid credit card length: ${finding.type} = "${finding.value}" (${digitsOnly.length} digits)`);
                return; // Skip this finding
              }
              // Check if it looks like an order/transaction ID (contains patterns like 112-9434585-9931408)
              if (/\d{3}-\d{7,8}-\d{7,8}/.test(finding.value)) {
                console.warn(`Value looks like order ID, not credit card: ${finding.value}`);
                return; // Skip this finding
              }
            }
            
            // Email validation - MUST have @ and domain with dot
            if (finding.type === 'email') {
              const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailPattern.test(finding.value)) {
                console.warn(`Invalid email format: ${finding.type} = "${finding.value}" (missing @ or domain)`);
                return; // Skip this finding
              }
            }
            
            // Last 4 digits validation - should be exactly 4 digits
            if (finding.type === 'credit_card_last4') {
              const digitsOnly = finding.value.replace(/\D/g, '');
              if (digitsOnly.length !== 4) {
                console.warn(`Invalid last 4 format: ${finding.type} = "${finding.value}" (expected 4 digits)`);
                return; // Skip this finding
              }
            }
            
            // Phone validation - use phone library to verify and normalize
            if (finding.type === 'phone') {
              const validation = phone(finding.value, { country: '' });
              if (!validation.isValid) {
                // Accept it but lower confidence to 0.6
                console.warn(`Phone validation failed, lowering confidence: ${finding.value}`);
                finding.confidence = Math.min(finding.confidence || 0.8, 0.6);
              } else {
                // Update value to normalized format from phone library
                finding.value = validation.phoneNumber;
              }
            }
            
            // Name validation - must have at least 2 words, no digits/dashes pattern
            if (finding.type === 'name') {
              const words = finding.value.trim().split(/\s+/);
              const hasDigits = /\d/.test(finding.value);
              const hasDashes = finding.value.includes('-');
              const manyDigits = (finding.value.match(/\d/g) || []).length > 2;
              
              if (words.length < 2) {
                console.warn(`Invalid name (too few words): ${finding.type} = "${finding.value}"`);
                return;
              }
              
              if (hasDashes && manyDigits) {
                console.warn(`Invalid name (looks like ID/order number): ${finding.type} = "${finding.value}"`);
                return;
              }
            }
            
            // SSN validation - should be 9 digits
            if (finding.type === 'ssn') {
              const digitsOnly = finding.value.replace(/\D/g, '');
              if (digitsOnly.length !== 9) {
                console.warn(`Invalid SSN length: ${finding.type} = "${finding.value}" (expected 9 digits, got ${digitsOnly.length})`);
                return; // Skip this finding
              }
            }
            
            const context = this.extractContext(content, finding.value);
            
            result.piiDetails.push({
              type: finding.type,
              value: finding.value,
              confidence: finding.confidence || 0.8,
              location: finding.location || 'Unknown',
              context: context || '',
              detectedBy: 'ollama'
            });
            
            if (!result.piiTypes.includes(finding.type)) {
              result.piiTypes.push(finding.type);
            }
          }
        });
      }

      // VALIDATION AGENT: Second pass to verify findings make sense (unless disabled)
      if (result.piiDetails.length > 0 && !options.skipValidation) {
        console.log(`[Ollama] Validating ${result.piiDetails.length} findings with validation agent...`);
        await this.validateFindings(result, content);
        // Note: validateFindings updates piiTypes, hasPII, and riskLevel internally
      } else {
        result.piiTypes = [...new Set(result.piiDetails.map(d => d.type))];
        result.hasPII = result.piiDetails.length > 0;
        result.riskLevel = this.calculateRiskLevel(result.piiTypes);
      }
      
      result.processingTimeMs = Date.now() - startTime;

      return result;

    } catch (error) {
      console.error('Ollama PII detection error:', error.message);
      // Return empty result on error
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }

  extractContext(content, text, contextLength = 50) {
    const index = content.indexOf(text);
    if (index === -1) return '';
    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + text.length + contextLength);
    return '...' + content.substring(start, end).replace(/\n/g, ' ') + '...';
  }

  /**
   * Second agent to validate PII findings
   */
  async validateFindings(result, content) {
    try {
      const validationPrompt = `You are a PII validation expert. Review the following detected PII findings and determine if they are CORRECTLY classified.

IMPORTANT: Be PERMISSIVE, not aggressive. Only reject OBVIOUS mistakes.

For each finding, respond with:
- "valid": true if it IS the claimed type of PII (or reasonable partial PII)
- "valid": false ONLY for clear misclassifications
- Adjusted confidence (0.7-1.0) based on your assessment

WHAT TO REJECT (invalid = false):
✗ Order/transaction IDs like "112-123456-123456" classified as names/phones
✗ Company/product names for example "Amazon" or "Spin fi t" classified as personal names
✗ Obvious postal codes like "12345" classified as phone numbers
✗ URLs or email addresses classified as something else
✗ Invalid email addresses (missing @ or domain)

WHAT TO ACCEPT (valid = true):
✓ Partial addresses (city + postal code is VALID)
✓ Real person names even if uncommon (or single word if clearly a name)
✓ Phone numbers even if format is unusual (unless it's clearly an order number)
✓ Email addresses with @ symbol and domain
✓ Partial credit card numbers (last 4 digits)
✓ Street addresses (full or partial)

CONFIDENCE ADJUSTMENT:
- Keep 0.9-1.0 for perfect matches (clear email, obvious name)
- Use 0.8-0.85 for good but slightly uncertain (partial address, unusual phone format)
- Use 0.7-0.75 for valid but questionable (edge cases)
- NEVER go below 0.7 for valid findings

Findings to validate:
${result.piiDetails.map((d, i) => `${i + 1}. Type: ${d.type}, Value: "${d.value}", Current confidence: ${d.confidence}`).join('\n')}

Respond with ONLY a JSON array in this format:
[
  {
    "index": 0,
    "valid": true/false,
    "adjusted_confidence": 0.7-1.0,
    "reason": "brief reason if invalid or confidence changed"
  }
]`;

      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await axios.post(this.ollamaUrl, {
        model: this.model,
        messages: [
          { role: 'user', content: validationPrompt }
        ],
        stream: true
      }, {
        headers,
        timeout: 30000, // 30 second timeout
        responseType: 'stream'
      });

      // Collect streaming response with duplicate detection
      let responseText = '';
      const streamStartTime = Date.now();
      const maxStreamTime = 30000; // 30 seconds
      const maxOccurrences = 3; // Stop if same validation appears more than 3 times
      
      for await (const chunk of response.data) {
        // Safety check: Time limit
        if (Date.now() - streamStartTime > maxStreamTime) {
          console.warn('Validation agent: Stream timeout (30s), stopping');
          break;
        }
        
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              responseText += json.message.content;
              
              // Extract complete validation objects from accumulated response
              // Match: {"index":N,"valid":true/false,...}
              const validationPattern = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"valid"\s*:\s*(true|false)/g;
              const currentValidations = [];
              let match;
              
              while ((match = validationPattern.exec(responseText)) !== null) {
                currentValidations.push({ index: match[1], valid: match[2] });
              }
              
              // Count occurrences of each validation
              const currentCounts = new Map();
              for (const validation of currentValidations) {
                const key = `${validation.index}:${validation.valid}`;
                currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
              }
              
              // Check if any validation exceeds max occurrences
              let shouldStop = false;
              for (const [key, count] of currentCounts.entries()) {
                if (count > maxOccurrences) {
                  console.warn(`Validation agent: Validation repeated ${count} times (${key}), stopping stream`);
                  shouldStop = true;
                  break;
                }
              }
              
              if (shouldStop) {
                if (response.data.destroy) {
                  response.data.destroy();
                }
                break;
              }
            }
            // Check for done signal
            if (json.done === true) {
              break;
            }
          } catch (e) {
            // Skip invalid JSON chunks
          }
        }
        
        // Break outer loop if we stopped due to duplicates
        const validationPattern = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"valid"\s*:\s*(true|false)/g;
        const finalCounts = new Map();
        let match;
        while ((match = validationPattern.exec(responseText)) !== null) {
          const key = `${match[1]}:${match[2]}`;
          finalCounts.set(key, (finalCounts.get(key) || 0) + 1);
        }
        let shouldBreak = false;
        for (const [key, count] of finalCounts.entries()) {
          if (count > maxOccurrences) {
            shouldBreak = true;
            break;
          }
        }
        if (shouldBreak) break;
      }

      responseText = responseText.trim();
      
      // Debug: Print full Ollama validation response
      console.log('\n=== OLLAMA VALIDATION RESPONSE ===');
      console.log(responseText);
      console.log('=== END RESPONSE ===\n');
      
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const validations = JSON.parse(jsonMatch[0]);
        
        // Apply validations in reverse order so we can safely remove items
        for (let i = result.piiDetails.length - 1; i >= 0; i--) {
          const validation = validations.find(v => v.index === i);
          
          if (validation) {
            if (!validation.valid) {
              console.warn(`Validation agent rejected: ${result.piiDetails[i].type} = "${result.piiDetails[i].value}" - ${validation.reason}`);
              result.piiDetails.splice(i, 1);
            } else if (validation.adjusted_confidence !== undefined) {
              const oldConf = result.piiDetails[i].confidence;
              result.piiDetails[i].confidence = validation.adjusted_confidence;
              
              if (Math.abs(oldConf - validation.adjusted_confidence) > 0.1) {
                console.log(`Confidence adjusted: ${result.piiDetails[i].type} = "${result.piiDetails[i].value}" (${oldConf.toFixed(2)} → ${validation.adjusted_confidence.toFixed(2)}) - ${validation.reason || 'validation review'}`);
              }
              
              // Remove if confidence dropped below threshold
              if (validation.adjusted_confidence < 0.7) {
                console.warn(`Validation reduced confidence below threshold: ${result.piiDetails[i].type} = "${result.piiDetails[i].value}"`);
                result.piiDetails.splice(i, 1);
              }
            }
          }
        }
      }
      
      // CRITICAL: Recalculate piiTypes after validation removes items
      result.piiTypes = [...new Set(result.piiDetails.map(d => d.type))];
      result.hasPII = result.piiDetails.length > 0;
      result.riskLevel = this.calculateRiskLevel(result.piiTypes);
      
    } catch (error) {
      console.error('Validation agent error (continuing with original findings):', error.message);
      // Don't fail the entire detection if validation fails
    }
  }

  getName() {
    return 'ollama';
  }
}

/**
 * Hybrid detector - tries Ollama first, falls back to Regex
 */
class HybridPIIDetector extends PIIDetector {
  constructor(ollamaUrl, authToken, model) {
    super();
    this.ollamaDetector = new OllamaPIIDetector(ollamaUrl, authToken, model);
    this.regexDetector = new RegexPIIDetector();
  }

  async detect(content, options = {}) {
    const startTime = Date.now();
    
    try {
      // Try Ollama first
      const ollamaResult = await this.ollamaDetector.detect(content, options);
      
      // Also run regex for additional coverage
      const regexResult = this.regexDetector.detect(content, options);
      
      // Merge results (deduplicate by value)
      const merged = new PIIResult();
      merged.detectionMethod = 'hybrid';
      
      const seenValues = new Set();
      
      // Add Ollama results first (higher confidence)
      ollamaResult.piiDetails.forEach(detail => {
        const key = `${detail.type}:${detail.value}`;
        if (!seenValues.has(key)) {
          merged.piiDetails.push(detail);
          seenValues.add(key);
          if (!merged.piiTypes.includes(detail.type)) {
            merged.piiTypes.push(detail.type);
          }
        }
      });
      
      // Add regex results that weren't found by Ollama
      regexResult.piiDetails.forEach(detail => {
        const key = `${detail.type}:${detail.value}`;
        if (!seenValues.has(key)) {
          merged.piiDetails.push(detail);
          seenValues.add(key);
          if (!merged.piiTypes.includes(detail.type)) {
            merged.piiTypes.push(detail.type);
          }
        }
      });
      
      merged.hasPII = merged.piiDetails.length > 0;
      merged.riskLevel = this.calculateRiskLevel(merged.piiTypes);
      merged.processingTimeMs = Date.now() - startTime;
      
      // VALIDATION AGENT: Validate all findings (unless disabled)
      if (merged.piiDetails.length > 0 && !options.skipValidation) {
        console.log(`[Hybrid] Validating ${merged.piiDetails.length} findings with validation agent...`);
        await this.validateFindings(merged, content);
        // Note: validateFindings updates piiTypes, hasPII, and riskLevel internally
      } else {
        merged.piiTypes = [...new Set(merged.piiDetails.map(d => d.type))];
        merged.hasPII = merged.piiDetails.length > 0;
        merged.riskLevel = this.calculateRiskLevel(merged.piiTypes);
      }
      
      return merged;
      
    } catch (error) {
      console.error('Hybrid detection error, falling back to regex only:', error.message);
      // Fallback to regex only
      const regexResult = this.regexDetector.detect(content, options);
      regexResult.detectionMethod = 'regex-fallback';
      return regexResult;
    }
  }

  getName() {
    return 'hybrid';
  }

  /**
   * Validation agent (shared with OllamaPIIDetector)
   */
  async validateFindings(result, content) {
    return await OllamaPIIDetector.prototype.validateFindings.call(this, result, content);
  }
}

/**
 * Compromise NLP + Phone Validator Detector
 * Uses NLP for name detection and phone library for validation
 */
class CompromisePIIDetector extends PIIDetector {
  constructor() {
    super();
    this.regexDetector = new RegexPIIDetector();
  }

  async detect(content, options = {}) {
    const startTime = Date.now();
    const result = new PIIResult();
    result.detectionMethod = 'compromise';

    try {
      const detectedItems = new Map(); // Use map to deduplicate by value
      
      // 1. Use regex for credit cards, SSN, email, IBAN (patterns work well)
      const regexFindings = await this.regexDetector.detect(content, options);
      regexFindings.piiDetails.forEach(detail => {
        detectedItems.set(detail.value, detail);
      });

      // 2. Use compromise for person names
      const doc = nlp(content);
      const people = doc.people().out('array');
      
      people.forEach(name => {
        // Basic validation: at least 2 words, each word 2+ chars
        const words = name.trim().split(/\s+/);
        if (words.length >= 2 && words.every(w => w.length >= 2)) {
          // Check it's not a company/product name pattern
          const lowerName = name.toLowerCase();
          if (!lowerName.match(/\b(ltd|llc|inc|corp|co\.|group|limited)\b/i)) {
            detectedItems.set(name, {
              type: 'name',
              value: name,
              confidence: 0.75,
              context: this.getContext(content, name),
              location: 'Detected by NLP analysis',
              detected_by: 'compromise'
            });
          }
        }
      });

      // 3. Use phone library for phone number validation
      // Extract potential phone numbers with a broad regex
      const phonePattern = /(?:\+?[\d\s\-\(\)\.]{7,})/g;
      const phoneMatches = content.match(phonePattern) || [];
      
      phoneMatches.forEach(match => {
        const cleanMatch = match.trim();
        // Try to validate with phone library
        const validation = phone(cleanMatch, { country: '' }); // auto-detect country
        
        if (validation.isValid) {
          detectedItems.set(validation.phoneNumber, {
            type: 'phone',
            value: validation.phoneNumber,
            confidence: 0.9,
            context: this.getContext(content, match),
            location: `Country: ${validation.countryCode || 'Unknown'}`,
            detected_by: 'phone-validator'
          });
        }
      });

      // 4. Extract addresses using compromise (basic location detection)
      const places = doc.places().out('array');
      places.forEach(place => {
        // Only consider substantial addresses (multi-word)
        if (place.split(/\s+/).length >= 3) {
          detectedItems.set(place, {
            type: 'address',
            value: place,
            confidence: 0.65,
            context: this.getContext(content, place),
            location: 'Detected by NLP location analysis',
            detected_by: 'compromise'
          });
        }
      });

      // Convert map to array
      result.piiDetails = Array.from(detectedItems.values());
      result.piiTypes = [...new Set(result.piiDetails.map(d => d.type))];
      result.hasPII = result.piiDetails.length > 0;
      result.riskLevel = this.calculateRiskLevel(result.piiTypes);
      result.processingTimeMs = Date.now() - startTime;

      // VALIDATION AGENT: Validate all findings (unless disabled)
      if (result.piiDetails.length > 0 && !options.skipValidation) {
        console.log(`[Compromise] Validating ${result.piiDetails.length} findings with validation agent...`);
        await this.validateFindings(result, content);
        // Note: validateFindings updates piiTypes, hasPII, and riskLevel internally
      } else {
        result.piiTypes = [...new Set(result.piiDetails.map(d => d.type))];
        result.hasPII = result.piiDetails.length > 0;
        result.riskLevel = this.calculateRiskLevel(result.piiTypes);
      }

      return result;
    } catch (error) {
      console.error('Compromise detection error:', error.message);
      // Fallback to regex
      const regexResult = await this.regexDetector.detect(content, options);
      regexResult.detectionMethod = 'regex-fallback';
      return regexResult;
    }
  }

  getContext(content, value) {
    const index = content.indexOf(value);
    if (index === -1) return '';
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + value.length + 50);
    return content.substring(start, end);
  }

  getName() {
    return 'compromise';
  }

  /**
   * Validation agent (shared with OllamaPIIDetector)
   */
  async validateFindings(result, content) {
    // Need Ollama URL and credentials for validation
    const ollamaUrl = process.env.OLLAMA_URL?.replace('/api/embed', '/api/chat') || 'http://localhost:11434/api/chat';
    const authToken = process.env.AUTH_TOKEN;
    const model = process.env.PII_DETECTION_MODEL || 'llama3.2:3b';
    
    // Temporarily create OllamaPIIDetector instance to use its validation
    const tempDetector = new OllamaPIIDetector(ollamaUrl, authToken, model);
    return await tempDetector.validateFindings(result, content);
  }
}

/**
 * Advanced Multi-Method Detector
 * Combines Ollama + Compromise + Regex for maximum coverage
 */
class AdvancedPIIDetector extends PIIDetector {
  constructor(ollamaUrl, authToken, model) {
    super();
    this.regexDetector = new RegexPIIDetector();
    this.compromiseDetector = new CompromisePIIDetector();
    this.ollamaDetector = new OllamaPIIDetector(ollamaUrl, authToken, model);
  }

  async detect(content, options = {}) {
    const startTime = Date.now();
    const result = new PIIResult();
    result.detectionMethod = 'advanced';

    try {
      const detectedItems = new Map(); // Deduplicate by value
      
      // 1. Run regex detector (fast, reliable for patterns)
      console.log('Running regex detection...');
      const regexFindings = await this.regexDetector.detect(content, { ...options, skipValidation: true });
      regexFindings.piiDetails.forEach(detail => {
        detectedItems.set(detail.value, { ...detail, detected_by: 'regex' });
      });

      // 2. Run compromise detector (NLP for names and context)
      console.log('Running compromise detection...');
      const compromiseFindings = await this.compromiseDetector.detect(content, { ...options, skipValidation: true });
      compromiseFindings.piiDetails.forEach(detail => {
        if (!detectedItems.has(detail.value)) {
          detectedItems.set(detail.value, { ...detail, detected_by: 'compromise' });
        }
      });

      // 3. Run Ollama detector (LLM for complex patterns)
      console.log('Running Ollama detection...');
      const ollamaFindings = await this.ollamaDetector.detect(content, { ...options, skipValidation: true });
      ollamaFindings.piiDetails.forEach(detail => {
        // Only add if not already found AND passes validation
        if (!detectedItems.has(detail.value)) {
          detectedItems.set(detail.value, { ...detail, detected_by: 'ollama' });
        } else {
          // If already found by another method, boost confidence
          const existing = detectedItems.get(detail.value);
          existing.confidence = Math.min(1.0, existing.confidence + 0.1);
          existing.detected_by = `${existing.detected_by}+ollama`;
        }
      });

      // Convert map to array
      result.piiDetails = Array.from(detectedItems.values());
      result.piiTypes = [...new Set(result.piiDetails.map(d => d.type))];
      result.hasPII = result.piiDetails.length > 0;
      result.riskLevel = this.calculateRiskLevel(result.piiTypes);
      result.processingTimeMs = Date.now() - startTime;

      // VALIDATION AGENT: Final validation of all findings
      if (result.piiDetails.length > 0) {
        console.log(`[Advanced] Validating ${result.piiDetails.length} findings with validation agent...`);
        await this.validateFindings(result, content);
        // Note: validateFindings updates piiTypes, hasPII, and riskLevel internally
      } else {
        result.piiTypes = [...new Set(result.piiDetails.map(d => d.type))];
        result.hasPII = result.piiDetails.length > 0;
        result.riskLevel = this.calculateRiskLevel(result.piiTypes);
      }

      return result;
    } catch (error) {
      console.error('Advanced detection error:', error.message);
      // Fallback to compromise (more reliable than LLM)
      const fallbackResult = await this.compromiseDetector.detect(content, options);
      fallbackResult.detectionMethod = 'compromise-fallback';
      return fallbackResult;
    }
  }

  getName() {
    return 'advanced';
  }

  /**
   * Validation agent (shared with OllamaPIIDetector)
   */
  async validateFindings(result, content) {
    return await this.ollamaDetector.validateFindings(result, content);
  }
}

/**
 * Factory to create appropriate detector
 */
class PIIDetectorFactory {
  static create(method, ollamaUrl, authToken, model) {
    switch(method?.toLowerCase()) {
      case 'ollama':
        return new OllamaPIIDetector(ollamaUrl, authToken, model);
      case 'regex':
        return new RegexPIIDetector();
      case 'compromise':
        return new CompromisePIIDetector();
      case 'advanced':
        return new AdvancedPIIDetector(ollamaUrl, authToken, model);
      case 'hybrid':
      default:
        return new HybridPIIDetector(ollamaUrl, authToken, model);
    }
  }
}

module.exports = {
  PIIDetectorFactory,
  PIIResult,
  RegexPIIDetector,
  OllamaPIIDetector,
  HybridPIIDetector,
  CompromisePIIDetector,
  AdvancedPIIDetector
};
