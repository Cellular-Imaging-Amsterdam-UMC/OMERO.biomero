import React, { useState } from "react";
import { Button, FormGroup, NumericInput, InputGroup } from "@blueprintjs/core";

const TrainingForm = ({ onTrain, loading }) => {
  const [config, setConfig] = useState({
      epochs: 100,
      batchSize: 4,
      valSplit: 0.15,
      patchSize: 256,
      name: "my_stardist_model"
  });

  const handleChange = (key, value) => {
      setConfig({ ...config, [key]: value });
  };

  const handleSubmit = () => {
      onTrain(config);
  };

  return (
    <div className="flex flex-col gap-4 max-w-md">
       <FormGroup label="Model Name" labelFor="model-name">
          <InputGroup 
              id="model-name" 
              value={config.name} 
              onChange={(e) => handleChange("name", e.target.value)} 
          />
       </FormGroup>

       <FormGroup label="Epochs" labelFor="epochs">
          <NumericInput 
              id="epochs" 
              value={config.epochs} 
              onValueChange={(v) => handleChange("epochs", v)} 
              min={1} 
              max={1000}
          />
       </FormGroup>

       <FormGroup label="Batch Size" labelFor="batch-size">
          <NumericInput 
              id="batch-size" 
              value={config.batchSize} 
              onValueChange={(v) => handleChange("batchSize", v)} 
              min={1} 
              max={32}
          />
       </FormGroup>

       <FormGroup label="Validation Split (0.0 - 1.0)" labelFor="val-split">
          <NumericInput 
              id="val-split" 
              value={config.valSplit} 
              onValueChange={(v) => handleChange("valSplit", v)} 
              min={0.05} 
              max={0.5}
              stepSize={0.05}
          />
       </FormGroup>
       
       <FormGroup label="Patch Size (px)" labelFor="patch-size">
          <NumericInput 
              id="patch-size" 
              value={config.patchSize} 
              onValueChange={(v) => handleChange("patchSize", v)} 
              min={64} 
              max={1024}
              stepSize={32}
          />
       </FormGroup>

       <Button 
          intent="primary" 
          onClick={handleSubmit} 
          loading={loading}
          icon="learning"
          large={true}
       >
          Start Training
       </Button>
    </div>
  );
};

export default TrainingForm;
