// main.js

var jQueryNoConflict = jQuery.noConflict(true);

(function($) {
    // Constants
    const SMALL_WIDGET_THRESHOLD = 500;
    const SCRIPT_WINDOW_WIDTH = 800;
    const SCRIPT_WINDOW_HEIGHT = 600;
    const SEARCH_DEBOUNCE_DELAY = 150;

    /**
     * Opens a script window with the given URL.
     * @param {string} scriptUrl - The URL of the script to open.
     */
    function openScriptWindow(scriptUrl) {
        var event = { target: { href: scriptUrl } };
        OME.openScriptWindow(event, SCRIPT_WINDOW_WIDTH, SCRIPT_WINDOW_HEIGHT);
    }

    /**
     * Opens a script upload window with the given URL.
     * @param {string} uploadUrl - The URL for script upload.
     */
    function openScriptUploadWindow(uploadUrl) {
        var event = { target: { href: uploadUrl } };
        OME.openScriptWindow(event, SCRIPT_WINDOW_WIDTH, SCRIPT_WINDOW_HEIGHT);
    }

    /**
     * Initializes the UI components of the script menu widget.
     */
    function initializeUI() {
        $("#scripts-menu-draggable")
            .resizable({
                handles: "all",
                resize: handleWidgetResize
            })
            .draggable({
                handle: ".scripts-menu-window-header",
                containment: "window"
            })
            .hide();

        $(".scripts-menu-maximize-btn").on('click', function() {
            $("#scripts-menu-draggable").toggleClass("maximized");
            handleWidgetResize();
        });

        $(".scripts-menu-close-btn").on('click', function() {
            $("#scripts-menu-draggable").hide();
        });

        if (WEBCLIENT.current_admin_privileges.includes("WriteScriptRepo")) {
            $("#scripts-menu-uploadButton")
                .show()
                .on('click', function(event) {
                    event.preventDefault();
                    openScriptUploadWindow($(this).data('url'));
                });
        }
    }

    /**
     * Handles the resizing of the widget, adjusting UI elements based on size.
     */
    function handleWidgetResize() {
        var widget = $("#scripts-menu-draggable");
        var isSmall = widget.width() < SMALL_WIDGET_THRESHOLD || widget.height() < SMALL_WIDGET_THRESHOLD;
        var searchBar = $("#scripts-menu-searchBar");

        $(".subdirectory-header").toggle(!isSmall);
        $(".script-card").toggleClass('small', isSmall);
        searchBar.toggleClass('small', isSmall).attr('placeholder', isSmall ? 'Search...' : 'Search scripts...');
        $(".script-card-content").toggle(!isSmall);
        $(".directory").toggleClass('small', isSmall);
        $("#scripts-menu-uploadButton").toggle(!isSmall && WEBCLIENT.current_admin_privileges.includes("WriteScriptRepo"));

        if (!isSmall) {
            ScriptMenu.updateScriptCardContent();
        }

        recalculateScroll();
    }

    /**
     * Recalculates the scroll height for tab content.
     */
    function recalculateScroll() {
        $('.tabcontent').each(function() {
            var containerHeight = $('#scripts-menu-draggable').height() - 
                                  $('.scripts-menu-window-header').outerHeight() - 
                                  $('.scripts-menu-tabs').outerHeight();
            $(this).height(containerHeight + 20).css('overflow-y', 'scroll');
        });
    }

    // Set the recalculateScroll function in the ScriptMenu module
    ScriptMenu.setRecalculateScroll(recalculateScroll);

    /**
     * Applies colors to directories and handles any errors.
     */
    function applyColorsWithErrorHandling() {
        if (typeof ColorMe !== 'undefined' && typeof ColorMe.applyColorsToDirectories === 'function') {
            try {
                ColorMe.applyColorsToDirectories();
            } catch (error) {
                console.error("Error applying colors:", error);
            }
        }
    }

    /**
     * Toggles the script menu widget between enlarged and default size.
     */
    function toggleWidgetSize() {
        var widget = $("#scripts-menu-draggable");
        var isEnlarged = widget.hasClass('enlarged');

        if (isEnlarged) {
            // Return to default size and position using CSS
            widget.removeClass('enlarged').css({
                width: '',
                height: '',
                top: '',
                left: '',
                bottom: '50px',
                right: '50px'
            });
        } else {
            // Enlarge with specific constraints
            widget.addClass('enlarged').css({
                width: '',
                height: '',
                top: '',
                left: '',
                bottom: '',
                right: ''
            });
        }

        handleWidgetResize();
    }

    // Document ready function
    $(document).ready(function() {
        initializeUI();

        ScriptMenu.fetchScriptMenu($("#scripts-menu-draggable").data("url"), {
            onSuccess: function(response) {
                handleWidgetResize();
                recalculateScroll();
                setTimeout(applyColorsWithErrorHandling, 0);
            },
            onError: function(error) {
                $("#scripts-menu-draggable").html("<p>Error loading script menu.</p>");
                console.error("Error fetching script menu:", error);
            }
        });

        $(window).on('resize', handleWidgetResize);

        $("#scripts-menu-draggable").on('click', '.script-card, .script-card-content img, #scripts-menu-searchResults .search-result', function(event) {
            event.preventDefault();
            var scriptUrl = $(this).closest('.script-card').data('url');
            openScriptWindow(scriptUrl);
        });

        // Debounce search
        var searchTimeout;
        $("#scripts-menu-searchBar").on('input focus', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(ScriptSearch.searchScripts, SEARCH_DEBOUNCE_DELAY);
        });

        // Expose showScriptWidget function
        window.showScriptWidget = function() {
            $("#scripts-menu-draggable").show();
            handleWidgetResize();
            ScriptMenu.getScriptMenuData();
            setTimeout(applyColorsWithErrorHandling, 0);
        };

        // Add double-click event to toggle widget size
        $(".scripts-menu-window-header").on('dblclick', function() {
            toggleWidgetSize();
        });
    });
})(jQueryNoConflict);