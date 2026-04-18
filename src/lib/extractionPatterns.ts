/**
 * Regex patterns for extracting invoice data
 */

export const REGEX_PATTERNS = {
  DATE: /Data\s*(?:emiterii|facturii)?\s*[:\-]?\s*(\d{2}[./]\d{2}[./]\d{4})/i,
  FURNIZOR_SECTION: /(?:FURNIZOR|PRESTATOR|EMITENT|VANZATOR|VÂNZĂTOR)\s+([\s\S]*?)(?=\b(?:Cod\s+fiscal|CIF|CLIENT|CUMPARATOR|BENEFICIAR)\b|$)/i,
  CIF_AFTER_FURNIZOR: /(?:Cod\s+fiscal|CIF)\s*[:\-]?\s*(RO\s*[0-9]{2,12}|[0-9]{2,12})/i,
  TOTAL: /TOTAL\s+(?:DE\s+PLAT[ĂA]|FACTUR[ĂA]|GENERAL|PLATA)\b[\s:\-]*([\-−]?\s*[0-9][0-9.,\s]*|\(\s*[0-9][0-9.,\s]*\))/i,
};

const TOTAL_CONTEXT_MARKER = /TOTAL\s+(?:DE\s+PLAT[ĂA]|FACTUR[ĂA]|GENERAL|PLATA|FACTURA)/i;

const FALLBACK_PATTERNS = {
  DATE: [
    REGEX_PATTERNS.DATE,
    /(\d{2}[./]\d{2}[./]\d{4})/,
  ],
  SERIE_NR: [
    /(?:Serie\s*(?:si|și)\s*num[ăa]r|Nr\.?\s*factur[ăa]|Factura\s*nr\.?)\s*[:\-]?\s*([A-Za-z0-9_\/-]+)/i,
  ],
  FURNIZOR: [
    REGEX_PATTERNS.FURNIZOR_SECTION,
  ],
  CIF: [
    REGEX_PATTERNS.CIF_AFTER_FURNIZOR,
    /Cod\s+fiscal\s*[:\-]?\s*(RO\s*[0-9]{6,12}|[A-Z]{2}\s*[0-9]{6,12}|[0-9]{6,12})/i,
    /(RO\s*[0-9]{6,12})/i,
  ],
  TOTAL: [
    REGEX_PATTERNS.TOTAL,
  ],
};

export interface ExtractedInvoice {
  nrCrt?: number;
  data: string;
  nrFf: string;
  denumire: string;
  cif: string;
  totalValInclTva: string;
  cumpScutite: string;
  baza21: string;
  tva21: string;
  baza19: string;
  tva19: string;
  baza11: string;
  tva11: string;
  baza9: string;
  tva9: string;
}

type VatBreakdown = Pick<ExtractedInvoice, 'baza21' | 'tva21' | 'baza19' | 'tva19' | 'baza11' | 'tva11' | 'baza9' | 'tva9'>;

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const value = text.match(pattern)?.[1];
    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeDate(value: string): string {
  const trimmed = (value || '').trim().replace(/\//g, '.');
  const parts = trimmed.split('.');

  if (parts.length !== 3) {
    return trimmed;
  }

  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];

  return `${day}.${month}.${year}`;
}

function normalizeInvoiceNumber(value: string): string {
  return (value || '').trim().replace(/[;,]$/, '');
}

function isCnp(value: string): boolean {
  const compactDigits = (value || '').replace(/\s+/g, '');
  return /^\d{13}$/.test(compactDigits);
}

function isValidInvoiceNumber(value: string): boolean {
  if (!value) {
    return false;
  }

  if (!/^[A-Za-z0-9_\s\/-]+$/.test(value)) {
    return false;
  }

  return !isCnp(value);
}

