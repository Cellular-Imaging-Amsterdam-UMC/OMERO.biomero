import configparser
import datetime
import json
import logging
import os
import logging
import os

from biomero import SlurmClient
from collections import defaultdict
from configupdater import ConfigUpdater, Comment
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from omeroweb.webclient.decorators import login_required
from .settings import CONFIG_FILE_PATH

logger = logging.getLogger(__name__)


@login_required()
@require_http_methods(["GET", "POST"])
def admin_config(request, conn=None, **kwargs):
    """
    Read the biomero config
    """
    if request.method == "GET":
        try:
            current_user = conn.getUser()
            username = current_user.getName()
            user_id = current_user.getId()
            is_admin = conn.isAdmin()
            if not is_admin:
                logger.error(f"Unauthorized request for user {user_id}:{username}")
                return JsonResponse({"error": "Unauthorized request"}, status=403)
            # Load configuration files in priority order: later files win per-key.
            # [MODELS] and [WORKFLOWS] are treated as the same section (backward-
            # compatible rename) so a file using either name correctly overrides
            # or is overridden by files read before/after it, based solely on
            # file-read order — not section name.
            config_dict = {}
            for _path in [
                os.path.expanduser(SlurmClient._DEFAULT_CONFIG_PATH_1),
                os.path.expanduser(SlurmClient._DEFAULT_CONFIG_PATH_2),
                os.path.expanduser(SlurmClient._DEFAULT_CONFIG_PATH_3),
            ]:
                if not os.path.exists(_path):
                    continue
                _cfg = configparser.ConfigParser(allow_no_value=True)
                _cfg.read(_path)
                for _section in _cfg.sections():
                    # Normalise legacy [MODELS] to [WORKFLOWS]
                    _key = "WORKFLOWS" if _section.upper() == "MODELS" else _section
                    if _key not in config_dict:
                        config_dict[_key] = {}
                    config_dict[_key].update(dict(_cfg.items(_section)))

            # Load the JSON configuration file (biomero-config.json)
            json_config = {}
            if os.path.exists(CONFIG_FILE_PATH):
                try:
                    with open(CONFIG_FILE_PATH, "r") as f:
                        json_config = json.load(f)
                except Exception as e:
                    logger.error(f"Error reading JSON config: {str(e)}")

            # Merge JSON config into config_dict
            # Note: JSON config allows nested dicts, while INI is flat (section -> key/value)
            # We assume top-level keys in JSON correspond to sections or specific config groups
            for key, value in json_config.items():
                config_dict[key] = value

            return JsonResponse({"config": config_dict})
        except Exception as e:
            logger.error(f"Error retrieving BIOMERO config: {str(e)}")
            return JsonResponse({"error": str(e)}, status=500)

    elif request.method == "POST":
        """
        Save the biomero config
        """
        try:
            # Parse the incoming JSON payload
            data = json.loads(request.body)
            current_user = conn.getUser()
            username = current_user.getName()
            user_id = current_user.getId()
            is_admin = conn.isAdmin()
            if not is_admin:
                logger.error(f"Unauthorized request for user {user_id}:{username}")
                return JsonResponse({"error": "Unauthorized request"}, status=403)

            # Define the file path for saving the configuration
            config_path = os.path.expanduser(SlurmClient._DEFAULT_CONFIG_PATH_3)

            # Create ConfigUpdater object
            config = ConfigUpdater()

            # Read the existing configuration if the file exists
            if os.path.exists(config_path):
                config.read(config_path)

            # Extract the 'config' section from the incoming data
            config_data = data.get("config", {})

            def generate_model_comment(key):
                if key.endswith("_job"):
                    c = "# The jobscript in the 'slurm_script_repo'"
                elif key.endswith("_repo"):
                    c = "# The (e.g. github) repository with the descriptor.json / config.yaml file"
                elif key.endswith("_use_gpu"):
                    c = "# Mark this workflow as GPU-enabled by default (uses global gpu_partition / gpu_gres / gpu_gpus)"
                else:
                    c = "# Adding or overriding job value for this workflow"
                return c

            # Separate settings for JSON config and INI config
            json_config_updates = {}
            ini_config_updates = {}

            # Define sections that belong in the JSON configuration
            JSON_SECTIONS = [
                "UPLOADER",
                "PREPROCESSING_CONFIG",
                "PREPROCESSING_EXTENSION_MAP",
                "FILE_OR_EXTENSION_PATTERNS_EXCLUSIVE",
                "UPLOADER_NESTED_FILE_EXTENSIONS",
                "group_mappings",
            ]

            for section, settingsd in config_data.items():
                if section in JSON_SECTIONS:
                    json_config_updates[section] = settingsd
                else:
                    ini_config_updates[section] = settingsd

            # --- Save JSON Config ---
            if json_config_updates:
                try:
                    current_json_config = {}
                    if os.path.exists(CONFIG_FILE_PATH):
                        with open(CONFIG_FILE_PATH, "r") as f:
                            current_json_config = json.load(f) or {}

                    # Update with new values
                    for key, value in json_config_updates.items():
                        current_json_config[key] = value

                    # Ensure directory exists
                    config_dir = os.path.dirname(CONFIG_FILE_PATH)
                    if config_dir and not os.path.exists(config_dir):
                        os.makedirs(config_dir, exist_ok=True)

                    with open(CONFIG_FILE_PATH, "w") as f:
                        json.dump(current_json_config, f, indent=2)
                    logger.info(f"JSON configuration saved to {CONFIG_FILE_PATH}")
                except Exception as e:
                    logger.error(f"Failed to save JSON config: {str(e)}")
                    # We might want to return an error here, but let's see if INI save works first?
                    # Or fail immediately? Let's fail if we can't save the requested changes.
                    return JsonResponse(
                        {"error": f"Failed to save JSON configuration: {str(e)}"},
                        status=500,
                    )

            # --- Save INI Config ---
            # The workflow definitions section may be named [WORKFLOWS]
            # (preferred) or [MODELS] (legacy). The web UI always sends it as
            # "WORKFLOWS", but we preserve whichever name the existing ini file
            # already uses so we never create a duplicate/conflicting section.
            if "WORKFLOWS" in config:
                workflow_section_name = "WORKFLOWS"
            elif "MODELS" in config:
                workflow_section_name = "MODELS"
            else:
                workflow_section_name = "WORKFLOWS"

            # Update the config with new values
            for section, settingsd in ini_config_updates.items():
                if not isinstance(settingsd, dict):
                    raise ValueError(
                        f"Section '{section}' must contain key-value pairs."
                    )

                # Normalize the workflow section name to whatever the existing
                # ini uses (MODELS or WORKFLOWS); they share identical handling.
                if section in ("MODELS", "WORKFLOWS"):
                    section = workflow_section_name

                # If the section doesn't exist, add it
                if section not in config:
                    config.add_section(section)

                if section in ("MODELS", "WORKFLOWS"):
                    # Group keys by prefix (cellpose, stardist, etc.)
                    model_keys = defaultdict(list)
                    for key, value in settingsd.items():
                        # Split the key on the known suffixes to derive the
                        # model prefix.  Order matters: check longer/more-
                        # specific suffixes before shorter ones so that
                        # e.g. "wf_job_mem" → prefix "wf" (not "wf_job").
                        model_prefix = key
                        for suffix in ["use_gpu", "job_", "repo", "job"]:
                            if f"_{suffix}" in key:
                                model_prefix = key.split(f"_{suffix}")[0]
                                break
                        model_keys[model_prefix].append((key, value))

                    # Sort the prefixes and insert the keys in the correct order
                    for model_prefix in sorted(model_keys.keys()):
                        # Add the model-specific keys
                        for key, value in model_keys[model_prefix]:
                            # If the key already exists, just update it
                            if key in config[section]:
                                config.set(section, key, value)
                            else:
                                if key == model_prefix:
                                    comment = f"""
    # -------------------------------------
    # {model_prefix.capitalize()} (added via web UI)
    # -------------------------------------
    # The path to store the container on the slurm_images_path"""
                                    config.set(section, key, value)
                                    (
                                        config[section][
                                            model_prefix
                                        ].add_before.comment(comment)
                                    )
                                else:
                                    # For new keys, add the key and a comment before it
                                    model_comment = generate_model_comment(key)

                                    if "job_" in key:
                                        (
                                            config[section][model_prefix + "_job"]
                                            .add_after.comment(model_comment)
                                            .option(key, value)
                                        )
                                    elif "_job" in key:
                                        (
                                            config[section][model_prefix + "_repo"]
                                            .add_after.comment(model_comment)
                                            .option(key, value)
                                        )
                                    else:
                                        (
                                            config[section][model_prefix]
                                            .add_after.comment(model_comment)
                                            .option(key, value)
                                        )

                    # Check for removing top-level keys and related keys
                    for key in list(config[section].keys()):
                        model_prefix = key
                        for suffix in ["use_gpu", "job_", "repo", "job"]:
                            if f"_{suffix}" in key:
                                model_prefix = key.split(f"_{suffix}")[0]
                                break
                        if model_prefix not in model_keys:
                            # Remove the unwanted key or subsection
                            del config[section][key]

                    for key in list(config[section].keys()):
                        if (
                            key not in settingsd
                        ):  # If key isn't in new settings, remove it
                            del config[section][key]

                elif section == "CONVERTERS":
                    # add new or edits as normal
                    for key, value in settingsd.items():
                        config.set(section, key, value)
                    # Check for removing top-level keys and related keys
                    for key in list(config[section].keys()):
                        if key not in settingsd.keys():
                            del config[section][key]
                else:
                    # Update or add the keys in the section
                    for key, value in settingsd.items():
                        config.set(section, key, value)
                    # Remove sbatch_* keys that were deleted via the UI.
                    # The frontend omits removed entries from the payload, so any
                    # sbatch_* key still in the ini but absent from settingsd is stale.
                    if section == "SLURM":
                        for key in list(config[section].keys()):
                            if key.startswith("sbatch_") and key not in settingsd:
                                del config[section][key]

            # Prepare the update timestamp comment
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            change_comment = f"Config automatically updated by {username} ({user_id}) via the web UI on {timestamp}"
            # Check if the changelog section exists, and create it if not
            if "changelog" not in config:
                config.add_section("changelog")

            # Add the change comment as the first block of the changelog section
            changelog_section = config["changelog"]
            if isinstance(changelog_section.first_block, Comment):
                changelog_section.first_block.detach()
            changelog_section.add_after.comment(change_comment)

            # Save the updated configuration while preserving comments
            try:
                with open(config_path, "w") as config_file:
                    config.write(config_file)
                logger.info(f"Configuration saved successfully to {config_path}")
            except PermissionError:
                logger.error(
                    f"Permission denied writing to {config_path}. Skipping INI save."
                )
                if not json_config_updates:
                    # If we only tried to save INI and failed, that's an error.
                    # If we saved JSON but failed INI, we might want to warn or just succeed partially.
                    # For now, if we have mix, and INI fails, we report error?
                    # But the user might be toggling UPLOADER (JSON) and not caring about Slurm (INI).
                    # So if json_config_updates succeeded, we can treat it as partial success.
                    pass
            except Exception as e:
                logger.error(f"Error saving INI config: {e}")
                raise e

            return JsonResponse(
                {"message": "Configuration saved successfully", "path": config_path},
                status=200,
            )

        except json.JSONDecodeError:
            logger.error("Invalid JSON data in the request")
            return JsonResponse({"error": "Invalid JSON data"}, status=400)
        except ValueError as e:
            logger.error(f"Invalid configuration format: {str(e)}")
            return JsonResponse(
                {"error": f"Invalid configuration format: {str(e)}"}, status=400
            )
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return JsonResponse(
                {"error": f"Failed to save configuration: {str(e)}"}, status=500
            )
    else:
        logger.error("Unsupported HTTP method for 'config' endpoint")
        return HttpResponseBadRequest("Unsupported HTTP method. Use GET or POST.")
