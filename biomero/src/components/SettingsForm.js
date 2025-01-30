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
  Collapse,
  ButtonGroup,
  Tooltip,
  Spinner
} from "@blueprintjs/core";
import { useAppContext } from "../AppContext";
import ModelsSection from "./ModelsSection";
import CollapsibleSection from "./CollapsibleSection";
import { FaDocker } from "react-icons/fa6";

const SettingsForm = () => {
  const { state, updateState, loadBiomeroConfig, saveConfigData } = useAppContext();
  const [settingsForm, setSettingsForm] = useState(null); // Form state
  const [initialFormData, setInitialFormData] = useState(null); // Stable reference to initial data
  const [editMode, setEditMode] = useState({});

  const [hasChanges, setHasChanges] = useState(false);
  const [showSaveTooltip, setShowSaveTooltip] = useState(true);
  const [showResetTooltip, setShowResetTooltip] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (JSON.stringify(settingsForm) !== JSON.stringify(initialFormData)) {
      setHasChanges(true);
    } else {
      setHasChanges(false);
    }
  }, [settingsForm, initialFormData]);


  const fetchInitialFormState = async () => {
     if (state.config) {
      const mappedModels = Object.entries(state.config.MODELS || {})
        .filter(([key]) => key.endsWith('_repo')) // Filter for relevant keys
        .map(([key, value]) => {
          const prefix = key.replace('_repo', ''); // Extract the prefix
          return {
            name: state.config.MODELS[prefix], // e.g., "cellpose"
            repo: value, // e.g., the repo URL
            job: state.config.MODELS[`${prefix}_job`], // e.g., "jobs/cellpose.sh"
            extraParams: extractExtraParams(prefix) // Handle the extraParams here
          };
        });
  
      const mappedConverters = Object.entries(state.config.CONVERTERS || {}).map(
        ([key, value]) => ({ key, value })
      );
      // store a version to 'reset' to
      setInitialFormData({
        ...state.config,
        MODELS: mappedModels,
        CONVERTERS: mappedConverters,
      });
      // the living version to be changed by the UI
      setSettingsForm({
        ...state.config,
        MODELS: mappedModels,
        CONVERTERS: mappedConverters,
      });
    }
  };

  // Extract extraParams for each model
  const extractExtraParams = (prefix) => {
    const extraParams = {};
    // Find any extra parameters for this model
    Object.entries(state.config.MODELS).forEach(([key, value]) => {
      if (key.startsWith(`${prefix}_job_`)) {
        const paramKey = key;
        extraParams[paramKey] = value;
      }
    });
    return extraParams;
  };

  useEffect(() => {
    loadBiomeroConfig();     
  }, []); // Empty dependency array ensures it's called only once

  useEffect(() => {
    fetchInitialFormState();
  }, [state.config]); // setup our form
  

  const toggleEdit = (field) => {
    setEditMode((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleModelChange = (index, field, value) => {
    const updatedModels = structuredClone(settingsForm.MODELS)
    updatedModels[index][field] = value;

    if (field === "name" && settingsForm.SLURM.slurm_script_repo === "") {
      updatedModels[index]["job"] = `jobs/${value}.sh`;
    }

    setSettingsForm((prev) => ({ ...prev, 
      MODELS: updatedModels
    }));
  };

  const handleConverterChange = (index, field, value) => {
    const updatedConverters = structuredClone(settingsForm.CONVERTERS);
    updatedConverters[index][field] = value;
    setSettingsForm((prev) => ({ ...prev, 
      CONVERTERS: updatedConverters
    }));
  };

  const handleAddConverter = () => {
    setSettingsForm((prev) => ({
        ...prev,
        CONVERTERS: [...prev.CONVERTERS, { key: "", value: "" }],
      }));
  };

  const handleRemoveConverter = (index) => {
    setSettingsForm((prev) => {
        const updatedConverters = prev.CONVERTERS.filter((_, i) => i !== index);
        return { ...prev, CONVERTERS: updatedConverters };
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
      MODELS: [...prev.MODELS, { name: "", repo: "", job: "" }],
    }));
  };

  const handleDeleteModel = (index) => {
    setSettingsForm((prev) => {
      const updatedModels = prev.MODELS.filter((_, i) => i !== index);
      return { ...prev, MODELS: updatedModels };
    });
  };

  // Reset a specific model card
  const resetModel = (index) => {
    if (!initialFormData) return;
  
    setSettingsForm((prev) => {
      const updatedModels = [...prev.MODELS];
      // Check if the model exists in initialFormData, if not, reset it to default
      if (initialFormData.MODELS[index]) {
        updatedModels[index] = initialFormData.MODELS[index]; // Restore model from initial data
      } else {
        updatedModels[index] = { name: "", repo: "", job: "" }; // Reset to default if it's a new model
      }
  
      return { ...prev, MODELS: updatedModels };
    });
  };


  // Refetch initial form state to reset the entire form
  const resetForm = () => {
    fetchInitialFormState(); // Re-fetch the initial data when resetting the form
    setShowSaveTooltip(true);
  };

  const handleInputChange = (field, value) => {
    const updatedSettings = structuredClone(settingsForm); // Deep clone the settings form
    const keys = field.split('.'); // Split the field by '.'
  
    // Traverse the cloned object to update the nested value
    let current = updatedSettings;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        current[key] = value; // Update the value at the final key
      } else {
        if (!current[key]) current[key] = {}; // Ensure nested objects exist
        current = current[key];
      }
    });
  
    setSettingsForm(updatedSettings);
    updateState({ settingsForm: updatedSettings }); // Update the global state
  };

  const submitConfig = async () => {
    setLoading(true);
    try {
      await saveConfigData(
        transformSettingsFormToPayload(settingsForm)
      );
      setShowSaveTooltip(false);  // Hide "Don't forget to save"
      setShowResetTooltip(true);  // Show "Reload to apply changes"
    } finally {
      setLoading(false);
    }
  };

  const transformSettingsFormToPayload = (settingsForm) => {
    // Convert models dynamically
    const models = settingsForm.MODELS.reduce((acc, model) => {
      acc[model.name] = model.name; // Add model name
      acc[`${model.name}_repo`] = model.repo; // Add model repo
      acc[`${model.name}_job`] = model.job; // Add model job
      if (model.extraParams) {
        Object.entries(model.extraParams).forEach(([key, value]) => {
          acc[key] = value; // Add extra parameters
        });
      }
      return acc;
    }, {});

    // Convert converters dynamically
    const converters = settingsForm.CONVERTERS.reduce((acc, converter) => {
      acc[converter.key] = converter.value; // Map converter name to version
      return acc;
    }, {});

    return {
      ...settingsForm,
      CONVERTERS: converters,
      MODELS: models,
    };
  };
  
  

  const renderEditableField = (label, field, value, placeholder, explanation) => (
    <FormGroup label={label} helperText={explanation}>
      <div className="flex items-center space-x-2">
        <InputGroup
          value={value || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          readOnly={!editMode[field]}
          placeholder={placeholder}
          className="flex-1"
          rightElement={<Button
            icon={editMode[field] ? "tick" : "edit"}
            intent="primary"
            minimal
            title={editMode[field] ? "Lock this field" : "Edit this field"}
            text={editMode[field] ? "lock" : "edit"}
            onClick={() => toggleEdit(field)}
          />}
        //   disabled={!editMode[field]}
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
            </div>

            <div className="bp5-form-helper-text">
                I would recommend running the <b>Slurm Init</b> script after changing these settings. You can also use <b>Slurm Check Setup</b> to see if its needed. 
            </div>

            <div className="bp5-form-helper-text">
                Please check the <a href="https://nl-bioimaging.github.io/biomero/" target="_blank" rel="noopener noreferrer">BIOMERO documentation</a> for more info.
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
            "SSH.host",
            settingsForm.SSH.host,
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
        "SLURM.slurm_data_path",
        settingsForm.SLURM.slurm_data_path,
        "/data/my-scratch/data",
        "The path on SLURM entrypoint for storing datafiles"
      )}

      {renderEditableField(
        "Slurm Images Path",
        "SLURM.slurm_images_path",
        settingsForm.SLURM.slurm_images_path,
        "/data/my-scratch/singularity_images/workflows",
        "The path on SLURM entrypoint for storing container image files"
      )}

      {renderEditableField(
        "Slurm Script Path",
        "SLURM.slurm_script_path",
        settingsForm.SLURM.slurm_script_path,
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
        "SLURM.slurm_script_repo",
        settingsForm.SLURM.slurm_script_repo,
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
        checked={settingsForm.ANALYTICS.track_workflows}
        label="Track Workflows"
        onChange={(e) => handleInputChange("ANALYTICS.track_workflows", e.target.checked)}
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
            See <a href="https://docs.sqlalchemy.org/en/20/core/engines.html#database-urls" target="_blank" rel="noopener noreferrer">SQLAlchemy docs</a> for more info and examples of database URLs supported by sqlalchemy.
            E.g. postgresql+psycopg2://user:password@localhost:5432/db.
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
        "ANALYTICS.sqlalchemy_url",
        settingsForm.ANALYTICS.sqlalchemy_url,
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
        checked={settingsForm.ANALYTICS.enable_job_accounting}
        label="Enable Job Accounting"
        onChange={(e) => handleInputChange("ANALYTICS.enable_job_accounting", e.target.checked)}
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
        checked={settingsForm.ANALYTICS.enable_job_progress}
        label="Enable Job Progress"
        onChange={(e) => handleInputChange("ANALYTICS.enable_job_progress", e.target.checked)}
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
        checked={settingsForm.ANALYTICS.enable_workflow_analytics}
        label="Enable Workflow Analytics"
        onChange={(e) => handleInputChange("ANALYTICS.enable_workflow_analytics", e.target.checked)}
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
      {settingsForm.CONVERTERS?.map((converter, index) => (
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
        models={settingsForm.MODELS}
        onModelChange={(index, field, value) => handleModelChange(index, field, value)}
        onAddModel={addModel}
        onAddParam={(index, key, value) => {
            const updatedModels = structuredClone(settingsForm.MODELS);
          
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
            setSettingsForm((prev) => ({ ...prev, MODELS: updatedModels }));
          }}
          
                 
        onDeleteModel={handleDeleteModel}
        onResetModel={resetModel}
      />
     </CollapsibleSection>
     <H5>Note on saving BIOMERO settings</H5>
     <div className="bp5-form-group">
        <div className="bp5-form-content">
            <div className="bp5-form-helper-text">
                Note that there are possibly <b>multiple</b> config files that BIOMERO reads from. By default (in this order):
            </div>
            <div className="bp5-form-helper-text">
                <ol>
                  <li> <code>/etc/slurm-config.ini</code> </li>
                  <li> and <code>~/slurm-config.ini</code> </li>
                </ol> 
            </div><div className="bp5-form-helper-text">
                We write the values from this UI in the local <code>~/slurm-config.ini</code>, but read also from the global <code>/etc/slurm-config.ini</code>. 
                So it could be that <b>removing</b> some setting doesn't work because they are set in <code>/etc/slurm-config.ini</code>: if so, please contact your system administrator to change that file. <b>Adding</b> and/or <b>overwriting</b> values should always work, because <code>~/slurm-config.ini</code> is applied last.
            </div>
        </div>
      </div>
      <ButtonGroup>
        <Tooltip 
          content="Please save your changes" 
          intent="none" 
          isOpen={hasChanges && showSaveTooltip}
          compact={true}
          placement="bottom">
          <Button
            icon={loading ? <Spinner size={16} /> : "floppy-disk"}
            intent={hasChanges  && showSaveTooltip ? "primary" : "none"}
            onClick={() => {
              submitConfig();
            }}
          >
            Save Settings
          </Button>
        </Tooltip>
        <Tooltip 
          content="You can still reset (and save again!) if you made a mistake" 
          intent="none" 
          isOpen={hasChanges && showResetTooltip}
          compact={true}
          placement="bottom">
          <Button
            icon="reset"
            intent={hasChanges ? "warning" : "none"}
            disabled={!hasChanges}
            onClick={resetForm}
          >
            Undo All Changes
          </Button>
        </Tooltip>
      </ButtonGroup>

    </Card>
  );
};

export default SettingsForm;
