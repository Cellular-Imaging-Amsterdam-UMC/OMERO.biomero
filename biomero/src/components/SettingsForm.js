import React, { useState, useEffect } from "react";
import {
  Card,
  FormGroup,
  InputGroup,
  Button,
  Switch,
  H3,
  H4,
  H5,
  H6,
  Collapse
} from "@blueprintjs/core";
import { useAppContext } from "../AppContext";
import ModelsSection from "./ModelsSection";
import CollapsibleSection from "./CollapsibleSection";
import { FaDocker } from "react-icons/fa6";

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
      converters: []
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

  const handleConverterChange = (index, field, value) => {
    const updatedConverters = structuredClone(settingsForm.converters);
    updatedConverters[index][field] = value;
    setSettingsForm((prev) => ({ ...prev, 
        converters: updatedConverters
    }));
  };

  const handleAddConverter = () => {
    setSettingsForm((prev) => ({
        ...prev,
        converters: [...prev.converters, { key: "", value: "" }],
      }));
  };

  const handleRemoveConverter = (index) => {
    setSettingsForm((prev) => {
        const updatedConverters = prev.converters.filter((_, i) => i !== index);
        return { ...prev, converters: updatedConverters };
      });
  };

  const openDockerHub = (image) => {
    const [repo, version] = image.split(":");
    const url = `https://hub.docker.com/r/${repo}/tags?page=1&name=${version}`;
    window.open(url, "_blank", "noopener,noreferrer")
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
      <H3>Settings</H3>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
                View or edit your settings for BIOMERO here!
            </div>

            <div className="bp5-form-helper-text">
                Note that some settings will apply immediately 
                (like a model's <i>Additional Slurm Parameters</i>), 
                but others might require setup.
                I would recommend running Slurm Init after changing these settings.
            </div>
        </div>
      </div>

      
    <CollapsibleSection title="SSH Settings">
        <div className="bp5-form-group">
            <div className="bp5-form-content">
                <div className="bp5-form-helper-text">
                    Settings for BIOMERO's SSH connection to Slurm.
                </div>
                <div className="bp5-form-helper-text">
                    Set the rest of your SSH configuration in your SSH config under this host name/alias.
                    Or in e.g. /etc/fabric.yml 
                    (see <a href="https://docs.fabfile.org/en/latest/concepts/configuration.html" target="_blank" rel="noopener noreferrer">Fabric's documentation</a> for details on config loading).
                </div>
            </div>
        </div>
        {renderEditableField(
            "SSH Host",
            "sshHost",
            settingsForm.sshHost,
            "Enter SSH Host",
            "The alias for the SSH connection for connecting to Slurm."
        )}
      </CollapsibleSection>
      <CollapsibleSection title="Slurm Settings">
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
              General settings for where to find things on the Slurm cluster.
            </div>
        </div>
      </div>
      <H6>Paths</H6>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
                You should prefer to use full paths, 
                but you could use relative paths compared to the Slurm user's home dir 
                if you omit the starting '/'.
            </div>
        </div>
      </div>
      {renderEditableField(
        "Slurm Data Path",
        "slurmDataPath",
        settingsForm.slurmDataPath,
        "/data/my-scratch/data",
        "The path on SLURM entrypoint for storing datafiles"
      )}

      {renderEditableField(
        "Slurm Images Path",
        "slurmImagesPath",
        settingsForm.slurmImagesPath,
        "/data/my-scratch/singularity_images/workflows",
        "The path on SLURM entrypoint for storing container image files"
      )}

      {renderEditableField(
        "Slurm Script Path",
        "slurmScriptPath",
        settingsForm.slurmScriptPath,
        "/data/my-scratch/slurm-scripts",
        "The path on SLURM entrypoint for storing the slurm job scripts"
      )}
      <H6>Repositories</H6>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            Note: If you provide no repository (the default), BIOMERO will generate scripts instead!
            These are based on the <a href="https://github.com/NL-BioImaging/biomero/blob/main/resources/job_template.sh" target="_blank" rel="noopener noreferrer">job_template</a> and the descriptor.json of the workflow.
            This is the recommended way of working as it will be updated with future versions of BIOMERO and of your workflow.
            </div>
            <div className="bp5-form-helper-text">
            Note that you can provide most sbatch parameters per model/workflow (settings below) and don't need new scripts for that.
            </div>
            <div className="bp5-form-helper-text">
            However, perhaps you need specific code in your Slurm scripts.
            In that case, you have to provide a repository here 
            and include in it a jobscript for <i>every</i> workflow.
            The internal path (in this repository) has to be configured per model, e.g. <code className="bp5-code">cellpose_job=jobs/cellpose.sh</code>
            </div>
        </div>
      </div>
      {renderEditableField(
        "Slurm Script Repository",
        "slurmScriptRepo",
        settingsForm.slurmScriptRepo,
        "Enter repository URL",
        "The Git repository to pull the Slurm scripts from. Leave empty (default) for generated scripts."
      )}
      </CollapsibleSection>
      <CollapsibleSection title="Analytics Settings">
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
              General settings to control workflow tracking and listeners for detailed monitoring and insights.
            </div>
        </div>
      </div>
      <H6>Workflow Tracker Settings</H6>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            The workflow tracker collects and logs information 
            on workflow execution, job statuses, and related analytics.
            This is the main switch to enable or disable workflow tracking as a whole.
            </div>
            <div className="bp5-form-helper-text">
            Note that this tracking data is a requirement for adding metadata in OMERO and viewing the dashboard in the Status tab (above).
            </div>
            <div className="bp5-form-helper-text">
            If disabled, none of the listeners below will be activated, regardless of their individual settings.
            </div>
        </div>
      </div>
      <Switch
        checked={settingsForm.trackWorkflows}
        label="Track Workflows"
        onChange={(e) => handleInputChange("trackWorkflows", e.target.checked)}
      />
      <H6>Database configuration</H6>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            SQLAlchemy database connection URL for persisting workflow analytics data. This setting allows configuring 
            the database connection for storing the tracking and analytics 
            data. If no value is set here, environment variables will be used as the default.
            </div>
            <div className="bp5-form-helper-text">
            See <a href="https://docs.sqlalchemy.org/en/20/core/engines.html#database-urls" target="_blank" rel="noopener noreferrer">SQLAlchemy docs</a> for more info and examples of database URLs supported by sqlalchemy
            </div>
            <div className="bp5-form-helper-text">
            Note: If SQLALCHEMY_URL is set as an environment variable, it will override this setting.
            </div>
            <div className="bp5-form-helper-text">
            Note2: This has to be a postgresql database.
            </div>
        </div>
      </div>
      {renderEditableField(
        "SQLAlchemy URL",
        "sqlalchemyUrl",
        settingsForm.sqlalchemyUrl,
        "postgresql+psycopg2://user:password@localhost:5432/db",
        "Database connection string for SQLAlchemy."
      )}
      <H6>Listener Settings</H6>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            Listeners provide detailed monitoring and insights for
            specific aspects of workflow execution. Each listener 
            can be enabled or disabled independently.
            </div>
            <div className="bp5-form-helper-text">
            Note that listeners can be retroactively updated with (historic) workflow tracking data.
            So you can turn on a listener later, and it will read all the previous workflow events.
            This does not work the other way around: if you do not track workflow data, you can never listen to it.
            </div>
        </div>
      </div>
      <b>Job Accounting Listener</b>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            Monitors job accounting data such as resource usage (CPU, memory) and SLURM job states (completed, failed).
            </div>
            <div className="bp5-form-helper-text">
            Useful if you need to know Slurm resource usage per OMERO user. E.g. for cost forwarding.
            </div>
        </div>
      </div>
      <Switch
        checked={settingsForm.enableJobAccounting}
        label="Enable Job Accounting"
        onChange={(e) => handleInputChange("enableJobAccounting", e.target.checked)}
      />
      <b>Job Progress Listener</b>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            Tracks the progress of SLURM jobs, capturing intermediate statuses for real-time insights into job execution.
            </div>
            <div className="bp5-form-helper-text">
            Required for the `Status` dashboard progress graph.
            </div>
        </div>
      </div>
      <Switch
        checked={settingsForm.enableJobProgress}
        label="Enable Job Progress"
        onChange={(e) => handleInputChange("enableJobProgress", e.target.checked)}
      />
      <b>Workflow Analytics Listener</b>
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            Provides detailed insights into workflow performance, including execution times, bottlenecks, and overall efficiency.
            </div>
            <div className="bp5-form-helper-text">
            Required for the `Status` dashboard analytics graphs.
            </div>
        </div>
      </div>
      <Switch
        checked={settingsForm.enableWorkflowAnalytics}
        label="Enable Workflow Analytics"
        onChange={(e) => handleInputChange("enableWorkflowAnalytics", e.target.checked)}
      />
      </CollapsibleSection>
      <CollapsibleSection title="Converters Settings">
      <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
            Settings for linking to external data format converters for running on Slurm.
            </div>
            <div className="bp5-form-helper-text">
            By default, BIOMERO exports images as ZARR to the HPC.
            But, the workflow you want to execute might require 
            a different filetype. E.g. most of our example workflows
            require TIFF input files. This is the default for BIAFLOWS.
            </div>
            <div className="bp5-form-helper-text">
            If you provide nothing, BIOMERO will build a converter on Slurm for you.
            Instead, you can add converters here to pull
            those instead. These should be available on DockerHub as a container image.
            If you don't have singularity build rights on Slurm, you can also use this field instead to pull.
            </div>
            <div className="bp5-form-helper-text">
            Please pin it to a specific version to reduce unforeseen errors.
            Key should be the types "X_to_Y" and value should be the docker image, for example <code>zarr_to_tiff=cellularimagingcf/convert_zarr_to_tiff:1.14.0</code>
            </div>
        </div>
      </div>
      {settingsForm.converters?.map((converter, index) => (
        <div key={index} className="bp5-form-group">
          <FormGroup
            label={`Converter ${index + 1}`}
            labelFor={`converter-key-${index}`}
            labelInfo="(required)"
          >
            <div className="bp5-input-group-wrapper">
              <InputGroup
                id={`converter-key-${index}`}
                placeholder="Enter key (e.g. zarr_to_tiff)"
                value={converter.key}
                onChange={(e) => handleConverterChange(index, "key", e.target.value)}
              />
              <InputGroup
                id={`converter-value-${index}`}
                placeholder="Enter Docker image (e.g. cellularimagingcf/convert_zarr_to_tiff:1.14.0)"
                value={converter.value}
                onChange={(e) => handleConverterChange(index, "value", e.target.value)}
                rightElement={
                    converter.value ? (
                    <Button
                        icon={<FaDocker />}
                        intent="primary"
                        onClick={() => openDockerHub(converter.value)}
                        title="View Container Image"
                    />): null
                }
              />
            </div>
            <Button
                icon="delete"
                minimal
                intent="danger"
                onClick={() => handleRemoveConverter(index)}
                className="bp5-button-remove"
            />
          </FormGroup>
        </div>
      ))}
      <Button
        icon="add"
        text="Add Converter"
        onClick={handleAddConverter}
        intent="none"
      />
      </CollapsibleSection>
      <CollapsibleSection title="Models Settings">
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
     </CollapsibleSection>

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
