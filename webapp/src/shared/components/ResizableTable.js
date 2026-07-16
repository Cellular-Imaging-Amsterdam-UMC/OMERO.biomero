import React, { useEffect, useMemo, useRef, useState } from "react";
import { HTMLTable } from "@blueprintjs/core";

const MAX_COLUMN_WIDTH = 800;
const RESIZE_STEP = 16;
const STORAGE_PREFIX = "omero-biomero:column-widths:";

const clampWidth = (width, minWidth) =>
  Math.max(minWidth, Math.min(MAX_COLUMN_WIDTH, width));

const getDefaultWidths = (columns) =>
  Object.fromEntries(columns.map(({ key, width }) => [key, width]));

const getInitialWidths = (columns, storageKey) => {
  const defaults = getDefaultWidths(columns);
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
    );
    return Object.fromEntries(
      columns.map(({ key, minWidth, width }) => {
        const savedValue = saved && saved[key];
        const savedWidth = Number(savedValue);
        return [
          key,
          savedValue !== null &&
          savedValue !== undefined &&
          Number.isFinite(savedWidth)
            ? clampWidth(savedWidth, minWidth)
            : width,
        ];
      })
    );
  } catch (_) {
    return defaults;
  }
};

const ResizableTable = ({ columns, storageKey, children, className = "" }) => {
  const [widths, setWidths] = useState(() =>
    getInitialWidths(columns, storageKey)
  );
  const dragState = useRef(null);
  const minimumWidths = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.key, column.minWidth])),
    [columns]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${storageKey}`,
        JSON.stringify(widths)
      );
    } catch (_) {
      // Storage can be disabled without affecting table behavior.
    }
  }, [storageKey, widths]);

  useEffect(() => {
    const resize = (event) => {
      const active = dragState.current;
      if (!active) return;
      const nextWidth = clampWidth(
        active.startWidth + event.clientX - active.startX,
        minimumWidths[active.key]
      );
      setWidths((current) => ({ ...current, [active.key]: nextWidth }));
    };
    const stopResizing = () => {
      dragState.current = null;
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [minimumWidths]);

  const startResizing = (event, key) => {
    event.preventDefault();
    dragState.current = {
      key,
      startX: event.clientX,
      startWidth: widths[key],
    };
  };

  const resizeWithKeyboard = (event, column) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const change = event.key === "ArrowRight" ? RESIZE_STEP : -RESIZE_STEP;
    setWidths((current) => ({
      ...current,
      [column.key]: clampWidth(
        current[column.key] + change,
        column.minWidth
      ),
    }));
  };

  const resetColumn = (column) => {
    setWidths((current) => ({ ...current, [column.key]: column.width }));
  };

  const tableWidth = columns.reduce(
    (total, column) => total + widths[column.key],
    0
  );

  return (
    <HTMLTable
      bordered
      className={`w-full table-fixed align-middle ${className}`}
      style={{ minWidth: `${tableWidth}px`, width: "100%" }}
    >
      <colgroup>
        {columns.map((column) => (
          <col
            key={column.key}
            data-testid={`column-${column.key}`}
            style={{ width: `${widths[column.key]}px` }}
          />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className="group relative">
              <span className="block truncate pr-2" title={column.label}>
                {column.label}
              </span>
              <span
                role="separator"
                aria-label={`Resize ${column.label} column`}
                aria-orientation="vertical"
                aria-valuemin={column.minWidth}
                aria-valuemax={MAX_COLUMN_WIDTH}
                aria-valuenow={widths[column.key]}
                tabIndex={0}
                title="Drag to resize; double-click to reset"
                className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize touch-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                onDoubleClick={() => resetColumn(column)}
                onKeyDown={(event) => resizeWithKeyboard(event, column)}
                onPointerDown={(event) => startResizing(event, column.key)}
              >
                <span className="absolute right-0 top-0 h-full w-px bg-gray-300 opacity-0 group-hover:opacity-100 dark:bg-gray-600" />
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </HTMLTable>
  );
};

export default ResizableTable;
