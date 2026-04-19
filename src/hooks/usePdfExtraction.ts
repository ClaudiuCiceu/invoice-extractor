'use client';

import { useState, useCallback } from 'react';
import { ExtractedInvoice, extractInvoiceData, isInvoiceDataValid } from '../lib/extractionPatterns';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.js');

type PromiseWithResolversResult<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PromiseWithResolvers = <T>() => PromiseWithResolversResult<T>;

function ensurePromiseWithResolvers() {
  const promiseCtor = Promise as PromiseConstructor & {
    withResolvers?: PromiseWithResolvers;
  };

  if (typeof promiseCtor.withResolvers === 'function') {
    return;
  }

  promiseCtor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };
}

let pdfJsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs() {
  if (typeof window === 'undefined') {
    throw new Error('PDF processing is only available in the browser.');
  }

  ensurePromiseWithResolvers();

  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.js').then((pdfjsLib) => {
      const globalWorkerOptions = pdfjsLib.GlobalWorkerOptions;
      if (globalWorkerOptions && !globalWorkerOptions.workerSrc) {
        globalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      return pdfjsLib;
    });
  }

  return pdfJsPromise;
}

export interface ProcessingState {
  isLoading: boolean;
  progress: number;
  error?: string;
  invoices: ExtractedInvoice[];
}

function mergeInvoiceData(base: ExtractedInvoice, incoming: ExtractedInvoice): ExtractedInvoice {
  const preferIncomingTotal = Boolean(incoming.totalValInclTva);

  return {
    data: incoming.data || base.data,
    nrFf: incoming.nrFf || base.nrFf,
    denumire: incoming.denumire || base.denumire,
    cif: incoming.cif || base.cif,
    totalValInclTva: preferIncomingTotal ? incoming.totalValInclTva : (base.totalValInclTva || incoming.totalValInclTva),
    cumpScutite: preferIncomingTotal ? (incoming.cumpScutite || base.cumpScutite) : (base.cumpScutite || incoming.cumpScutite),
    baza21: incoming.baza21 || base.baza21,
    tva21: incoming.tva21 || base.tva21,
    baza19: incoming.baza19 || base.baza19,
    tva19: incoming.tva19 || base.tva19,
    baza11: incoming.baza11 || base.baza11,
    tva11: incoming.tva11 || base.tva11,
    baza9: incoming.baza9 || base.baza9,
    tva9: incoming.tva9 || base.tva9,
  };
}

function getInvoiceKey(invoice: ExtractedInvoice, fallbackCounter: number): string {
  if (invoice.nrFf) {
    return `NR:${invoice.nrFf.trim().toUpperCase()}`;
  }

  return `FB:${invoice.data}|${invoice.cif}|${invoice.totalValInclTva}|${fallbackCounter}`;
}

