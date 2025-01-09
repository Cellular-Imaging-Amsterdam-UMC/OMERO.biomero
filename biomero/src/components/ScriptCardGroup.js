import classNames from "classnames";
import React, { useState } from "react";
import { Card, CardList, Collapse, Section, SectionCard } from "@blueprintjs/core";
import ScriptCard from "./ScriptCard"; // Keep using the ScriptCard component
import "@blueprintjs/core/lib/css/blueprint.css";

const ScriptCardGroup = ({ folder }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleFolder = () => {
    setIsExpanded(!isExpanded);
  };

  const collapseProps =  { isOpen: isExpanded, onToggle: toggleFolder, keepChildrenMounted: true};

  return (
    <Section title={folder.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} collapsible={true} collapseProps={collapseProps}>
      <SectionCard padded={false} className={classNames("docs-section-card","docs-section-card-limited-height")}>
        <CardList bordered={false}>
          {folder.ul.map((script) => (
              <ScriptCard key={script.id} script={script} />
            ))}
        </CardList>
      </SectionCard>
    </Section>
  );
};

export default ScriptCardGroup;