function extractInvoiceNumber(text: string): string {
  const patterns = [
    /(?:Serie\s*(?:si|și)\s*num[ăa]r|Nr\.?\s*factur[ăa]|Serie)[:\s-]+(.+?)(?=\s+(?:Data|Din|Pagina|Index)\b|\n|\r|$)/gi,
    /Factura\s*nr\.?\s*[:\-]?\s*(.+?)(?=\s+(?:Data|Din|Pagina|Index)\b|\n|\r|$)/gi,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const candidate = normalizeInvoiceNumber((match[1] || '').replace(/\s+/g, ' ').trim());
      if (candidate.length >= 3 && isValidInvoiceNumber(candidate)) {
        return candidate;
      }
    }
  }

  const fallback = normalizeInvoiceNumber(firstMatch(text, FALLBACK_PATTERNS.SERIE_NR));
  if (fallback.length >= 3 && isValidInvoiceNumber(fallback)) {
    return fallback;
  }

  return '';
}

function normalizeCompanyName(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCif(value: string): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeAmount(value: string): string {
  const raw = (value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/−/g, '-')
    .replace(/RON/gi, '');

  if (!raw) {
    return '';
  }

  const isNegative = raw.startsWith('-') || raw.endsWith('-') || (raw.includes('(') && raw.includes(')'));
  let unsigned = raw.replace(/[()\-]/g, '');

  if (unsigned.includes(',') && unsigned.includes('.')) {
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    if (lastComma > lastDot) {
      unsigned = unsigned.replace(/\./g, '').replace(',', '.');
    } else {
      unsigned = unsigned.replace(/,/g, '');
    }
  } else if (unsigned.includes(',')) {
    const parts = unsigned.split(',');
    unsigned = parts[1] && (parts[1].length === 2 || parts[1].length === 3)
      ? `${parts[0].replace(/\./g, '')}.${parts[1]}`
      : unsigned.replace(/,/g, '');
  } else if ((unsigned.match(/\./g) || []).length > 1) {
    unsigned = unsigned.replace(/\./g, '');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(unsigned)) {
    unsigned = unsigned.replace(/\./g, '');
  }

  return isNegative ? `-${unsigned}` : unsigned;
}

function extractInvoiceDate(text: string): string {
  const explicitPatterns = [
    /Data\s*emiterii\s*[:\-]?\s*(\d{2}[./]\d{2}[./]\d{4})/i,
    /Data\s*facturii\s*[:\-]?\s*(\d{2}[./]\d{2}[./]\d{4})/i,
    /\bData\b\s*[:\-]?\s*(\d{2}[./]\d{2}[./]\d{4})/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeDate(match[1]);
    }
  }

  const candidateDatePattern = /(\d{2}[./]\d{2}[./]\d{4})/;
  const headerBoundary = text.search(/\b(?:FURNIZOR|PRESTATOR|EMITENT|CLIENT|TOTAL)\b/i);
  const headerRegion = headerBoundary > 0 ? text.slice(0, headerBoundary) : text.slice(0, Math.min(500, text.length));
  const headerDate = headerRegion.match(candidateDatePattern)?.[1];
  if (headerDate) {
    return normalizeDate(headerDate);
  }

  const fallbackRegion = text.slice(0, Math.min(Math.ceil(text.length * 0.35), 1200));
  const fallbackDate = fallbackRegion.match(candidateDatePattern)?.[1];
  return fallbackDate ? normalizeDate(fallbackDate) : '';
}

function parseAmountToNumber(value: string): number | null {
  const compact = (value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/−/g, '-')
    .replace(/RON/gi, '');

  if (!compact) {
    return null;
  }

  const isNegative = compact.startsWith('-') || (compact.includes('(') && compact.includes(')'));
  let normalized = compact.replace(/[()\-]/g, '');

  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isNegative ? -parsed : parsed;
}

function extractTotalFromContext(text: string): string {
  const contextRegex = /TOTAL\s+(?:DE\s+PLAT[ĂA]|FACTUR[ĂA]|GENERAL|PLATA|FACTURA)[\s\S]{0,140}/gi;
  const contexts = Array.from(text.matchAll(contextRegex));
  if (contexts.length === 0) {
    return '';
  }

  const amountMatchRegex = /(\(?\s*[-−]?\s*[0-9][0-9.,\s]*\s*\)?\s*[-−]?)(?:\s*RON)?/i;

  // Prefer the last TOTAL context because summaries often appear near the end of a segment.
  for (let idx = contexts.length - 1; idx >= 0; idx--) {
    const context = contexts[idx][0] || '';
    const amountMatch = context.match(amountMatchRegex);
    if (!amountMatch?.[1]) {
      continue;
    }

    return normalizeAmount(amountMatch[1]);
  }

  const fallbackContext = contexts[contexts.length - 1][0] || '';
  const numberMatch = fallbackContext.match(/[0-9]{1,3}(?:[.\s][0-9]{3})*(?:[.,][0-9]{2,4})?/);
  if (!numberMatch?.[0]) {
    return '';
  }

  const hasMinus = /[-−]|\(.*\)/.test(fallbackContext);
  const normalizedNumber = numberMatch[0].replace(/\s+/g, '');
  const signedValue = hasMinus ? `-${normalizedNumber.replace(/^-/, '')}` : normalizedNumber;

  return normalizeAmount(signedValue);
}

