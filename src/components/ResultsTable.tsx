'use client';

import { ExtractedInvoice } from '../lib/extractionPatterns';

interface ResultsTableProps {
  invoices: ExtractedInvoice[];
}

export default function ResultsTable({ invoices }: ResultsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-indigo-600 text-white">
            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">
              NR. CRT
            </th>
            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">
              DATA
            </th>
            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">
              NR. FF
            </th>
            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">
              DENUMIRE
            </th>
            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">
              CIF
            </th>
            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">
              TOTAL VAL INCL. TVA
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, index) => (
            <tr
              key={index}
              className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              <td className="border border-gray-300 px-4 py-3 text-gray-900">
                {invoice.nrCrt || index + 1}
              </td>
              <td className="border border-gray-300 px-4 py-3 text-gray-900">
                {invoice.data || '-'}
              </td>
              <td className="border border-gray-300 px-4 py-3 text-gray-900 font-mono">
                {invoice.nrFf || '-'}
              </td>
              <td className="border border-gray-300 px-4 py-3 text-gray-900">
                {invoice.denumire || '-'}
              </td>
              <td className="border border-gray-300 px-4 py-3 text-gray-900 font-mono">
                {invoice.cif || '-'}
              </td>
              <td className="border border-gray-300 px-4 py-3 text-gray-900 text-right">
                {invoice.totalValInclTva || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
