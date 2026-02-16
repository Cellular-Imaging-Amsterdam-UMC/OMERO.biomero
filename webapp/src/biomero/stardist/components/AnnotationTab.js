import React, { useState, useEffect } from "react";
import { H4, Card, Button, Spinner } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import ImageSelector from "./ImageSelector";
import AnnotationViewer from "./AnnotationViewer";
import { useAppContext } from "../../../AppContext"; 
import { fetchMapAnnotations, saveMapAnnotation } from "../../../apiService";

const AnnotationTab = () => {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [featureTypes, setFeatureTypes] = useState([
      { id: "1", name: "Cell", color: "#00ff00" },
      { id: "2", name: "Nucleus", color: "#0000ff" }
  ]);
  const [loadingAnns, setLoadingAnns] = useState(false);
  const [saving, setSaving] = useState(false);
  
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
  
  // Load annotations  // --- Data Loading ---
  
  useEffect(() => {
     if (selectedImage) {
         loadAnnotations(selectedImage.id);
     } else {
         setAnnotations([]);
     }
  }, [selectedImage]);
  
  const loadAnnotations = async (imageId) => {
      setLoadingAnns(true);
      try {
          const data = await fetchMapAnnotations(imageId);
          // data is now { annotations: [], featureTypes: [] }
          if (data) {
              setAnnotations(data.annotations || []);
              if (data.featureTypes) {
                  setFeatureTypes(data.featureTypes);
              }
          }
      } catch (e) {
          console.error("Error loading annotations", e);
          toaster.show({ message: "Failed to load annotations", intent: "danger" });
      } finally {
          setLoadingAnns(false);
      }
  };
  
  // --- Actions ---
  
  const handleSave = async () => {
      if (!selectedImage) return;
      setSaving(true);
      try {
          // Wrapped payload
          const payload = {
              version: "1.0",
              annotations: annotations,
              featureTypes: featureTypes
          };
          
          await saveMapAnnotation(selectedImage.id, payload);
          
          toaster.show({ message: "Annotations saved", intent: "success" });
      } catch (e) {
          console.error("Save failed", e);
          toaster.show({ message: "Failed to save", intent: "danger" });
      } finally {
          setSaving(false);
      }
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto">
      <div className="flex justify-between items-center">
            <H4>Annotate Training Data</H4>
            <div className="flex gap-2">
                <Button 
                    intent="primary" 
                    icon="floppy-disk" 
                    onClick={handleSave} 
                    loading={saving}
                    disabled={!selectedImage || loadingAnns}
                >
                    Save to OMERO
                </Button>
            </div>
      </div>
      
      <div className="flex gap-4 h-full">
        <div className="w-1/4 flex flex-col gap-4">
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

             <Card className="flex-1 min-h-[300px] flex flex-col">
                 <h5 className="bp5-heading mb-2">Select Image</h5>
                 <ImageSelector 
                    datasetId={datasetId}
                    selectedImageId={selectedImage?.id}
                    onSelect={setSelectedImage}
                 />
             </Card>
        </div>

        <div className="w-3/4 flex flex-col h-[calc(100vh-300px)]">
             <Card className="h-full flex flex-col p-0 overflow-hidden">
                 {loadingAnns ? (
                     <div className="flex justify-center items-center h-full">
                         <Spinner />
                     </div>
                 ) : (
                     <AnnotationViewer 
                        image={selectedImage}
                        annotations={annotations}
                        onAnnotationsChange={setAnnotations}
                        featureTypes={featureTypes}
                        onFeatureTypesChange={setFeatureTypes}
                     />
                 )}
             </Card>
        </div>
      </div>
    </div>
  );
};

export default AnnotationTab;
