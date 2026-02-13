import React, { useState } from "react";
import { H4, Card, Divider } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import ImageSelector from "./ImageSelector";
import ModelSelector from "./ModelSelector";
import PreviewViewer from "./PreviewViewer";

const PreviewTab = () => {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedModel, setSelectedModel] = useState("2D_versatile_fluo");

  // Helper to extract ID from string like "dataset-123"
  const getDatasetId = (selection) => {
      if (!selection || selection.length === 0) return null;
      const str = selection[0]; // Assume single selection for now
      if (str.startsWith("dataset-")) {
          return str.split("-")[1];
      }
      return null;
  };

  const datasetId = getDatasetId(selectedDatasets);

  const handleDatasetChange = (newSelection) => {
      setSelectedDatasets(newSelection);
      setSelectedImage(null); // Reset image when dataset changes
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto">
      <H4>Preview Stardist Models</H4>
      
      <div className="flex gap-4">
        <div className="w-1/3 flex flex-col gap-4">
             <Card>
                <DatasetSelectWithPopover 
                    label="Select Dataset"
                    value={selectedDatasets}
                    onChange={handleDatasetChange}
                    multiSelect={false}
                    allowedCategories={["datasets"]}
                    buttonText={selectedDatasets.length ? `${selectedDatasets.length} selected` : "Select Dataset"}
                />
             </Card>
             
             <Card>
                 <ModelSelector 
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                 />
             </Card>

             <Card className="flex-1 min-h-[200px] flex flex-col">
                 <h5 className="bp5-heading mb-2">Select Image</h5>
                 <ImageSelector 
                    datasetId={datasetId}
                    selectedImageId={selectedImage?.id}
                    onSelect={setSelectedImage}
                 />
             </Card>
        </div>

        <div className="w-2/3">
             <Card className="h-full">
                 <h5 className="bp5-heading mb-4">Preview</h5>
                 <PreviewViewer 
                    image={selectedImage}
                    model={selectedModel}
                 />
             </Card>
        </div>
      </div>
    </div>
  );
};

export default PreviewTab;
