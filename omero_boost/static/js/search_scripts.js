// search_scripts.js

var ScriptSearch = (function() {
    // Constants
    const SEARCH_BAR_ID = '#scripts-menu-searchBar';
    const SEARCH_RESULTS_ID = '#scripts-menu-searchResults';
    const TAB_CONTENT_ID = '#scripts-menu-tabContent';

    /**
     * Performs a search on script cards based on the input in the search bar.
     */
    function searchScripts() {
        const filter = $(SEARCH_BAR_ID).val().toLowerCase();
        
        if (filter === "") {
            exitSearchMode();
            return;
        }

        // Simulate form submission to trigger browser autocomplete
        $("#searchForm").submit();

        enterSearchMode();

        const results = collectSearchResults(filter);
        displaySearchResults(results);
    }

    /**
     * Collects search results based on the given filter.
     * @param {string} filter - The search term to filter scripts.
     * @returns {Array} An array of matching script card elements with their tab IDs.
     */
    function collectSearchResults(filter) {
        const results = [];
        $(".tabcontent").each(function() {
            const tabId = $(this).attr('id');
            $(this).find(".script-card").each(function() {
                if ($(this).text().toLowerCase().includes(filter)) {
                    results.push({
                        tabId: tabId,
                        element: $(this).clone()
                    });
                }
            });
        });
        return results;
    }

    /**
     * Enters search mode by hiding tab content and showing search results.
     */
    function enterSearchMode() {
        $('.scripts-menu-tabs button').removeClass('active');
        $(TAB_CONTENT_ID).hide();
        $(SEARCH_RESULTS_ID).show();
    }

    /**
     * Exits search mode by showing tab content and hiding search results.
     */
    function exitSearchMode() {
        $(SEARCH_RESULTS_ID).hide();
        $(TAB_CONTENT_ID).show();
        if ($('.scripts-menu-tabs button.active').length === 0) {
            $('.scripts-menu-tabs button:first').addClass('active').trigger('click');
        }
    }

    /**
     * Displays search results in the search results container.
     * @param {Array} results - An array of search result objects.
     */
    function displaySearchResults(results) {
        const $searchResults = $(SEARCH_RESULTS_ID);
        $searchResults.empty();

        if (results.length === 0) {
            $searchResults.append('<p>No results found.</p>');
        } else {
            const $resultsList = $('<div class="search-results-list"></div>');
            results.forEach(function(result) {
                const $resultItem = $('<div class="search-result"></div>');
                $resultItem.append(result.element);
                $resultsList.append($resultItem);
            });
            $searchResults.append($resultsList);
        }
    }

    // Initialize search bar event listeners
    $(document).ready(function() {
        // Add keypress event to trigger form submission on Enter key
        $(SEARCH_BAR_ID).on('keypress', function(event) {
            if (event.which === 13) { // 13 is the Enter key
                $("#searchForm").submit(); // Programmatically submit the form
            }
        });
    });

    return {
        searchScripts: searchScripts,
        exitSearchMode: exitSearchMode
    };
})();