function extractPageText(textContent: unknown): string {
  if (!textContent || typeof textContent !== 'object') {
    return '';
  }

  const items = (textContent as { items?: Array<{ str?: string; hasEOL?: boolean } | null | undefined> }).items;
  if (!Array.isArray(items)) {
    return '';
  }

  const parts: string[] = [];

  for (const item of items) {
    if (item && typeof item.str === 'string' && item.str.length > 0) {
      parts.push(item.str);
    }

    parts.push(item?.hasEOL ? '\n' : ' ');
  }

  return parts.join('').replace(/[\t\x0B\f\r ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

export function usePdfExtraction() {
  const [state, setState] = useState<ProcessingState>({
    isLoading: false,
    progress: 0,
    invoices: [],
  });

  const processPdf = useCallback(async (file: File) => {
    setState({ isLoading: true, progress: 0, invoices: [] });
    let stage = 'initialization';

    try {
      stage = 'loading PDF.js';
      const pdfjsLib = await loadPdfJs();
      if (typeof pdfjsLib.getDocument !== 'function') {
        throw new Error('PDF.js failed to load correctly: getDocument is unavailable.');
      }

      stage = 'reading file';
      const fileData = await file.arrayBuffer();
      stage = 'opening PDF';
      let loadingTask = pdfjsLib.getDocument({ data: fileData });
      if (!loadingTask?.promise) {
        throw new Error('PDF.js loading task is invalid.');
      }

      let pdf;
      try {
        pdf = await loadingTask.promise;
      } catch (workerError) {
        console.warn('[PDF] Worker mode failed, retrying with disableWorker.', workerError);
        stage = 'opening PDF without worker';
        loadingTask = pdfjsLib.getDocument({ data: fileData, disableWorker: true } as any);
        if (!loadingTask?.promise) {
          throw new Error('PDF.js loading task is invalid after worker fallback.');
        }
        pdf = await loadingTask.promise;
      }

      if (!pdf || typeof pdf.numPages !== 'number') {
        throw new Error('PDF.js returned an invalid document object.');
      }

      const totalPages = pdf.numPages;
      const pageTexts: string[] = [];
      const finalizedInvoices = new Map<string, ExtractedInvoice>();
      let fallbackKeyCounter = 0;

      const extractInvoiceSeriesKey = (text: string): string => {
        const invoiceData = extractInvoiceData(text);

        const nrFf = invoiceData.nrFf.trim().toUpperCase();
        const data = invoiceData.data.trim();
        const cif = invoiceData.cif.trim().toUpperCase();
        const total = invoiceData.totalValInclTva.trim();

        if (nrFf) {
          return [`NR:${nrFf}`, data ? `D:${data}` : '', total ? `T:${total}` : '', cif ? `C:${cif}` : '']
            .filter(Boolean)
            .join('|');
        }

        if (data && total) {
          return `FB:${data}|${cif}|${total}`;
        }

        if (data && cif) {
          return `FB:${data}|${cif}`;
        }

        return '';
      };

      const groupPagesIntoInvoiceChunks = (pages: string[]): string[] => {
        const chunks: string[] = [];
        let currentPages: string[] = [];
        let currentSeriesKey = '';

        const looksLikeInvoiceStart = (text: string): boolean => {
          const topRegion = text.slice(0, Math.min(text.length, 1400));
          const hasInvoiceTitle = /\bFACTUR[ĂA]\b/i.test(topRegion);
          const hasHeaderMetadata = /\b(?:Serie\s*(?:si|și)\s*num[ăa]r|Nr\.?\s*factur[ăa]|Factura\s*nr\.?|Data\s*emiterii|Data\s*facturii|Index\s+de\s+incarcare|Codificare\s+RO-E-Factura)\b/i.test(topRegion);
          const hasPartyHeader = /\b(?:FURNIZOR|CLIENT|CUMPARATOR|BENEFICIAR)\b/i.test(topRegion);

          return (hasInvoiceTitle && hasHeaderMetadata) || (hasHeaderMetadata && hasPartyHeader);
        };

        const flushCurrentChunk = () => {
          if (currentPages.length === 0) {
            return;
          }

          const chunk = currentPages.join('\n---PAGE_BREAK---\n').trim();
          if (chunk) {
            chunks.push(chunk);
          }

          currentPages = [];
          currentSeriesKey = '';
        };

        for (const pageText of pages) {
          const pageSeriesKey = extractInvoiceSeriesKey(pageText);
          const startsNewInvoice = currentPages.length > 0
            && looksLikeInvoiceStart(pageText)
            && Boolean(pageSeriesKey)
            && Boolean(currentSeriesKey)
            && pageSeriesKey !== currentSeriesKey;

          if (startsNewInvoice) {
            flushCurrentChunk();
          }

          if (!currentSeriesKey && pageSeriesKey) {
            currentSeriesKey = pageSeriesKey;
          }

          currentPages.push(pageText);
        }

        flushCurrentChunk();
        return chunks;
      };

      const storeInvoice = (invoice: ExtractedInvoice) => {
        if (!isInvoiceDataValid(invoice)) {
          return;
        }

        const key = getInvoiceKey(invoice, fallbackKeyCounter);
        if (key.startsWith('FB:')) {
          fallbackKeyCounter += 1;
        }

        const existing = finalizedInvoices.get(key);
        if (existing) {
          finalizedInvoices.set(key, mergeInvoiceData(existing, invoice));
          return;
        }

        finalizedInvoices.set(key, { ...invoice });
      };

      const mergeAdjacentSplitInvoices = (invoices: ExtractedInvoice[]): ExtractedInvoice[] => {
        const merged: ExtractedInvoice[] = [];

        const hasCoreIdentity = (invoice: ExtractedInvoice): boolean => Boolean(invoice.nrFf || invoice.denumire || invoice.cif);
        const hasTotal = (invoice: ExtractedInvoice): boolean => Boolean(invoice.totalValInclTva);

        for (const current of invoices) {
          const previous = merged[merged.length - 1];
          if (!previous) {
            merged.push({ ...current });
            continue;
          }

          const sameDate = Boolean(previous.data) && Boolean(current.data) && previous.data === current.data;
          const sameCif = Boolean(previous.cif) && Boolean(current.cif) && previous.cif === current.cif;
          const oneMissingTotal = hasTotal(previous) !== hasTotal(current);
          const oneMissingIdentity = hasCoreIdentity(previous) !== hasCoreIdentity(current);

          if (sameDate && (sameCif || oneMissingIdentity) && oneMissingTotal) {
            merged[merged.length - 1] = mergeInvoiceData(previous, current);
            continue;
          }

          merged.push({ ...current });
        }

        return merged;
      };

      // Read all pages first, then group them into invoice-sized chunks.
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        stage = `reading page ${pageNum}`;
        const page = await pdf.getPage(pageNum);
        if (!page || typeof page.getTextContent !== 'function') {
          throw new Error(`Page ${pageNum} is invalid or unreadable.`);
        }

        stage = `extracting text on page ${pageNum}`;
        const textContent = await page.getTextContent();
        const pageText = extractPageText(textContent);
        if (pageText) {
          pageTexts.push(pageText);
          console.log(`[PDF][page ${pageNum}] raw text:`, pageText);
        }

        // Update progress
        const progress = Math.round((pageNum / totalPages) * 70);
        setState(prev => ({
          ...prev,
          progress,
        }));
      }

      const invoiceChunks = groupPagesIntoInvoiceChunks(pageTexts);

      for (let chunkIndex = 0; chunkIndex < invoiceChunks.length; chunkIndex++) {
        stage = `extracting invoice chunk ${chunkIndex + 1}`;
        const chunk = invoiceChunks[chunkIndex];
        const invoiceData = extractInvoiceData(chunk);
        console.log(`[PDF][chunk ${chunkIndex + 1}] parsed fields:`, invoiceData);

        storeInvoice(invoiceData);

        const progress = 70 + Math.round(((chunkIndex + 1) / Math.max(invoiceChunks.length, 1)) * 30);
        setState(prev => ({
          ...prev,
          progress,
        }));
      }

      const invoices = mergeAdjacentSplitInvoices(Array.from(finalizedInvoices.values())).map((invoice, index) => ({
        ...invoice,
        nrCrt: index + 1,
      }));

      setState(prev => ({
        ...prev,
        isLoading: false,
        progress: 100,
        invoices,
      }));

      return invoices;
    } catch (error) {
      const baseError = error instanceof Error ? error.message : 'Failed to process PDF';
      const errorMessage = `Failed at ${stage}: ${baseError}`;
      console.error('[PDF] Processing failed with details:', {
        stage,
        error,
      });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      progress: 0,
      invoices: [],
    });
  }, []);

  return {
    ...state,
    processPdf,
    reset,
  };
}
