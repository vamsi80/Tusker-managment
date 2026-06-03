"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SuppliedBeforeBadge } from "./supplied-before-badge";

export interface QuoteComparison {
  quoteId: string;
  vendorName: string;
  unitPrice: number;
  totalPrice: number;
  leadTimeDays: number;
  hasSuppliedBefore: boolean;
  performanceScore: number;
}

interface VendorComparisonMatrixProps {
  quotes: QuoteComparison[];
  onApprove: (id: string) => void;
  onReject?: (id: string) => void;
}

export function VendorComparisonMatrix({ quotes, onApprove, onReject }: VendorComparisonMatrixProps) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      <Table>
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="font-semibold text-gray-700">Vendor Attributes</TableHead>
            {quotes.map((q) => (
              <TableHead key={q.quoteId} className="text-center font-semibold text-gray-900">
                {q.vendorName}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium text-gray-600">Unit Price (₹)</TableCell>
            {quotes.map((q) => (
              <TableCell key={q.quoteId} className="text-center font-semibold">
                ₹{q.unitPrice.toFixed(2)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium text-gray-600">Total Quote Amount</TableCell>
            {quotes.map((q) => (
              <TableCell key={q.quoteId} className="text-center font-bold text-gray-900">
                ₹{q.totalPrice.toFixed(2)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium text-gray-600">Lead Time</TableCell>
            {quotes.map((q) => (
              <TableCell key={q.quoteId} className="text-center">
                {q.leadTimeDays ? `${q.leadTimeDays} days` : "Immediate"}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium text-gray-600">Supplied This Before?</TableCell>
            {quotes.map((q) => (
              <TableCell key={q.quoteId} className="text-center">
                <SuppliedBeforeBadge hasSupplied={q.hasSuppliedBefore} />
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium text-gray-600">Vendor Performance</TableCell>
            {quotes.map((q) => (
              <TableCell key={q.quoteId} className="text-center">
                <span className="text-sm font-semibold px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">
                  {q.performanceScore}% Score
                </span>
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="font-medium text-gray-600">Actions</TableCell>
            {quotes.map((q) => (
              <TableCell key={q.quoteId} className="text-center space-x-2">
                <button
                  onClick={() => onApprove(q.quoteId)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Approve Quote
                </button>
                {onReject && (
                  <button
                    onClick={() => onReject(q.quoteId)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition"
                  >
                    Reject
                  </button>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
