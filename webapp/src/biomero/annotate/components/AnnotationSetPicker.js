import React from "react";
import { HTMLSelect, FormGroup } from "@blueprintjs/core";

/**
 * Dropdown for selecting an existing annotation set or creating a new one.
 *
 * Props:
 *   tables: array of { id, name, ... } from listTrackingTables()
 *   selectedTableId: currently selected table ID (or null)
 *   onSelectTable: (table) => void — called with the full table object, or null for "new"
 *   onCreateNew: () => void — called when user picks "+ New annotation set"
 *   loading: bool
 *   disabled: bool
 */
const AnnotationSetPicker = ({
  tables = [],
  selectedTableId,
  onSelectTable,
  onCreateNew,
  loading = false,
  disabled = false,
}) => {
  const handleChange = (e) => {
    const value = e.target.value;
    if (value === "__new__") {
      onCreateNew();
    } else if (value === "") {
      onSelectTable(null);
    } else {
      const table = tables.find((t) => String(t.id) === value);
      if (table) onSelectTable(table);
    }
  };

  return (
    <FormGroup
      label="Annotation Set"
      helperText={
        tables.length === 0 && !loading
          ? "No annotation sets yet. Create one below."
          : undefined
      }
    >
      <HTMLSelect
        value={selectedTableId ? String(selectedTableId) : ""}
        onChange={handleChange}
        disabled={disabled || loading}
        fill
      >
        <option value="">— Select annotation set —</option>
        {tables.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.name || `Set #${t.id}`}
          </option>
        ))}
        <option value="__new__">+ New annotation set</option>
      </HTMLSelect>
    </FormGroup>
  );
};

export default AnnotationSetPicker;
