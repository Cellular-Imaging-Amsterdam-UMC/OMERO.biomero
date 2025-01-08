#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os
import time
import json
import logging
import jwt
import datetime
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.conf import settings
from omeroweb.webclient.decorators import login_required, render_response
from omero.gateway import BlitzGateway
from omero.rtypes import unwrap, rbool, wrap
from .utils import get_biomero_build_file, get_react_build_file
from biomero import SlurmClient

logger = logging.getLogger(__name__)


@login_required()
@require_http_methods(["POST"])
def run_workflow_script(request, conn=None, **kwargs):
    """
    Trigger a specific OMERO script to run based on the provided script name and parameters.
    """
    try:
        # Parse the incoming request body for workflow and script details
        data = json.loads(request.body)
        workflow_name = data.get("workflow_name")
        if not workflow_name:
            return JsonResponse({"error": "workflow_name is required"}, status=400)
        params = data.get("params", {})
        
        script_name = "SLURM_Run_Workflow.py"

        # Connect to OMERO Script Service
        svc = conn.getScriptService()

        # Find the workflow script by name
        scripts = svc.getScripts()
        script = None
        for s in scripts:
            if unwrap(s.getName()) == script_name:
                script = s
                break

        if not script:
            return JsonResponse({"error": f"Script {script_name} not found on server"}, status=404)

        # Run the script with parameters
        script_id = int(unwrap(script.id))        
        # Convert provided params to OMERO rtypes using wrap
        inputs = {f"{workflow_name}_|_{key}": wrap(value) for key, value in params.items()}
        inputs.update({
            workflow_name: rbool(True)
        })

        try:
            # Use runScript to execute
            proc = svc.runScript(script_id, inputs, None)
            omero_job_id = proc.getJob()._id
            msg = f"Started script {script_id} at {datetime.datetime.now()} with Omero Job ID {omero_job_id}"
            logger.info(msg)
            return JsonResponse({"status": "success", "message": f"Script {script_name} for {workflow_name} started successfully: {msg}"})

        except Exception as e:
            logger.error(f"Error executing script {script_name} for {workflow_name}: {str(e)}")
            return JsonResponse({"error": f"Failed to execute script {script_name} for {workflow_name}: {str(e)}"}, status=500)

    except json.JSONDecodeError:
        logger.error("Invalid JSON data")
        return JsonResponse({"error": "Invalid JSON data"}, status=400)
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return JsonResponse({"error": f"Failed to execute workflow for {workflow_name} {inputs}: {str(e)}"}, status=500)
    

