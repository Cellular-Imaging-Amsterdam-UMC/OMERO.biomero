import json
import os
from django.conf import settings
from omero_adi.utils.ingest_tracker import (
    log_ingestion_step, 
    STAGE_NEW_ORDER, 
)
from biomero import SlurmClient
import logging

logger = logging.getLogger(__name__)


def get_react_build_file(logical_name):
    """
    Returns the hashed filename for a React build file.
    """
    current_dir = os.path.dirname(__file__)
    manifest_path = os.path.join(
        current_dir, "static/omero_boost/assets/asset-manifest.json"
    )
    manifest_path = os.path.normpath(manifest_path)

    try:
        with open(manifest_path, "r") as manifest_file:
            manifest = json.load(manifest_file)
        path = manifest.get(
            logical_name, logical_name
        )  # Fallback to logical_name if not found
        # Remove first slash
        return path[1:]
    except FileNotFoundError:
        return logical_name


def create_upload_order(order_dict):
    # Log the new order using the original attributes.
    log_ingestion_step(order_dict, STAGE_NEW_ORDER)


def prepare_workflow_parameters(workflow_name, params):
    """
    Apply BIOMERO's exact type conversion logic to ensure correct parameter types.
    This reuses the same logic that BIOMERO uses in convert_cytype_to_omtype.
    """
    try:
        # Get the workflow descriptor using SlurmClient
        with SlurmClient.from_config(config_only=True) as sc:
            if workflow_name not in sc.slurm_model_images:
                logger.warning(f"Workflow {workflow_name} not found in BIOMERO config")
                return params
            
            metadata = sc.pull_descriptor_from_github(workflow_name)
    except Exception as e:
        logger.warning(f"Could not fetch workflow metadata for {workflow_name}: {e}")
        return params

    # Create a lookup for parameter types based on default values
    # This replicates the exact logic from convert_cytype_to_omtype
    param_type_map = {}
    for input_param in metadata.get('inputs', []):
        if input_param.get('type') == 'Number':
            param_id = input_param['id']
            default_val = input_param.get('default-value')
            
            # Use BIOMERO's exact logic: isinstance(default, float) determines type
            if isinstance(default_val, float):
                param_type_map[param_id] = 'float'
            else:
                param_type_map[param_id] = 'int'

    # Convert params to correct types
    converted_params = {}
    for key, value in params.items():
        if key in param_type_map:
            try:
                if param_type_map[key] == 'float':
                    converted_params[key] = float(value)
                else:
                    converted_params[key] = int(float(value))  # Handle string floats like "1.0" -> 1
                logger.info(f"Converted {key}: {value} -> {converted_params[key]} ({param_type_map[key]})")
            except (ValueError, TypeError):
                logger.warning(f"Could not convert {key}={value} to {param_type_map[key]}")
                converted_params[key] = value
        else:
            converted_params[key] = value
    
    return converted_params
