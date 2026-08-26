type DecimalValue = { toString(): string } | null;

type IndentWithDecimalPercentages = {
  taxPercent: DecimalValue;
  exciseDutyPercent: DecimalValue;
  vatPercent: DecimalValue;
};

export type SerializedIndent<T extends IndentWithDecimalPercentages> = Omit<
  T,
  "taxPercent" | "exciseDutyPercent" | "vatPercent"
> & {
  taxPercent: string | null;
  exciseDutyPercent: string | null;
  vatPercent: string | null;
};

/** Convert Prisma Decimal instances before crossing a Server/Client boundary. */
export function serializeIndentForClient<T extends IndentWithDecimalPercentages>(
  indent: T,
): SerializedIndent<T> {
  return {
    ...indent,
    taxPercent: indent.taxPercent?.toString() ?? null,
    exciseDutyPercent: indent.exciseDutyPercent?.toString() ?? null,
    vatPercent: indent.vatPercent?.toString() ?? null,
  };
}
