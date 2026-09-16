export function PlaceholderRows({
  columns,
  count,
  rhythm,
  startIndex = 0,
}: {
  columns: number;
  count: number;
  rhythm: "match" | "queue";
  startIndex?: number;
}) {
  if (count <= 0) return null;
  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const alt = (startIndex + index) % 2 === 1 && rhythm === "match" ? "entry-alt" : "";
        return (
          <tr aria-hidden className={`placeholder-row ${rhythm === "queue" ? "row-rhythm-2" : "row-rhythm-1"} ${alt}`} key={`placeholder-${index}`}>
            <td colSpan={columns} />
          </tr>
        );
      })}
    </>
  );
}
