/**
 * v2.4.5: Language selector component for the /configure page.
 *
 * Now reflects the expanded catalog of 23 languages organized into 4
 * visible categories so users can discover the new Balkan pack and the
 * 5 additional languages without having to type a search query.
 *
 * The actual language list + click-to-add logic lives in
 * /assets/app.js (so it can run client-side). This component only
 * renders the static shell: label, category chips, search input,
 * and the dynamic list container.
 *
 * Categories shown as filter chips:
 *   - Portuguese variants (3): pt-br, pt-pt, pt
 *   - Major (12): en, es, fr, de, it, ja, zh, zh-tw, ru, ar, hi, ko
 *   - Balkan pack (6): sr, hr, bs, sl, bg, el
 *   - Additional (5): tr, pl, nl, he, vi
 *
 * The chips set window.__langFilter so app.js can filter the list
 * accordingly. Clicking "All" clears the filter.
 */
function languageSelector() {
  return `
<div class="form-group">
    <label>Preferred Languages (Max 3) <span class="lang-count">— 23 available</span></label>
    <div class="lang-categories" id="langCategories">
        <button type="button" class="lang-cat-chip active" data-cat="all">All (23)</button>
        <button type="button" class="lang-cat-chip" data-cat="portuguese">Portuguese (3)</button>
        <button type="button" class="lang-cat-chip" data-cat="major">Major (12)</button>
        <button type="button" class="lang-cat-chip" data-cat="balkan">Balkan pack (6)</button>
        <button type="button" class="lang-cat-chip" data-cat="additional">Additional (5)</button>
    </div>
    <div class="tags-container" id="selectedLangs"></div>
    <input type="text" id="langSearch" placeholder="Search languages..." oninput="filterLangs()">
    <div id="langList"></div>
</div>
<script>
// Category filter — read by filterLangs() in app.js
window.__langFilter = 'all';
document.addEventListener('DOMContentLoaded', function () {
    var chips = document.querySelectorAll('.lang-cat-chip');
    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            chips.forEach(function (c) { c.classList.remove('active'); });
            chip.classList.add('active');
            window.__langFilter = chip.getAttribute('data-cat');
            // Re-run the filter so the list updates immediately
            if (typeof filterLangs === 'function') filterLangs();
        });
    });
});
</script>
  `;
}
module.exports = languageSelector;
