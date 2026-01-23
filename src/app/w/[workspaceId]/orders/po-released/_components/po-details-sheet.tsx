'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PODetailsType } from '@/data/procurement/get-po-details';
import { formatDate } from '@/components/task/gantt/utils';
import { IconPrinter, IconDownload } from '@tabler/icons-react';
import { Skeleton } from '@/components/ui/skeleton';

interface PODetailsSheetProps {
    poId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Helper function to convert number to words
function numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero';

    const crores = Math.floor(num / 10000000);
    const lakhs = Math.floor((num % 10000000) / 100000);
    const thousands = Math.floor((num % 100000) / 1000);
    const hundreds = Math.floor((num % 1000) / 100);
    const remainder = num % 100;

    let result = '';

    if (crores > 0) result += numberToWords(crores) + ' Crore ';
    if (lakhs > 0) result += numberToWords(lakhs) + ' Lakh ';
    if (thousands > 0) result += numberToWords(thousands) + ' Thousand ';
    if (hundreds > 0) result += ones[hundreds] + ' Hundred ';

    if (remainder >= 20) {
        result += tens[Math.floor(remainder / 10)] + ' ';
        if (remainder % 10 > 0) result += ones[remainder % 10];
    } else if (remainder >= 10) {
        result += teens[remainder - 10];
    } else if (remainder > 0) {
        result += ones[remainder];
    }

    return result.trim();
}

