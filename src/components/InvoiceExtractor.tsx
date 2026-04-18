'use client';

import { useRef, useState } from 'react';
import { usePdfExtraction } from '@/hooks/usePdfExtraction';
import { generateExcelFile } from '@/lib/excelExport';
import FileUploadArea from './FileUploadArea';
import ProcessingProgress from './ProcessingProgress';
import ResultsTable from './ResultsTable';

export default function InvoiceExtractor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isLoading, progress, error, invoices, processPdf, reset } = usePdfExtraction();
  const [fileName, setFileName] = useState<string>('');

  const excelFileName = fileName
    ? fileName.replace(/\.pdf$/i, '.xlsx')
    : 'Facturi_Extrase.xlsx';

  const handleFileSelect = async (file: File) => {
    const mimeType = typeof file.type === 'string' ? file.type : '';
    const isPdfMimeType = mimeType.toLowerCase().includes('pdf');
    const isPdfByName = /\.pdf$/i.test(file.name);

    if (!isPdfMimeType && !isPdfByName) {
      alert('Please select a PDF file');
      return;
    }

    setFileName(file.name);
    try {
      const extractedInvoices = await processPdf(file);

      if (extractedInvoices.length === 0) {
        alert('No invoice data was detected in this PDF, so no Excel file can be generated yet.');
      }
    } catch (err) {
      console.error('Error processing PDF:', err);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleExcelExport = () => {
    if (invoices.length > 0) {
      generateExcelFile(invoices, excelFileName);
    }
  };

  const handleReset = () => {
    reset();
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Invoice Extractor
            </h1>
            <p className="text-gray-600">
              Upload a PDF with multiple invoices to extract data automatically
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-semibold">Error</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* File Upload or Results */}
          {invoices.length === 0 && !isLoading ? (
            <>
              <FileUploadArea
                fileInputRef={fileInputRef}
                onFileSelect={handleFileSelect}
                onInputChange={handleFileInputChange}
              />

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>What will be extracted:</strong> Invoice date, series number,
                  supplier name, fiscal code, total amount including VAT, and VAT breakdown by rate when the summary table is present.
                </p>
              </div>
            </>
          ) : null}

          {/* Processing State */}
          {isLoading && (
            <ProcessingProgress
              progress={progress}
              fileName={fileName}
              processedCount={invoices.length}
            />
          )}

          {/* Results */}
          {invoices.length > 0 && !isLoading && (
            <div>
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 font-semibold">
                  ✓ Successfully extracted {invoices.length} invoice(s)
                </p>
              </div>

              <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <h3 className="text-lg font-bold text-emerald-900">Export Excel</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  The extracted data is ready for download.
                </p>
                <div className="mt-3 text-sm text-emerald-900">
                  <p>Invoices: {invoices.length}</p>
                  <p>File: {excelFileName}</p>
                </div>
                <button
                  onClick={handleExcelExport}
                  className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 shadow-md"
                >
                  Download Excel
                </button>
              </div>

              <div className="mb-6 flex gap-4">
                <button
                  onClick={handleReset}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 shadow-md"
                >
                  Start Over
                </button>
              </div>

              <ResultsTable invoices={invoices} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
