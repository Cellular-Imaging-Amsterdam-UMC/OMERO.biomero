// color_me.js

var ColorMe = (function() {
    // Constants
    const DEFAULT_LIGHTNESS_PERCENT = 30;
    const COLOR_VARIABLES_COUNT = 8;

    /**
     * Gets the computed style (color) for a CSS variable.
     * @param {string} variableName - The name of the CSS variable.
     * @returns {string|null} The color value or null if not found.
     */
    function getColorFromCSSVariable(variableName) {
        const color = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
        return color || null;
    }

    /**
     * Lightens a given color by a specified percentage.
     * @param {string} color - The color to lighten (in rgb format).
     * @param {number} percent - The percentage to lighten the color.
     * @returns {string} The lightened color in rgb format.
     */
    function lightenColor(color, percent) {
        const rgb = color.match(/\d+/g);
        if (!rgb || rgb.length !== 3) {
            return color;
        }
        const num = rgb.map(Number);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, num[0] + amt);
        const G = Math.min(255, num[1] + amt);
        const B = Math.min(255, num[2] + amt);
        return `rgb(${R}, ${G}, ${B})`;
    }

    /**
     * Applies colors to directories and their script-cards.
     */
    function applyColorsToDirectories() {
        const directories = document.querySelectorAll('#scripts-menu-draggable .directory');
        directories.forEach((directory, index) => {
            const colorVariable = `--directory-color-${(index % COLOR_VARIABLES_COUNT) + 1}`;
            const color = getColorFromCSSVariable(colorVariable);
            
            if (color) {
                directory.style.backgroundColor = color;
                const scriptCards = directory.querySelectorAll('.script-card');
                scriptCards.forEach((scriptCard) => {
                    const lightenedColor = lightenColor(color, DEFAULT_LIGHTNESS_PERCENT);
                    scriptCard.style.backgroundColor = lightenedColor;
                });
            } else {
                directory.style.backgroundColor = 'white';
                const scriptCards = directory.querySelectorAll('.script-card');
                scriptCards.forEach((scriptCard) => {
                    scriptCard.style.backgroundColor = 'white';
                });
            }
        });
    }

    /**
     * Initializes colors with a slight delay to ensure DOM is ready.
     */
    function initializeColors() {
        setTimeout(applyColorsToDirectories, 0);
    }

    return {
        applyColorsToDirectories: applyColorsToDirectories,
        initializeColors: initializeColors
    };
})();