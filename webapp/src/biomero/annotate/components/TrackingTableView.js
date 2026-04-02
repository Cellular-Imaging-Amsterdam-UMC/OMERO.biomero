import React from "react";
import { HTMLTable, Tag, Button, Icon } from "@blueprintjs/core";

const TrackingTableView = ({
  units,
  selectedIndex,
  onSelectUnit,
  filterStatus,
  onFilterChange,
}) => {
  // Build filtered list with original indices preserved
  const filteredUnits = units
    .map((unit, idx) => ({ ...unit, _originalIndex: idx }))
    .filter((unit) => {
      if (filterStatus === "pending") return !unit.processed;
      if (filterStatus === "completed") return unit.processed;
      return true;
    });

  // Group filtered units by image_id for hierarchical display
  const groupedUnits = (() => {
    const groups = [];
    const groupMap = new Map();

    filteredUnits.forEach((unit) => {
      const key = unit.image_id;
      if (!groupMap.has(key)) {
        const group = {
          image_id: key,
          image_name: unit.image_name,
          units: [],
        };
        groupMap.set(key, group);
        groups.push(group);
      }
      groupMap.get(key).units.push(unit);
    });

    return groups;
  })();

  const totalUnits = units.length;
  const completedUnits = units.filter((u) => u.processed).length;

  return (
    <div className="flex flex-col h-full">
      {/* Progress header */}
      <div className="p-2 border-b bg-gray-50">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">
            {completedUnits}/{totalUnits} completed
          </span>
          <div className="flex gap-1">
            <Button
              small
              minimal
              active={filterStatus === "all"}
              onClick={() => onFilterChange("all")}
              text="All"
            />
            <Button
              small
              minimal
              active={filterStatus === "pending"}
              onClick={() => onFilterChange("pending")}
              text="Pending"
            />
            <Button
              small
              minimal
              active={filterStatus === "completed"}
              onClick={() => onFilterChange("completed")}
              text="Done"
            />
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{
              width: `${totalUnits > 0 ? (completedUnits / totalUnits) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Units list */}
      <div className="flex-1 overflow-y-auto">
        <HTMLTable compact interactive condensed className="w-full">
          <thead>
            <tr>
              <th className="text-xs">Image</th>
              <th className="text-xs">Cat</th>
              <th className="text-xs">C/Z/T</th>
              <th className="text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {groupedUnits.map((group) => (
              <React.Fragment key={`group-${group.image_id}`}>
                {/* Image header row */}
                <tr
                  className="cursor-pointer"
                  style={{ background: "transparent" }}
                  onClick={() => {
                    const firstUnit = group.units[0];
                    if (firstUnit) onSelectUnit(firstUnit._originalIndex);
                  }}
                >
                  <td
                    colSpan={4}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      paddingTop: 8,
                      paddingBottom: 4,
                    }}
                    title={group.image_name}
                  >
                    {group.image_name}
                  </td>
                </tr>
                {/* Unit rows */}
                {group.units.map((unit) => {
                  const actualIndex = unit._originalIndex;
                  const isSelected = actualIndex === selectedIndex;
                  return (
                    <tr
                      key={actualIndex}
                      className={`cursor-pointer ${
                        isSelected ? "bg-blue-100" : ""
                      } ${unit.processed ? "opacity-60" : ""}`}
                      onClick={() => onSelectUnit(actualIndex)}
                    >
                      <td
                        className="text-xs truncate max-w-[120px]"
                        style={{ paddingLeft: unit.is_patch ? 24 : 8 }}
                        title={unit.image_name}
                      >
                        {unit.is_patch ? (
                          <span style={{ color: "#666", fontSize: 10 }}>
                            Patch ({unit.patch_x},{unit.patch_y})
                          </span>
                        ) : (
                          <span style={{ fontSize: 11 }}>Full image</span>
                        )}
                      </td>
                      <td>
                        <Tag
                          minimal
                          small
                          intent={
                            unit.category === "training"
                              ? "primary"
                              : unit.category === "validation"
                                ? "warning"
                                : "none"
                          }
                        >
                          {(unit.category || "train").slice(0, 3)}
                        </Tag>
                      </td>
                      <td className="text-xs">
                        {unit.channel}/{unit.z_slice}/{unit.timepoint}
                      </td>
                      <td>
                        {unit.processed ? (
                          <Icon icon="tick-circle" intent="success" size={14} />
                        ) : (
                          <Icon icon="circle" className="text-gray-300" size={14} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </HTMLTable>
        {filteredUnits.length === 0 && (
          <div className="text-center text-gray-400 text-sm p-4">
            {filterStatus === "pending"
              ? "All units are completed!"
              : filterStatus === "completed"
                ? "No completed units yet."
                : "No processing units."}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackingTableView;
