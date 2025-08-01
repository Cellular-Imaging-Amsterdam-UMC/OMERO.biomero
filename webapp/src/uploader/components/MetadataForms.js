import React from 'react';
import { useAppContext } from "../../AppContext";
import { getDjangoConstants } from "../../constants";

const MetadataForms = () => {
  const { state } = useAppContext();
  const { urls } = getDjangoConstants();

  // Early return if nothing selected
  if (!state.omeroFileTreeSelection || state.omeroFileTreeSelection.length === 0) {
    return (
      <div className="text-sm">
        <p>Here you can find the metadata forms for the uploader.</p>
        <p>
          These forms are used to collect metadata from the user before uploading
          files.
        </p>
        <p>
          They are designed to be flexible and extensible, allowing for different
          types of metadata to be collected.
        </p>
      </div>
    );
  }

  // Get the selected item
  const selectedKey = state.omeroFileTreeSelection[0];
  const selectedItem = state.omeroFileTreeData[selectedKey];

  if (!selectedItem) return null;

  // Extract type and ID from the key (format is "type-id")
  const [type, id] = selectedKey.split('-');
  const formType = type.toLowerCase(); // dataset, project, screen, plate

  const formsUrl = `${urls.forms_viewer}?id=${id}&type=${formType}`;

  return (
    <div className="mt-4 h-[calc(100vh-450px)] overflow-auto">
      <iframe 
        src={formsUrl}
        style={{ 
          width: '100%',
          height: '100%',
          border: '1px solid #ddd', 
          borderRadius: '4px',
          display: 'block',  // Removes any inline spacing
          minHeight: 'calc(100vh-450px)'  // Match parent's constraints
        }}
        title="OMERO.forms viewer"
      />
    </div>
  );
};

export default MetadataForms;
