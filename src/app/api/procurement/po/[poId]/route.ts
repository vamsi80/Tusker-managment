import { NextRequest, NextResponse } from 'next/server';
import { getPODetails } from '@/data/procurement/get-po-details';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ poId: string }> }
) {
    try {
        const { poId } = await params;

        const poDetails = await getPODetails(poId);

        return NextResponse.json(poDetails);
    } catch (error) {
        console.error('Error fetching PO details:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch PO details' },
            { status: 500 }
        );
    }
}
