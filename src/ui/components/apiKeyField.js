function apiKeyField({ id, label, tooltipText, getLinkUrl, linkText }) {
  return `
<div class="form-group">
    <label>${label} <span class="tooltip">?<span class="tooltiptext">${tooltipText}</span></span></label>
    <div class="input-wrapper">
        <input type="password" id="${id}" placeholder="Enter your API Key">
        <button class="test-btn" onclick="testAPI('${id.replace('ApiKey', '')}')">Test</button>
    </div>
    <a href="${getLinkUrl}" target="_blank" class="link">${linkText}</a>
</div>
  `;
}
module.exports = apiKeyField;