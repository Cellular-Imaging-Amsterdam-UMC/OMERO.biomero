import React, { useState } from "react";
import { H4, Card } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import TrainingForm from "./TrainingForm";
import { useAppContext } from "../../../AppContext";
import { runPredictionTraining } from "../../../apiService";

const TrainingTab = () => {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toaster } = useAppContext();

  const getDatasetId = (selection) => {
      if (!selection || selection.length === 0) return null;
      const str = selection[0]; 
      if (str.startsWith("dataset-")) {
          return str.split("-")[1];
      }
      return null;
  };

  const handleTrain = async (config) => {
      const datasetId = getDatasetId(selectedDatasets);
      if (!datasetId) {
          toaster.show({ message: "Please select a training dataset.", intent: "danger" });
          return;
      }

      setLoading(true);
      try {
          // Prepare parameters for Slurm script
          const params = {
              dataset_id: datasetId,
              epochs: config.epochs,
              batch_size: config.batchSize,
              val_split: config.valSplit,
              patch_size: config.patchSize,
              model_name: config.name
          };

          // Call backend to start workflow
          // Workflow name must exist in backend/Slurm
          await runPredictionTraining(params);
          
          toaster.show({ 
              message: "Training job submitted successfully! Check Status tab.", 
              intent: "success" 
          });
      } catch (error) {
          console.error("Training failed", error);
          toaster.show({ message: "Failed to submit training job.", intent: "danger" });
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto">
      <H4>Train New Model</H4>
      
      <div className="flex gap-4">
        <div className="w-1/3">
             <Card>
                <DatasetSelectWithPopover 
                    label="Select Training Dataset"
                    value={selectedDatasets}
                    onChange={setSelectedDatasets}
                    multiSelect={false}
                    allowedCategories={["datasets"]}
                    buttonText={selectedDatasets.length ? `${selectedDatasets.length} selected` : "Select Dataset"}
                />
             </Card>
        </div>

        <div className="w-2/3">
             <Card>
                 <TrainingForm 
                    onTrain={handleTrain}
                    loading={loading}
                 />
             </Card>
        </div>
      </div>
    </div>
  );
};

export default TrainingTab;