function extractTotalValue(text: string): string {
  if (!TOTAL_CONTEXT_MARKER.test(text)) {
    return normalizeAmount(firstMatch(text, FALLBACK_PATTERNS.TOTAL));
  }

  const contextual = extractTotalFromContext(text);
  if (contextual) {
    return contextual;
  }

  return normalizeAmount(firstMatch(text, FALLBACK_PATTERNS.TOTAL));
}

function extractVendorName(text: string): string {
  const section = firstMatch(text, FALLBACK_PATTERNS.FURNIZOR);
  return normalizeCompanyName(section);
}

function extractVendorCif(text: string): string {
  const vendorHeaders = /\b(?:FURNIZOR|PRESTATOR|EMITENT|VANZATOR|VÂNZĂTOR)\b/i;
  const excludedHeaders = /\b(?:CLIENT|CUMPARATOR|BENEFICIAR)\b/i;

  const vendorHeaderMatch = text.match(vendorHeaders);
  if (vendorHeaderMatch?.index !== undefined) {
    const vendorStart = vendorHeaderMatch.index;
    const customerStart = text.slice(vendorStart + 1).search(excludedHeaders);
    const vendorEnd = customerStart >= 0 ? vendorStart + 1 + customerStart : Math.min(text.length, vendorStart + 1200);
    const vendorSection = text.slice(vendorStart, vendorEnd);

    const sectionMatch = vendorSection.match(/(?:Cod\s+fiscal|CIF)\s*[:\-]?\s*(RO\s*[0-9]{2,12}|[0-9]{2,12})/i)?.[1];
    if (sectionMatch) {
      return normalizeCif(sectionMatch);
    }
  }

  const topOfText = text.slice(0, Math.min(1200, text.length));
  const firstVendorCif = Array.from(topOfText.matchAll(/(?:Cod\s+fiscal|CIF)\s*[:\-]?\s*(RO\s*[0-9]{2,12}|[0-9]{2,12})/gi))[0]?.[1];
  if (firstVendorCif) {
    return normalizeCif(firstVendorCif);
  }

  return normalizeCif(firstMatch(text, FALLBACK_PATTERNS.CIF));
}

function isVatSuspicious(totalValue: string, vatValue: string): boolean {
  const total = parseAmountToNumber(totalValue);
  const vat = parseAmountToNumber(vatValue);

  if (total === null || vat === null || total <= 0) {
    return false;
  }

  return vat > total * 0.5;
}

function emptyVatBreakdown(): VatBreakdown {
  return {
    baza21: '0',
    tva21: '0',
    baza19: '0',
    tva19: '0',
    baza11: '0',
    tva11: '0',
    baza9: '0',
    tva9: '0',
  };
}

function getSummarySection(text: string): string {
  const upper = text.toUpperCase();
  const anchors = ['RECAPITULARE', 'SUBTOTAL', 'BAZA IMPOZABILA', 'COTA TVA', 'TOTAL TVA'];

  let idx = -1;
  for (const anchor of anchors) {
    idx = Math.max(idx, upper.lastIndexOf(anchor));
  }

  if (idx >= 0) {
    return text.slice(idx);
  }

  return text.slice(Math.max(0, text.length - 2500));
}

