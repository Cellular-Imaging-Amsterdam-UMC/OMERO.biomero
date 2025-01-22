import React, { useState, useEffect } from "react";
import {
  Card,
  FormGroup,
  InputGroup,
  Button,
  Switch,
  Tooltip,
  Collapse,
  Icon,
} from "@blueprintjs/core";
import { useAppContext } from "../AppContext";
import ModelsSection from "./ModelsSection";

const SettingsForm = () => {
  const { state, updateState } = useAppContext();
  const [settingsForm, setSettingsForm] = useState(null); // Form state
  const [initialFormData, setInitialFormData] = useState(null); // Stable reference to initial data
  const [editMode, setEditMode] = useState({});

  // Fetch the full initial form state (mocked API call for now)
  const fetchInitialFormState = async () => {
    const fetchedFormState = {
      sshHost: "localslurm",
      slurmDataPath: "/data/my-scratch/data",
      slurmImagesPath: "/data/my-scratch/singularity_images/workflows",
      slurmScriptPath: "/data/my-scratch/slurm-scripts",
      slurmScriptRepo: "",
      trackWorkflows: true,
      sqlalchemyUrl: "",
      enableJobAccounting: true,
      enableJobProgress: true,
      enableWorkflowAnalytics: true,
      models: [
        { name: "cellpose", repo: "https://github.com/TorecLuik/W_NucleiSegmentation-Cellpose/tree/v1.3.1", job: "jobs/cellpose.sh", extraParams: { cellpose_job_mem: "15GB" } },
        { name: "deeplabcut", repo: "https://github.com/DeepLabCut/DeepLabCut/tree/v2.9.10", job: "jobs/deeplabcut.sh" },
      ],
    };
    setInitialFormData(fetchedFormState); // Set stable reference
    setSettingsForm(fetchedFormState); // Set form state
  };

  useEffect(() => {
    fetchInitialFormState(); // Initial data fetching
  }, []);

  const toggleEdit = (field) => {
    setEditMode((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleModelChange = (index, field, value) => {
    const updatedModels = structuredClone(settingsForm.models)
    updatedModels[index][field] = value;
    setSettingsForm((prev) => ({ ...prev, 
        models: updatedModels
    }));
  };

  const addModel = () => {
    setSettingsForm((prev) => ({
      ...prev,
      models: [...prev.models, { name: "", repo: "", job: "" }],
    }));
  };

  const handleDeleteModel = (index) => {
    setSettingsForm((prev) => {
      const updatedModels = prev.models.filter((_, i) => i !== index);
      return { ...prev, models: updatedModels };
    });
  };

  // Reset a specific model card
  const resetModel = (index) => {
    if (!initialFormData) return;
  
    setSettingsForm((prev) => {
      const updatedModels = [...prev.models];
      // Check if the model exists in initialFormData, if not, reset it to default
      if (initialFormData.models[index]) {
        updatedModels[index] = initialFormData.models[index]; // Restore model from initial data
      } else {
        updatedModels[index] = { name: "", repo: "", job: "" }; // Reset to default if it's a new model
      }
  
      return { ...prev, models: updatedModels };
    });
  };


  // Refetch initial form state to reset the entire form
  const resetForm = () => {
    fetchInitialFormState(); // Re-fetch the initial data when resetting the form
  };

  const handleInputChange = (field, value) => {
    const updatedSettings = { ...settingsForm, [field]: value };
    setSettingsForm(updatedSettings);
    updateState({ settingsForm: updatedSettings }); // Update the global state
  };  
  

  const renderEditableField = (label, field, value, placeholder, explanation) => (
    <FormGroup label={label} helperText={explanation}>
      <div className="flex items-center space-x-2">
        <InputGroup
          value={value}
          onChange={(e) => handleInputChange(field, e.target.value)}
          readOnly={!editMode[field]}
          placeholder={placeholder}
          className="flex-1"
          rightElement={<Button
            icon={editMode[field] ? "tick" : "edit"}
            minimal
            onClick={() => toggleEdit(field)}
          />}
        />        
      </div>
    </FormGroup>
  );

  if (!settingsForm) return <div>Loading...</div>; // Handle loading state

  return (
    <Card>
      <h3>Settings</h3>

      {renderEditableField(
        "SSH Host",
        "sshHost",
        settingsForm.sshHost,
        "Enter SSH Host",
        "The SSH host for connecting to Slurm."
      )}

      {renderEditableField(
        "Slurm Data Path",
        "slurmDataPath",
        settingsForm.slurmDataPath,
        "/data/my-scratch/data",
        "Path to the Slurm data directory."
      )}

      {renderEditableField(
        "Slurm Images Path",
        "slurmImagesPath",
        settingsForm.slurmImagesPath,
        "/data/my-scratch/singularity_images/workflows",
        "Path to the Slurm images directory."
      )}

      {renderEditableField(
        "Slurm Script Path",
        "slurmScriptPath",
        settingsForm.slurmScriptPath,
        "/data/my-scratch/slurm-scripts",
        "Path to the Slurm scripts directory."
      )}

      {renderEditableField(
        "Slurm Script Repository",
        "slurmScriptRepo",
        settingsForm.slurmScriptRepo,
        "Enter repository URL",
        "The Git repository for Slurm scripts."
      )}

      <Switch
        checked={settingsForm.trackWorkflows}
        label="Track Workflows"
        onChange={(e) => handleInputChange("trackWorkflows", e.target.checked)}
      />

      {renderEditableField(
        "SQLAlchemy URL",
        "sqlalchemyUrl",
        settingsForm.sqlalchemyUrl,
        "postgresql+psycopg2://user:password@localhost:5432/db",
        "Database connection string for SQLAlchemy."
      )}

      <Switch
        checked={settingsForm.enableJobAccounting}
        label="Enable Job Accounting"
        onChange={(e) => handleInputChange("enableJobAccounting", e.target.checked)}
      />

      <Switch
        checked={settingsForm.enableJobProgress}
        label="Enable Job Progress"
        onChange={(e) => handleInputChange("enableJobProgress", e.target.checked)}
      />

      <Switch
        checked={settingsForm.enableWorkflowAnalytics}
        label="Enable Workflow Analytics"
        onChange={(e) => handleInputChange("enableWorkflowAnalytics", e.target.checked)}
      />

      <ModelsSection
        models={settingsForm.models}
        onModelChange={(index, field, value) => handleModelChange(index, field, value)}
        onAddModel={addModel}
        onAddParam={(index, key, value) => {
            const updatedModels = structuredClone(settingsForm.models);
          
            if (!key) {
              console.error("Key is required to add or delete parameters.");
              return;
            }
          
            if (!updatedModels[index].extraParams) {
              updatedModels[index].extraParams = {};
            }
          
            if (value === null || value === "") {
              // Handle deletion: remove the key if the value is null or empty
              delete updatedModels[index].extraParams[key];
            } else {
              // Format the key and add/update the parameter
              const modelName = updatedModels[index].name?.toLowerCase().replace(/\s+/g, "_") || `model_${index + 1}`;
              const formattedKey = key.startsWith(`${modelName}_job_`) ? key : `${modelName}_job_${key}`;
          
              updatedModels[index].extraParams[formattedKey] = value;
            }
          
            // Update the state with modified models
            setSettingsForm((prev) => ({ ...prev, models: updatedModels }));
          }}
          
                 
        onDeleteModel={handleDeleteModel}
        onResetModel={resetModel}
      />


      <Button
        intent="primary"
        onClick={() => console.log("Saved settings:", settingsForm)}
      >
        Save Settings
      </Button>

      <Button
        icon="reset"
        intent="danger"
        onClick={resetForm}
        >
        Reset All
      </Button>
    </Card>
  );
};

export default SettingsForm;
