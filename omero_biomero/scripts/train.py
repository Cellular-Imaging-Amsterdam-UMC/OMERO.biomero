#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
OMERO script for Model Training.
This script submits a SLURM job to train a model.
"""

import omero.scripts as scripts
from omero.gateway import BlitzGateway
import omero.rtypes as rtypes
import os
import subprocess
import tempfile

def run(conn, params):
    dataset_id = params.get("Dataset_ID")
    epochs = params.get("Epochs")
    batch_size = params.get("Batch_Size")
    val_split = params.get("Validation_Split")
    patch_size = params.get("Patch_Size")
    model_name = params.get("Model_Name")
    
    # Validation
    if not dataset_id:
        return None
        
    dataset = conn.getObject("Dataset", dataset_id)
    if not dataset:
        return "Dataset not found"

    # Define paths
    # Assuming scripts are deployed to a known location
    # In production, this should be configurable
    script_dir = os.path.dirname(os.path.realpath(__file__))
    worker_script = os.path.join(script_dir, "train_worker.py")
    
    # Create sbatch script
    # We use the current user's session
    session_uuid = conn.getEventContext().sessionUuid
    host = conn.host
    port = conn.port
    
    # Construct arguments for worker
    # We need to pass connection details. 
    # NOTE: Passing session UUID is secure enough for internal use, 
    # but ensure the worker connects to the same host/port.
    
    cmd = [
        "python", worker_script,
        "--host", host,
        "--port", str(port),
        "--session", session_uuid,
        "--dataset-id", str(dataset_id),
        "--epochs", str(epochs),
        "--batch-size", str(batch_size),
        "--val-split", str(val_split),
        "--patch-size", str(patch_size),
        "--model-name", model_name
    ]
    
    cmd_str = " ".join(cmd)
    
    # SBATCH content
    sbatch_content = f"""#!/bin/bash
#SBATCH --job-name=prediction_{model_name}
#SBATCH --output=slurm_%j.out
#SBATCH --error=slurm_%j.err
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --gres=gpu:1
#SBATCH --time=04:00:00

echo "Starting Training..."
# Activate environment if needed
# source /opt/conda/etc/profile.d/conda.sh
# conda activate prediction_env

{cmd_str}
"""

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix=".sh") as tmp:
        tmp.write(sbatch_content)
        tmp_path = tmp.name
        
    try:
        # Submit to Slurm
        res = subprocess.run(["sbatch", tmp_path], capture_output=True, text=True, check=True)
        output = res.stdout.strip()
        job_id = output.split(" ")[-1] # "Submitted batch job 12345"
        
        return f"Job submitted: {job_id}"
        
    except Exception as e:
        return f"Failed to submit job: {str(e)}"
    finally:
        os.remove(tmp_path)


def main():
    client = scripts.client(
        "Prediction_Training",
        "Train a model on OMERO dataset",
        scripts.Long("Dataset_ID", optional=False),
        scripts.Int("Epochs", default=100),
        scripts.Int("Batch_Size", default=4),
        scripts.Float("Validation_Split", default=0.15),
        scripts.Int("Patch_Size", default=256),
        scripts.String("Model_Name", default="my_model"),
    )
    
    try:
        # process
        result = run(client.getSession(), client.getInputs(unwrap=True))
        client.setOutput("Message", rtypes.rstring(str(result)))
    finally:
        client.closeSession()

if __name__ == "__main__":
    main()
