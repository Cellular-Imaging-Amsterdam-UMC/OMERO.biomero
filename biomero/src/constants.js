export const getDjangoConstants = () => {
  const WEBCLIENT = window.WEBCLIENT;
  const user = {
    USER: WEBCLIENT.USER,
    active_user: WEBCLIENT.active_user,
    member_of_groups: WEBCLIENT.member_of_groups,
    isAdmin: WEBCLIENT.isAdmin,
    CAN_CREATE: WEBCLIENT.CAN_CREATE,
    current_admin_privileges: WEBCLIENT.current_admin_privileges,
    leader_of_groups: WEBCLIENT.leader_of_groups,
    active_group_id: WEBCLIENT.active_group_id,
  };

  const urls = {
    webindex: WEBCLIENT.URLS.webindex,
    api_paths_to_object: WEBCLIENT.URLS.api_paths_to_object,
    api_containers: WEBCLIENT.URLS.api_containers,
    api_datasets: WEBCLIENT.URLS.api_datasets,
    api_images: WEBCLIENT.URLS.api_images,
    api_plates: WEBCLIENT.URLS.api_plates,
    api_plate_acquisitions: WEBCLIENT.URLS.api_plate_acquisitions,
    api_base: WEBCLIENT.URLS.api_base,
    static_webclient: WEBCLIENT.URLS.static_webclient,
    static_webgateway: WEBCLIENT.URLS.static_webgateway,
    api_tags_and_tagged: WEBCLIENT.URLS.api_tags_and_tagged,
    fileset_check: WEBCLIENT.URLS.fileset_check,
    api_parent_links: WEBCLIENT.URLS.api_parent_links,
    deletemany: WEBCLIENT.URLS.deletemany,
    copy_image_rdef_json: WEBCLIENT.URLS.copy_image_rdef_json,
    reset_owners_rdef_json: WEBCLIENT.URLS.reset_owners_rdef_json,
    reset_rdef_json: WEBCLIENT.URLS.reset_rdef_json,
    script_upload: WEBCLIENT.URLS.script_upload,
    initially_select: WEBCLIENT.initially_select,
    initially_open: WEBCLIENT.initially_open,
    tree_top_level: WEBCLIENT.URLS.tree_top_level,
    api_experimenter: WEBCLIENT.URLS.api_experimenter,
    api_local_file_browser: "/omero_boost/local_file_browser/",
    api_get_groups: "/webclient/group_user_content/",
  };

  return { user, urls };
};
