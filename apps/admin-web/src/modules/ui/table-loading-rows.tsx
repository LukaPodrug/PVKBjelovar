interface TableLoadingRowsProps {
  columns: number;
  rows?: number;
}

export function TableLoadingRows({ columns, rows = 6 }: TableLoadingRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b-2 border-line bg-white">
          <td className="px-4 py-4" colSpan={columns}>
            <div className="grid animate-pulse gap-3 sm:grid-cols-4">
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <div
                  key={columnIndex}
                  className="h-8 rounded-[14px] bg-panel"
                />
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