function extractVatBreakdown(text: string): VatBreakdown {
  const result = emptyVatBreakdown();
  const summaryText = getSummarySection(text);

  // User requirement: parse only from recap section under table.
  if (!/\bSUBTOTAL\b/i.test(summaryText) || !/\bTVA\b/i.test(summaryText)) {
    return result;
  }

  const amountPattern = '[-−]?\\s*[0-9]{1,3}(?:[.\\s][0-9]{3})*(?:[.,][0-9]{2,4})?';
  const fields: Record<'21' | '19' | '11' | '9', [keyof VatBreakdown, keyof VatBreakdown]> = {
    '21': ['baza21', 'tva21'],
    '19': ['baza19', 'tva19'],
    '11': ['baza11', 'tva11'],
    '9': ['baza9', 'tva9'],
  };

  for (const rate of ['21', '19', '11', '9'] as const) {
    const patterns = [
      new RegExp(`(?:${rate}%|${rate})\\s+(${amountPattern})\\s+(${amountPattern})`, 'i'),
      new RegExp(`(?:${rate}%|${rate})[^\\n\\r]{0,140}?(?:SUBTOTAL|BAZA(?:\\s+IMPOZABILA)?)[^\\n\\r]{0,30}(${amountPattern})[^\\n\\r]{0,30}(?:TVA)[^\\n\\r]{0,30}(${amountPattern})`, 'i'),
      new RegExp(`(?:SUBTOTAL|BAZA(?:\\s+IMPOZABILA)?)[^\\n\\r]{0,30}(${amountPattern})[^\\n\\r]{0,30}(?:TVA)[^\\n\\r]{0,30}(${amountPattern})[^\\n\\r]{0,100}(?:${rate}%|${rate})`, 'i'),
    ];

    let found: RegExpMatchArray | null = null;
    for (const pattern of patterns) {
      const match = summaryText.match(pattern);
      if (match?.[1] && match?.[2]) {
        found = match;
        break;
      }
    }

    if (!found) {
      continue;
    }

    const base = normalizeAmount(found[1]);
    const vat = normalizeAmount(found[2]);
    const [baseField, vatField] = fields[rate];
    result[baseField] = base;
    result[vatField] = vat;
  }

  return result;
}

function sanitizeVatByTotal(total: string, breakdown: VatBreakdown): VatBreakdown {
  const clean = { ...breakdown };

  const pairs: Array<[keyof VatBreakdown, keyof VatBreakdown]> = [
    ['baza21', 'tva21'],
    ['baza19', 'tva19'],
    ['baza11', 'tva11'],
    ['baza9', 'tva9'],
  ];

  for (const [baseField, vatField] of pairs) {
    if (clean[vatField] && isVatSuspicious(total, clean[vatField])) {
      clean[baseField] = '';
      clean[vatField] = '';
    }
  }

  return clean;
}

function deriveExemptPurchases(total: string, vatBreakdown: Pick<ExtractedInvoice, 'tva21' | 'tva19' | 'tva11' | 'tva9'>): string {
  const vatValues = [vatBreakdown.tva21, vatBreakdown.tva19, vatBreakdown.tva11, vatBreakdown.tva9]
    .map(parseAmountToNumber)
    .filter((value): value is number => value !== null);

  if (vatValues.length === 0) {
    return total;
  }

  const totalVat = vatValues.reduce((sum, value) => sum + value, 0);
  return Math.abs(totalVat) < 0.0001 ? total : '';
}

export function isInvoiceDataValid(invoice: ExtractedInvoice): boolean {
  return Boolean(invoice.nrFf || invoice.totalValInclTva);
}

export function extractInvoiceData(text: string): ExtractedInvoice {
  const rawText = (text || '').replace(/\r/g, ' ');
  const normalizedText = rawText
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const data = extractInvoiceDate(normalizedText) || normalizeDate(firstMatch(normalizedText, FALLBACK_PATTERNS.DATE));
  const serieNr = extractInvoiceNumber(rawText) || extractInvoiceNumber(normalizedText);
  const denumire = extractVendorName(normalizedText);
  const cif = extractVendorCif(normalizedText);

  const total = extractTotalValue(normalizedText);

  const rawVat = extractVatBreakdown(normalizedText);
  const vatBreakdown = sanitizeVatByTotal(total, rawVat);
  const cumpScutite = deriveExemptPurchases(total, vatBreakdown);

  return {
    data,
    nrFf: serieNr,
    denumire,
    cif,
    totalValInclTva: total,
    cumpScutite,
    ...vatBreakdown,
  };
}
