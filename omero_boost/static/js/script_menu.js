// script_menu.js

var ScriptMenu = (function($) {
    // Private variables
    var scriptCardContent = {}; // Stores content for each script card, keyed by script ID
    var recalculateScroll; // Function to recalculate scroll positions, set externally
    var scriptIds = {}; // Stores script IDs for each directory
    var pendingDirectories = 0; // Tracks the number of directories waiting for script data
    var scriptDataFetched = false; // Flag to prevent redundant fetching of script data
    var scriptData = {}; // Stores the fetched detailed script data for each directory

    // Constants
    const SCRIPT_FETCH_DELAY = 100; // Delay before fetching script details (ms)
    const SCRIPT_WINDOW_URL = '/webclient/script_ui/';

    /**
     * Fetches the initial script menu structure.
     * @param {string} url - The URL to fetch the script menu from.
     * @param {Object} callbacks - Callback functions for success and error.
     */
    function fetchScriptMenu(url, callbacks) {
        $.ajax({
            url: url,
            type: "GET",
            success: function(response) {
                if (Array.isArray(response)) {
                    generateMenuContent(response);
                    if (callbacks.onSuccess) callbacks.onSuccess(response);
                    if (!scriptDataFetched) {
                        setTimeout(getScriptMenuData, SCRIPT_FETCH_DELAY);
                    }
                } else {
                    console.error("Unexpected response format:", response);
                    if (callbacks.onError) callbacks.onError("Unexpected response format");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error fetching script menu:", error);
                if (callbacks.onError) callbacks.onError(error);
            }
        });
    }

    /**
     * Generates the menu content and creates the initial structure.
     * @param {Array} response - The script menu structure data.
     */
    function generateMenuContent(response) {
        scriptIds = {};
        
        var tabContainer = $('#scripts-menu-tabContainer');
        var tabContent = $('#scripts-menu-tabContent');
        
        tabContainer.find('.tab-buttons').remove();
        var tabButtonsContainer = $('<div class="tab-buttons"></div>');
        tabContainer.prepend(tabButtonsContainer);

        // Filter out any items that end with '.py'
        var folders = response.filter(function(item) {
            return !item.name.toLowerCase().endsWith('.py');
        });

        folders.forEach(function(folder, index) {
            var folderName = folder.name;
            
            var tabButton = createTabButton(folderName);
            tabButtonsContainer.append(tabButton);
            
            var contentDiv = createTabContent(folderName, folder.ul);
            tabContent.append(contentDiv);
        });

        if (folders.length > 0) {
            openTab(null, folders[0].name);
        } else {
            console.warn("No valid folders found in the script menu.");
        }
    }

    /**
     * Creates a tab button for a folder.
     * @param {string} folderName - The name of the folder.
     * @returns {jQuery} The created tab button.
     */
    function createTabButton(folderName) {
        return $('<button>')
            .addClass('tablink')
            .text(folderName)
            .on('click', function(event) { 
                $("#scripts-menu-searchBar").val('');
                if (typeof ScriptSearch !== 'undefined' && typeof ScriptSearch.exitSearchMode === 'function') {
                    ScriptSearch.exitSearchMode();
                }
                openTab(event, folderName); 
            });
    }

    /**
     * Creates the content div for a tab.
     * @param {string} folderName - The name of the folder.
     * @param {Array} scriptMenu - The script menu data for this folder.
     * @returns {jQuery} The created content div.
     */
    function createTabContent(folderName, scriptMenu) {
        return $('<div>')
            .attr('id', folderName)
            .addClass('tabcontent')
            .html(buildScriptMenuHtml(scriptMenu, true));
    }

    /**
     * Builds the HTML for the script menu.
     * @param {Array} scriptMenu - The script menu data.
     * @param {boolean} isMainDirectory - Whether this is a main directory.
     * @param {string} currentDirectory - The current directory path.
     * @returns {string} The generated HTML.
     */
    function buildScriptMenuHtml(scriptMenu, isMainDirectory = false, currentDirectory = '') {
        var htmlParts = [];
        var looseScripts = [];

        scriptMenu.forEach(function(item) {
            if (item.ul) {
                htmlParts.push(buildDirectoryHtml(item, currentDirectory));
            } else if (item.id) {
                looseScripts.push(buildScriptCardHtml(item, currentDirectory));
            }
        });

        if (looseScripts.length > 0 && isMainDirectory) {
            htmlParts.push(buildLooseScriptsDirectory(looseScripts));
        } else {
            htmlParts.push('<div class="script-cards-container">' + looseScripts.join('') + '</div>');
        }

        if (isMainDirectory) {
            htmlParts.push(buildBottomSpacerDirectory());
        }

        return htmlParts.join('');
    }

    /**
     * Builds the HTML for a directory.
     * @param {Object} item - The directory item.
     * @param {string} currentDirectory - The current directory path.
     * @returns {string} The generated HTML.
     */
    function buildDirectoryHtml(item, currentDirectory) {
        var directoryName = item.name.replace(/_/g, ' ');
        var newDirectory = currentDirectory ? currentDirectory + '/' + directoryName : directoryName;
        return '<div class="directory">' +
               '<div class="subdirectory-header">' + directoryName + '</div>' +
               '<div class="script-cards-container">' + buildScriptMenuHtml(item.ul, false, newDirectory) + '</div>' +
               '</div>';
    }

    /**
     * Builds the HTML for a script card.
     * @param {Object} item - The script item.
     * @param {string} currentDirectory - The current directory path.
     * @returns {string} The generated HTML.
     */
    function buildScriptCardHtml(item, currentDirectory) {
        if (!scriptIds[currentDirectory]) {
            scriptIds[currentDirectory] = [];
        }
        scriptIds[currentDirectory].push(item.id);
        
        var scriptName = item.name.replace('.py', '').replace(/_/g, ' ');
        var content = scriptCardContent[item.id] || '';
        return '<div class="script-card custom-script-card" data-id="' + item.id + '" data-url="' + SCRIPT_WINDOW_URL + item.id + '/">' + 
               scriptName + '<div class="script-card-content">' + content + '</div></div>';
    }

    /**
     * Builds the HTML for a directory of loose scripts.
     * @param {Array} looseScripts - Array of loose script HTML strings.
     * @returns {string} The generated HTML.
     */
    function buildLooseScriptsDirectory(looseScripts) {
        return '<div class="directory">' +
               '<div class="subdirectory-header">&hearts;</div>' +
               '<div class="script-cards-container">' + looseScripts.join('') + '</div>' +
               '</div>';
    }

    /**
     * Builds the HTML for the bottom spacer directory.
     * @returns {string} The generated HTML.
     */
    function buildBottomSpacerDirectory() {
        return '<div class="directory bottom-dir-spacer-container">' +
               '<div class="bottom-dir-spacer"></div>' +
               '</div>';
    }

    /**
     * Opens a tab and displays its content.
     * @param {Event} event - The click event.
     * @param {string} tabId - The ID of the tab to open.
     */
    function openTab(event, tabId) {
        $('.tabcontent').hide();
        $('.tablink').removeClass('active');
        $('#' + tabId).show();
        if (event) {
            $(event.currentTarget).addClass('active');
        } else {
            $('.tablink').filter(function() {
                return $(this).text() === tabId;
            }).addClass('active');
        }
        if (recalculateScroll) recalculateScroll();
    }

    /**
     * Sets the function to recalculate scroll positions.
     * @param {Function} func - The function to set.
     */
    function setRecalculateScroll(func) {
        recalculateScroll = func;
    }

    /**
     * Fetches detailed script data for each directory.
     */
    function getScriptMenuData() {
        if (Object.keys(scriptIds).length === 0) {
            console.warn("No script IDs found. Skipping getScriptMenuData.");
            return;
        }

        pendingDirectories = Object.keys(scriptIds).length;

        Object.keys(scriptIds).forEach(function(directory) {
            fetchScriptData(directory);
        });
    }

    /**
     * Fetches script data for a specific directory.
     * @param {string} directory - The directory to fetch data for.
     */
    function fetchScriptData(directory) {
        $.ajax({
            url: '/scriptmenu/get_script_menu/',
            type: 'GET',
            data: { 
                script_ids: scriptIds[directory].join(','),
                directory: directory
            },
            success: function(response) {
                handleScriptDataResponse(response, directory);
            },
            error: function(xhr, status, error) {
                console.error('Error fetching script menu data for ' + directory + ':', error);
                pendingDirectories--;
            }
        });
    }

    /**
     * Handles the response from fetching script data.
     * @param {Object} response - The response data.
     * @param {string} directory - The directory the data is for.
     */
    function handleScriptDataResponse(response, directory) {
        if (response.script_menu) {
            scriptData[directory] = response.script_menu;
            updateScriptCards(response.script_menu, directory);
        } else {
            console.warn('No script_menu data in response for ' + directory);
        }
        if (response.error_logs && response.error_logs.length > 0) {
            console.warn('Errors fetching script data for ' + directory + ':', response.error_logs);
        }
        pendingDirectories--;
    }

    /**
     * Updates script cards with fetched detailed data.
     * @param {Array} scriptData - The script data to update with.
     * @param {string} directory - The directory the scripts belong to.
     */
    function updateScriptCards(scriptData, directory) {
        scriptData.forEach(function(script) {
            var $card = $('.script-card[data-id="' + script.id + '"]');
            if ($card.length) {
                var content = formatScriptContent(script);
                $card.data('content', content);
                if (!$card.hasClass('small')) {
                    $card.find('.script-card-content').html(content);
                }
                $card.addClass('loaded');
            } else {
                console.warn('Card not found for script ID:', script.id, 'in directory:', directory);
            }
        });
    }

    /**
     * Formats the content for a script card.
     * @param {Object} script - The script data.
     * @returns {string} The formatted content.
     */
    function formatScriptContent(script) {
        return (script.description || 'No description could be obtained') + '<br>' +
               '<strong>Authors:</strong> ' + (script.authors || 'Unknown') + '<br>' +
               '<strong>Version:</strong> ' + (script.version || 'Unknown');
    }

    /**
     * Updates all script card contents (called when widget is enlarged).
     */
    function updateScriptCardContent() {
        $('.script-card').each(function() {
            var $card = $(this);
            var content = $card.data('content');
            if (content) {
                $card.find('.script-card-content').html(content);
            }
        });
    }

    // Public API
    return {
        fetchScriptMenu: fetchScriptMenu,
        openTab: openTab,
        setRecalculateScroll: setRecalculateScroll,
        getScriptMenuData: getScriptMenuData,
        updateScriptCardContent: updateScriptCardContent
    };
})(jQuery);