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

function createEmptyInvoice(): ExtractedInvoice {
  return {
    data: '',
    nrFf: '',
    denumire: '',
    cif: '',
    totalValInclTva: '',
    cumpScutite: '',
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

function hasAnyInvoiceSignal(invoice: ExtractedInvoice): boolean {
  return Boolean(
    invoice.nrFf
    || invoice.totalValInclTva
    || invoice.data
    || invoice.cif
    || invoice.denumire
  );
}

function getInvoiceKey(invoice: ExtractedInvoice, fallbackCounter: number): string {
  if (invoice.nrFf) {
    return `NR:${invoice.nrFf.trim().toUpperCase()}`;
  }

  return `FB:${invoice.data}|${invoice.cif}|${invoice.totalValInclTva}|${fallbackCounter}`;
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

      const finalizedInvoices = new Map<string, ExtractedInvoice>();
      const totalPages = pdf.numPages;
      let currentInvoice = createEmptyInvoice();
      let fallbackKeyCounter = 0;

      const splitIntoInvoiceSegments = (pageText: string): string[] => {
        const normalized = pageText.replace(/\s+/g, ' ').trim();
        if (!normalized) {
          return [];
        }

        const headerRegex = /\b(?:FURNIZOR|PRESTATOR|EMITENT)\b/gi;
        const headerMatches = Array.from(normalized.matchAll(headerRegex));

        if (headerMatches.length <= 1) {
          return [normalized];
        }

        const segments: string[] = [];
        let start = 0;

        for (const match of headerMatches) {
          const idx = match.index ?? 0;
          if (idx > start) {
            const chunk = normalized.slice(start, idx).trim();
            if (chunk) {
              segments.push(chunk);
            }
          }
          start = idx;
        }

        const tail = normalized.slice(start).trim();
        if (tail) {
          segments.push(tail);
        }

        return segments.length > 0 ? segments : [normalized];
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

      const finalizeCurrentInvoice = () => {
        if (!hasAnyInvoiceSignal(currentInvoice)) {
          return;
        }

        storeInvoice(currentInvoice);
        currentInvoice = createEmptyInvoice();
      };

      // Process each page
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        stage = `reading page ${pageNum}`;
        const page = await pdf.getPage(pageNum);
        if (!page || typeof page.getTextContent !== 'function') {
          throw new Error(`Page ${pageNum} is invalid or unreadable.`);
        }

        stage = `extracting text on page ${pageNum}`;
        const textContent = await page.getTextContent();
        if (!textContent || !Array.isArray(textContent.items)) {
          throw new Error(`Text content on page ${pageNum} is missing or malformed.`);
        }

        // Extract text from page
        const textItems = textContent.items as Array<{ str?: string } | null | undefined>;
        const text = textItems
          .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
          .join(' ');
        const normalizedPageText = text.replace(/\s+/g, ' ').trim();
        const segments = splitIntoInvoiceSegments(normalizedPageText);

        console.log(`[PDF][page ${pageNum}] raw text:`, text);

        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
          const segment = segments[segmentIndex];
          const hasHeaderMarker = /\b(FURNIZOR|PRESTATOR|EMITENT)\b/i.test(segment);
          const hasTotalMarker = /\bTOTAL\s+(?:DE\s+PLAT[ĂA]|FACTUR[ĂA]|GENERAL)\b/i.test(segment);

          stage = `extracting fields on page ${pageNum}, segment ${segmentIndex + 1}`;
          const invoiceData = extractInvoiceData(segment);
          console.log(`[PDF][page ${pageNum}][segment ${segmentIndex + 1}] parsed fields:`, invoiceData);

          const startsAnotherInvoice = hasHeaderMarker
            && Boolean(currentInvoice.nrFf)
            && Boolean(invoiceData.nrFf)
            && currentInvoice.nrFf !== invoiceData.nrFf;

          if (startsAnotherInvoice) {
            console.log(`[PDF][page ${pageNum}] New invoice boundary detected. Finalizing previous invoice:`, currentInvoice);
            finalizeCurrentInvoice();
          }

          if (!hasAnyInvoiceSignal(currentInvoice) && !hasAnyInvoiceSignal(invoiceData)) {
            continue;
          }

          currentInvoice = mergeInvoiceData(currentInvoice, invoiceData);

          const invoiceCompleted = hasTotalMarker || Boolean(invoiceData.totalValInclTva);
          if (invoiceCompleted && isInvoiceDataValid(currentInvoice)) {
            console.log(`[PDF][page ${pageNum}] finalized invoice:`, currentInvoice);
            finalizeCurrentInvoice();
          }
        }

        // Update progress
        const progress = Math.round((pageNum / totalPages) * 100);
        setState(prev => ({
          ...prev,
          progress,
          invoices: Array.from(finalizedInvoices.values()).map((invoice, index) => ({
            ...invoice,
            nrCrt: index + 1,
          })),
        }));
      }

      // Flush the trailing invoice that might span to the end of the document.
      finalizeCurrentInvoice();

      const invoices = Array.from(finalizedInvoices.values()).map((invoice, index) => ({
        ...invoice,
        nrCrt: index + 1,
      }));

      setState(prev => ({
        ...prev,
        isLoading: false,
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