@login_required()
@require_http_methods(["GET"])
def list_workflows(request, conn=None, **kwargs):
    """
    List available workflows using SlurmClient.
    """
    try:
        with SlurmClient.from_config(config_only=True) as sc:
            workflows = list(sc.slurm_model_images.keys())
        return JsonResponse({"workflows": workflows})
    except Exception as e:
        logger.error(f"Error listing workflows: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)

@login_required()
@require_http_methods(["GET"])
def get_workflow_metadata(request, conn=None, **kwargs):
    """
    Get metadata for a specific workflow.
    """
    # workflow_name = request.GET.get("workflow", None)
    workflow_name = kwargs.get("name")
    if not workflow_name:
        return JsonResponse({"error": "Workflow name is required"}, status=400)

    try:
        with SlurmClient.from_config(config_only=True) as sc:
            if workflow_name not in sc.slurm_model_images:
                return JsonResponse({"error": "Workflow not found"}, status=404)
            
            metadata = sc.pull_descriptor_from_github(workflow_name)
        return JsonResponse(metadata)
    except Exception as e:
        logger.error(f"Error fetching metadata for workflow {workflow_name}: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)
    
@login_required()
@require_http_methods(["GET"])
def get_workflow_github(request, conn=None, **kwargs):
    """
    Fetch the GitHub link for a specific workflow.
    """
    workflow_name = kwargs.get("name")
    if not workflow_name:
        return JsonResponse({"error": "Workflow name is required"}, status=400)

    try:
        with SlurmClient.from_config(config_only=True) as sc:
            if workflow_name not in sc.slurm_model_repos:
                return JsonResponse({"error": "Workflow not found"}, status=404)

            github = sc.slurm_model_repos[workflow_name]
        return JsonResponse({"url": github})
    except Exception as e:
        logger.error(f"Error fetching descriptor for workflow {workflow_name}: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)



@login_required()
@render_response()
def webclient_templates(request, base_template, **kwargs):
    """Simply return the named template. Similar functionality to
    django.views.generic.simple.direct_to_template"""
    template_name = "scriptmenu/webgateway/%s.html" % base_template
    return {"template": template_name}


@login_required()
def get_script_menu(request, conn=None, **kwargs):
    script_ids = request.GET.get("script_ids", "").split(",")
    script_ids = [int(id) for id in script_ids if id.isdigit()]

    script_menu_data = []
    error_logs = []

    scriptService = conn.getScriptService()

    for script_id in script_ids:
        try:
            script = conn.getObject("OriginalFile", script_id)
            if script is None:
                error_logs.append(f"Script {script_id} not found")
                continue

            try:
                params = scriptService.getParams(script_id)
            except Exception as e:
                logger.warning(f"Exception for script {script_id}: {str(e)}")
                params = None

            if params is None:
                script_data = {
                    "id": script_id,
                    "name": script.name.replace("_", " "),
                    "description": "No description available",
                    "authors": "Unknown",
                    "version": "Unknown",
                }
            else:
                script_data = {
                    "id": script_id,
                    "name": params.name.replace("_", " "),
                    "description": unwrap(params.description)
                    or "No description available",
                    "authors": (
                        ", ".join(params.authors) if params.authors else "Unknown"
                    ),
                    "version": params.version or "Unknown",
                }

            script_menu_data.append(script_data)
        except Exception as ex:
            error_message = (
                f"Error fetching script details for script {script_id}: {str(ex)}"
            )
            logger.error(error_message)
            error_logs.append(error_message)

    return JsonResponse({"script_menu": script_menu_data, "error_logs": error_logs})


### Importer and other database pages ###

# Configure base directory to point to the mounted L-Drive
BASE_DIR = "/L-Drive"

logger.info("\n=== Directory Access Check ===")
logger.info(f"Checking directory structure and permissions:")
logger.info(f"L-Drive directory: {BASE_DIR}")
logger.info(f"   - Exists: {os.path.exists(BASE_DIR)}")
logger.info(
    f"   - Readable: {os.access(BASE_DIR, os.R_OK) if os.path.exists(BASE_DIR) else 'N/A'}"
)
logger.info(
    f"   - Executable: {os.access(BASE_DIR, os.X_OK) if os.path.exists(BASE_DIR) else 'N/A'}"
)


def check_directory_access(path):
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


@login_required()
@render_response()
def omero_boost_upload(request, conn=None, **kwargs):
    """Render the server-side browser page."""
    metabase_site_url = os.environ.get("METABASE_SITE_URL")
    metabase_secret_key = os.environ.get("METABASE_SECRET_KEY")
    metabase_dashboard_id = os.environ.get("METABASE_IMPORTS_DB_PAGE_DASHBOARD_ID")

    current_user = conn.getUser()
    username = current_user.getName()
    user_id = current_user.getId()
    is_admin = conn.isAdmin()
    
    payload = {
        "resource": {"dashboard": int(metabase_dashboard_id)},
        "params": {
            "user_name": [username],
        },
        "exp": round(time.time()) + (60 * 30),  # 10 minute expiration
    }
    token = jwt.encode(payload, metabase_secret_key, algorithm="HS256")

    context = {
        "template": "omeroboost/webclient_plugins/omero_boost_upload.html",
        "user_name": username,
        "user_id": user_id,
        "is_admin": is_admin,
        "base_dir": os.path.basename(BASE_DIR),
        "main_js": get_react_build_file("main.js"),
        "main_css": get_react_build_file("main.css"),
        "metabase_site_url": metabase_site_url,
        "metabase_token": token,
    }
    return context


@login_required()
@require_http_methods(["GET"])
def list_directory(request, conn=None, **kwargs):
    logger.info("\n=== list_directory called ===")
    logger.info(f"Request URL: {request.build_absolute_uri()}")
    logger.info(f"Request path: {request.path}")
    logger.info(f"Request GET params: {request.GET}")

    # Check access to L-Drive
    can_access, message = check_directory_access(BASE_DIR)
    if not can_access:
        logger.error(f"L-Drive access check failed: {message}")
        return JsonResponse({"error": message}, status=403)

    current_path = request.GET.get("path", "")
    abs_current_path = os.path.abspath(os.path.join(BASE_DIR, current_path))

    logger.info(f"Checking access to requested path: {abs_current_path}")
    can_access, message = check_directory_access(abs_current_path)
    if not can_access:
        logger.error(f"Target directory access check failed: {message}")
        return JsonResponse({"error": message}, status=403)

    if not abs_current_path.startswith(BASE_DIR):
        logger.warning(f"Access denied - path {abs_current_path} not within {BASE_DIR}")
        return JsonResponse(
            {"error": "Access denied - path outside of allowed directory"}, status=403
        )

    try:
        items = os.listdir(abs_current_path)
        logger.info(f"Successfully listed directory: {abs_current_path}")
        logger.info(f"Found {len(items)} items")

        dirs = []
        files = []
        for item in items:
            item_path = os.path.join(abs_current_path, item)
            rel_item_path = os.path.relpath(item_path, BASE_DIR)
            if os.path.isdir(item_path):
                dirs.append({"name": item, "path": rel_item_path})
            else:
                files.append({"name": item, "path": rel_item_path})

        return JsonResponse(
            {"current_path": current_path, "dirs": dirs, "files": files}
        )
    except OSError as e:
        logger.error(f"Failed to list directory {abs_current_path}: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_http_methods(["GET"])
def file_info(request, conn=None, **kwargs):
    file_path = request.GET.get("path", "")
    abs_file_path = os.path.abspath(os.path.join(BASE_DIR, file_path))

    if not abs_file_path.startswith(BASE_DIR):
        return JsonResponse({"error": "Access denied"}, status=403)

    try:
        size = os.path.getsize(abs_file_path)
        modified_time = time.ctime(os.path.getmtime(abs_file_path))
        return JsonResponse({"size": f"{size} bytes", "modified": modified_time})
    except OSError as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_http_methods(["POST"])
def import_selected(request, conn=None, **kwargs):
    try:
        import json

        data = json.loads(request.body)
        selected_items = data.get("selected", [])

        if not selected_items:
            return JsonResponse({"error": "No items selected"}, status=400)

        # Get the current user's information for logging
        current_user = conn.getUser()
        username = current_user.getName()
        user_id = current_user.getId()

        # Log the import attempt
        logger.info(
            f"User {username} (ID: {user_id}) attempting to import {len(selected_items)} items"
        )

        for item in selected_items:
            abs_path = os.path.abspath(os.path.join(BASE_DIR, item))
            if not abs_path.startswith(BASE_DIR):
                return JsonResponse({"error": "Access denied"}, status=403)
            logger.info(f"Importing: {abs_path}")
            # Add your actual import logic here

        return JsonResponse(
            {
                "status": "success",
                "message": f"Successfully queued {len(selected_items)} items for import",
            }
        )
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON data"}, status=400)
    except Exception as e:
        logger.error(f"Import error: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@render_response()
def omero_boost_monitor_workflows(request, conn=None, **kwargs):
    metabase_site_url = os.environ.get("METABASE_SITE_URL")
    metabase_secret_key = os.environ.get("METABASE_SECRET_KEY")
    metabase_dashboard_id = os.environ.get("METABASE_WORKFLOWS_DB_PAGE_DASHBOARD_ID")

    # Get the current user's information
    current_user = conn.getUser()
    username = current_user.getName()
    user_id = current_user.getId()

    # Check if the user is an admin
    is_admin = conn.isAdmin()

    # Log admin status
    if is_admin:
        logger.info(f"User {username} (ID: {user_id}) is an admin")
    else:
        logger.info(f"User {username} (ID: {user_id}) is not an admin")

    payload = {
        "resource": {"dashboard": int(metabase_dashboard_id)},
        "params": {
            "user": [user_id],
        },
        "exp": round(time.time()) + (60 * 30),  # 10 minute expiration
    }
    token = jwt.encode(payload, metabase_secret_key, algorithm="HS256")

    context = {
        "metabase_site_url": metabase_site_url,
        "metabase_token": token,
        "template": "omeroboost/webclient_plugins/omero_boost_monitor_workflows.html",
        "user_name": username,
        "user_id": user_id,
        "is_admin": is_admin,
        "biomero_js": get_biomero_build_file("main.js"),
        "biomero_css": get_biomero_build_file("main.css"),
    }
    return context


@login_required()
@render_response()
def imports_webclient_templates(request, base_template, **kwargs):
    """Simply return the named template for imports database."""
    template_name = f"omeroboost/webgateway/{base_template}.html"
    return {"template": template_name}


@login_required()
@render_response()
def workflows_webclient_templates(request, base_template, **kwargs):
    """Simply return the named template for workflows database."""
    template_name = f"omeroboost/webgateway/{base_template}.html"
    return {"template": template_name}


import os
from django.http import JsonResponse, HttpResponseBadRequest
from uuid import uuid4


@login_required()
@render_response()
@require_http_methods(["GET"])
def get_folder_contents(request, conn=None, **kwargs):
    """
    Handles the GET request to retrieve folder contents.
    """
    base_dir = "/tmp"  # Path to root folder from settings

    # Extract the folder ID from the request
    folder_id = request.GET.get("folder_id", None)
    logger.info(f"Connection: {conn.getUser().getName()}")

    # Determine the target directory based on folder_id or default to the root folder
    target_dir = base_dir if folder_id is None else os.path.join(base_dir, folder_id)

    # Validate if the directory exists
    if not os.path.exists(target_dir) or not os.path.isdir(target_dir):
        return HttpResponseBadRequest("Invalid folder ID or path does not exist.")

    # Get the contents of the folder
    contents = []
    for item in os.listdir(target_dir):
        item_path = os.path.join(target_dir, item)
        contents.append(
            {
                "name": item,
                "is_folder": os.path.isdir(item_path),
                "id": os.path.relpath(item_path, base_dir),  # Use relative path as ID
            }
        )

    return {"contents": contents, "folder_id": folder_id}
