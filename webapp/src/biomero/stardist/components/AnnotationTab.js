import React, { useState } from "react";
import { H4, Card } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import ImageSelector from "./ImageSelector";
import AnnotationViewer from "./AnnotationViewer";
import { useAppContext } from "../../../AppContext"; // Correct context path

const AnnotationTab = () => {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Need toaster for notifications
  const { toaster } = useAppContext();

  const getDatasetId = (selection) => {
      if (!selection || selection.length === 0) return null;
      const str = selection[0]; 
      if (str.startsWith("dataset-")) {
          return str.split("-")[1];
      }
      return null;
  };

  const datasetId = getDatasetId(selectedDatasets);

  const handleDatasetChange = (newSelection) => {
      setSelectedDatasets(newSelection);
      setSelectedImage(null);
  };

  const handleSaveAnnotations = async (imageId, polygons) => {
      // Mock save for now
      console.log("Saving annotations for image", imageId, polygons);
      await new Promise(resolve => setTimeout(resolve, 500));
      toaster.show({
          message: `Saved ${polygons.length} annotations!`,
          intent: "success"
      });
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto">
      <H4>Annotate Training Data</H4>
      
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
                 <h5 className="bp5-heading mb-4">Annotate</h5>
                 <AnnotationViewer 
                    image={selectedImage}
                    onSaveAnnotations={handleSaveAnnotations}
                 />
             </Card>
        </div>
      </div>
    </div>
  );
};

export default AnnotationTab;
