import json
import os
import logging

from .settings import (
    BASE_DIR,
    CONFIG_FILE_PATH,
    GROUP_MAPPINGS_FILE_PATH,
    UPLOADER_DESTINATION_DIR,
)

logger = logging.getLogger(__name__)


def parse_bool_env(env_var, default=True):
    """
    Parse environment variable as boolean with graceful handling of multiple formats.

    Accepts: 'true', 'True', 'TRUE', '1', 'yes', 'on', 'enabled'
    Rejects: 'false', 'False', 'FALSE', '0', 'no', 'off', 'disabled', None, ''
    """
    if env_var is None:
        return default

    if isinstance(env_var, bool):
        return env_var

    # Convert to string and normalize
    str_val = str(env_var).lower().strip()

    # Truthy values
    truthy = {"true", "1", "yes", "on", "enabled", "enable"}
    # Falsy values
    falsy = {"false", "0", "no", "off", "disabled", "disable", ""}

    if str_val in truthy:
        return True
    elif str_val in falsy:
        return False
    else:
        # Log warning for unrecognized values
        logger.warning(
            f"Unrecognized boolean value '{env_var}' for environment variable, defaulting to {default}"
        )
        return default


def get_react_build_file(logical_name):
    """
    Returns the hashed filename for a React build file.
    """
    current_dir = os.path.dirname(__file__)
    manifest_path = os.path.join(
        current_dir, "static/omero_biomero/assets/asset-manifest.json"
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


def check_directory_permissions(path):
    """Check if a directory exists and is accessible."""
    try:
        exists = os.path.exists(path)
        readable = os.access(path, os.R_OK) if exists else False
        executable = os.access(path, os.X_OK) if exists else False

        if not exists:
            return False, f"Directory does not exist: {path}"
        if not readable:
            return False, f"Directory is not readable: {path}"
        if not executable:
            return False, f"Directory is not executable (searchable): {path}"

        return True, "Directory is accessible"
    except Exception as e:
        return False, f"Error checking directory access: {str(e)}"


def build_extra_params(template_extra, uuid_value):
    """
    Materialize extra preprocessing parameters from a template dict.

    Behavior:
        - For each key/value in template_extra:
                * If value is a string containing the {UUID} placeholder and
                    a uuid_value is provided, substitute it.
                * If value contains {UUID} but no uuid_value is provided,
                    skip that key.
                * Otherwise copy the value as-is.
    - Returns a new dict or None if no parameters remain after filtering.
    """
    if not template_extra:
        return None

    realized = {}
    for key, value in template_extra.items():
        if isinstance(value, str) and "{UUID}" in value:
            if uuid_value:
                realized[key] = value.replace("{UUID}", uuid_value)
            else:
                # Skip param requiring UUID when none available
                continue
        else:
            realized[key] = value

    return realized or None


def load_json_object(path, default=None):
    """Load a JSON object from disk, returning a default on errors."""
    if default is None:
        default = {}

    if not path or not os.path.exists(path):
        return default

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else default
    except Exception:
        logger.warning("Failed reading JSON object from %s", path, exc_info=True)
        return default


def is_upload_to_group_folder_enabled(config_file_path=None):
    """Return whether uploads should be assembled inside the active group folder."""
    config_file_path = config_file_path or CONFIG_FILE_PATH
    config = load_json_object(config_file_path, {})
    uploader_config = config.get("UPLOADER", {})
    if not isinstance(uploader_config, dict):
        return False
    return parse_bool_env(uploader_config.get("upload_to_group_folder"), default=False)


def get_all_group_mappings(config_file_path=None, group_mappings_file_path=None):
    """
    Return merged group mappings from both config locations.

    Backward compatibility:
    - Load from biomero-config.json (under 'group_mappings' key)
    - Load from group-mappings.json (the whole file is mappings)
    - group-mappings.json overrides mappings in biomero-config.json
    """
    config_file_path = config_file_path or CONFIG_FILE_PATH
    group_mappings_file_path = group_mappings_file_path or GROUP_MAPPINGS_FILE_PATH

    # 1. Load legacy mappings from technical config
    config = load_json_object(config_file_path, {})
    legacy_mappings = config.get("group_mappings", {})
    if not isinstance(legacy_mappings, dict):
        legacy_mappings = {}

    # 2. Load primary mappings from group-mappings file
    primary_mappings = load_json_object(group_mappings_file_path, {})

    # Merge: primary overrides legacy
    merged = legacy_mappings.copy()
    merged.update(primary_mappings)
    return merged


def get_group_folder_path(group_id, base_dir=None, group_mappings_file_path=None):
    """Resolve the mapped filesystem folder for a group id."""
    if group_id is None:
        return None

    base_dir = base_dir or BASE_DIR
    mappings = get_all_group_mappings(
        config_file_path=None, group_mappings_file_path=group_mappings_file_path
    )
    mapping = mappings.get(str(group_id)) or mappings.get(group_id)

    if not isinstance(mapping, dict):
        return None

    folder = mapping.get("folder")
    if not folder or folder in {".", "root"}:
        return base_dir

    return os.path.join(base_dir, folder)


def get_upload_storage_dir(
    user_id,
    username=None,
    group_id=None,
    *,
    base_dir=None,
    config_file_path=None,
    group_mappings_file_path=None,
    uploader_destination_dir=None,
):
    """Return the directory where uploaded files should be assembled for a user."""
    base_dir = base_dir or BASE_DIR
    config_file_path = config_file_path or CONFIG_FILE_PATH
    group_mappings_file_path = group_mappings_file_path or GROUP_MAPPINGS_FILE_PATH
    uploader_destination_dir = uploader_destination_dir or UPLOADER_DESTINATION_DIR

    default_dir = os.path.join(uploader_destination_dir, f"user_{user_id}")

    if not is_upload_to_group_folder_enabled(config_file_path):
        return default_dir

    if not username or group_id is None:
        logger.warning(
            "Upload-to-group-folder is enabled but username/group_id missing; using default uploader destination"
        )
        return default_dir

    group_folder_path = get_group_folder_path(
        group_id,
        base_dir=base_dir,
        group_mappings_file_path=group_mappings_file_path,
    )
    if not group_folder_path:
        logger.warning(
            "Upload-to-group-folder is enabled but no group folder mapping exists for group %s; using default uploader destination",
            group_id,
        )
        return default_dir

    return os.path.join(group_folder_path, "uploads", username)


def get_uploaded_file_candidates(
    filename,
    user_id,
    username=None,
    group_id=None,
    *,
    base_dir=None,
    config_file_path=None,
    group_mappings_file_path=None,
    uploader_destination_dir=None,
):
    """Return candidate file paths for an uploaded file, newest layout first."""
    uploader_destination_dir = uploader_destination_dir or UPLOADER_DESTINATION_DIR

    candidates = []
    primary_dir = get_upload_storage_dir(
        user_id,
        username=username,
        group_id=group_id,
        base_dir=base_dir,
        config_file_path=config_file_path,
        group_mappings_file_path=group_mappings_file_path,
        uploader_destination_dir=uploader_destination_dir,
    )

    for path in (
        os.path.join(primary_dir, filename),
        os.path.join(uploader_destination_dir, f"user_{user_id}", filename),
        os.path.join(uploader_destination_dir, filename),
    ):
        if path not in candidates:
            candidates.append(path)

    return candidates
