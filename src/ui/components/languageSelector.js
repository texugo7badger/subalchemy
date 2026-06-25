/**
 * Language selector component for the /configure page.
 *
 * Renders the static shell: label, tags container for selected languages,
 * search input, and the dynamic list container. The actual language list
 * and click-to-add logic live in /assets/app.js (so it runs client-side).
 *
 * Used by: src/ui/configurePage.js
 */
function languageSelector() {
  return `
<div class="form-group">
    <label>Preferred Languages (Max 3)</label>
    <div class="tags-container" id="selectedLangs"></div>
    <input type="text" id="langSearch" placeholder="Search languages..." oninput="filterLangs()">
    <div id="langList"></div>
</div>
  `;
}
module.exports = languageSelector;