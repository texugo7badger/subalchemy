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