export function PODetailsSheet({ poId, open, onOpenChange }: PODetailsSheetProps) {
    const [poDetails, setPODetails] = useState<PODetailsType | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (poId && open) {
            setLoading(true);
            fetch(`/api/procurement/po/${poId}`)
                .then(res => res.json())
                .then(data => {
                    setPODetails(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching PO details:', err);
                    setLoading(false);
                });
        }
    }, [poId, open]);

    const handlePrint = () => {
        window.print();
    };

    if (!open) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-5xl w-full overflow-y-auto print:max-w-full">
                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : poDetails ? (
                    <>
                        <SheetHeader className="print:hidden">
                            <div className="flex items-center justify-between">
                                <div>
                                    <SheetTitle className="text-2xl">Purchase Order</SheetTitle>
                                    <SheetDescription>
                                        PO #{poDetails.poNumber}
                                    </SheetDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handlePrint}>
                                        <IconPrinter className="h-4 w-4 mr-2" />
                                        Print
                                    </Button>
                                    <Button variant="outline" size="sm">
                                        <IconDownload className="h-4 w-4 mr-2" />
                                        Download
                                    </Button>
                                </div>
                            </div>
                        </SheetHeader>

                        {/* PO Template */}
                        <div className="mt-6 border-2 border-black print:mt-0 print:p-0">
                            {/* Header with Logo and Title */}
                            <div className="border-b-2 border-black p-4 flex items-end justify-between">
                                {/* Logo */}
                                <div className="w-24 h-24 relative flex-shrink-0">
                                    <Image
                                        src="/logo.png"
                                        alt="Company Logo"
                                        fill
                                        className="object-contain"
                                        priority
                                    />
                                </div>
                                <div className="text-right">
                                    <h1 className="text-3xl font-bold text-muted-foreground">Purchase Order</h1>
                                </div>
                            </div>

                            {/* 4-Column Grid: Workspace Details | Delivery Address | Purchase From | Date & PO Number */}
                            <div className="grid grid-cols-4 py-3">
                                {/* Column 1: Workspace Details */}
                                <div className="p-1 border-r-1 border-black">
                                    <h2 className="font-bold text-xs mb-1.5">{poDetails.workspace.legalName || poDetails.workspace.name}</h2>
                                    <div className="text-[10px] space-y-0.5">
                                        <p>
                                            {[
                                                poDetails.workspace.addressLine1,
                                                poDetails.workspace.addressLine2,
                                            ].filter(Boolean).join(', ')}
                                        </p>
                                        <p>
                                            {[
                                                poDetails.workspace.city,
                                                poDetails.workspace.state,
                                            ].filter(Boolean).join(', ')} - {poDetails.workspace.pincode}
                                        </p>
                                        <p>
                                            <span className="font-medium">Phone No:-</span> {poDetails.workspace.phone || 'N/A'}
                                        </p>
                                        <p>
                                            <span className="font-medium">Email ID:-</span> {poDetails.workspace.email || 'N/A'}
                                        </p>
                                        <p>
                                            <span className="font-medium">GST No:-</span> {poDetails.workspace.gstNumber || 'N/A'}
                                        </p>
                                        <p>
                                            <span className="font-medium">MSME No:-</span> {poDetails.workspace.msmeNumber || 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {/* Column 2: Delivery Address */}
                                <div className="p-1 border-r-1 border-black">
                                    <h3 className="font-semibold text-[10px] mb-1.5">Delivery Address:</h3>
                                    <div className="text-[10px] space-y-0.5">
                                        <p>{poDetails.deliveryAddressLine1}</p>
                                        {poDetails.deliveryAddressLine2 && <p>{poDetails.deliveryAddressLine2}</p>}
                                        <p>{poDetails.deliveryCity}, {poDetails.deliveryState}</p>
                                        <p>{poDetails.deliveryCountry} - {poDetails.deliveryPincode}</p>
                                    </div>
                                </div>

                                {/* Column 3: Purchase From */}
                                <div className="p-1 border-r-1 border-black">
                                    <h3 className="font-semibold text-[10px] mb-1.5">Purchase From:</h3>
                                    <div className="text-[10px] space-y-0.5">
                                        <p className="font-semibold">{poDetails.vendor.companyName || poDetails.vendor.name}</p>
                                        {poDetails.vendor.address && <p>{poDetails.vendor.address}</p>}
                                        {poDetails.vendor.gstNumber && (
                                            <p><span className="font-medium">GSTIN:-</span> {poDetails.vendor.gstNumber}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Column 4: Date & PO Number */}
                                <div className="p-1">
                                    <div className="text-[10px] space-y-1.5">
                                        <p>
                                            <span className="font-semibold">DATE:-</span> {formatDate(new Date(poDetails.createdAt))}
                                        </p>
                                        <p>
                                            <span className="font-semibold">PO NO:-</span> {poDetails.poNumber}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Items Table */}
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-black bg-muted/30">
                                        <th className="p-1 text-left font-semibold w-12 border-r-2 border-black">SR NO</th>
                                        <th className="p-1 text-left font-semibold border-r-2 border-black">DESCRIPTION</th>
                                        <th className="p-1 text-right font-semibold w-20 border-r-2 border-black">Qty</th>
                                        <th className="p-1 text-center font-semibold w-16 border-r-2 border-black">Unit</th>
                                        <th className="p-1 text-right font-semibold w-24 border-r-2 border-black">RATE</th>
                                        <th className="p-1 text-right font-semibold w-32">AMOUNT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {poDetails.items.map((item, index) => (
                                        <tr key={item.id} className="border-b border-black">
                                            <td className="p-1 text-center border-r-2 border-black">{index + 1}</td>
                                            <td className="p-1 border-r-2 border-black">
                                                <div>
                                                    <p className="font-medium">{item.material.name}</p>
                                                    {item.material.specifications && (
                                                        <p className="text-muted-foreground text-[10px] mt-0.5">
                                                            {item.material.specifications}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-1 text-right border-r-2 border-black">{item.orderedQuantity.toLocaleString('en-IN')}</td>
                                            <td className="p-1 text-center border-r-2 border-black">{item.unit.abbreviation}</td>
                                            <td className="p-1 text-right border-r-2 border-black">₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            <td className="p-1 text-right font-medium">₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                    {/* Empty rows for spacing */}
                                    {Array.from({ length: Math.max(0, 5 - poDetails.items.length) }).map((_, i) => (
                                        <tr key={`empty-${i}`} className="border-b border-black">
                                            <td className="p-1 border-r-2 border-black">&nbsp;</td>
                                            <td className="p-1 border-r-2 border-black"></td>
                                            <td className="p-1 border-r-2 border-black"></td>
                                            <td className="p-1 border-r-2 border-black"></td>
                                            <td className="p-1 border-r-2 border-black"></td>
                                            <td className="p-1"></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-b border-black">
                                        <td colSpan={5} className="p-1 text-right font-semibold border-r-2 border-black">SUB TOTAL</td>
                                        <td className="p-1 text-right font-semibold">
                                            ₹{poDetails.subtotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                    {poDetails.items.some(item => item.sgstPercent) && (
                                        <>
                                            <tr className="border-b border-black">
                                                <td colSpan={5} className="p-1 text-right border-r-2 border-black">
                                                    SGST @ {poDetails.items[0]?.sgstPercent || 0}%
                                                </td>
                                                <td className="p-1 text-right">
                                                    ₹{(poDetails.totalTaxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                            <tr className="border-b border-black">
                                                <td colSpan={5} className="p-1 text-right border-r-2 border-black">
                                                    CGST @ {poDetails.items[0]?.cgstPercent || 0}%
                                                </td>
                                                <td className="p-1 text-right">
                                                    ₹{(poDetails.totalTaxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                    <tr className="border-b-2 border-black bg-muted/30">
                                        <td colSpan={5} className="p-1 text-right font-bold border-r-2 border-black">GRAND TOTAL</td>
                                        <td className="p-1 text-right font-bold">
                                            ₹{poDetails.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* Amount in Words */}
                            <div className="border-b-2 border-black p-2 text-xs">
                                <span className="font-semibold">IN WORDS:</span>{' '}
                                <span className="italic">
                                    Rupees {numberToWords(Math.floor(poDetails.totalAmount))}{' '}
                                    {poDetails.totalAmount % 1 !== 0 && `and ${Math.round((poDetails.totalAmount % 1) * 100)} Paise`} Only
                                </span>
                            </div>

                            {/* Terms and Conditions */}
                            <div className="p-4 border-b-2 border-black">
                                <h3 className="font-semibold text-sm mb-2">PAYMENTS TERMS & CONDITIONS</h3>
                                <div className="text-xs space-y-1">
                                    {poDetails.purchaseOrderTerms.length > 0 ? (
                                        <ol className="list-decimal list-inside space-y-1">
                                            {poDetails.purchaseOrderTerms.map((term) => (
                                                <li key={term.id}>
                                                    {term.title && <span className="font-medium">{term.title}: </span>}
                                                    {term.content}
                                                </li>
                                            ))}
                                        </ol>
                                    ) : poDetails.termsAndConditions ? (
                                        <p className="whitespace-pre-wrap">{poDetails.termsAndConditions}</p>
                                    ) : (
                                        <ol className="list-decimal list-inside space-y-1">
                                            <li>Advance Payment: 30% of the total amount due upon signing of the agreement.</li>
                                            <li>Material Delivery: 20% of the total amount due upon delivery of materials.</li>
                                            <li>50% Completion: 20% of the total amount due upon achieving 50% completion of work.</li>
                                            <li>Completion: 25% of the total amount due upon completion of work.</li>
                                            <li>Retention: 5% of the total amount due, retained until final inspection.</li>
                                        </ol>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 text-xs">
                                <p className="font-semibold">Thank You</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-64">
                        <p className="text-muted-foreground">No data available</p>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
