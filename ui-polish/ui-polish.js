/* UI-polish laag: zoekveld in de maatkeuze (stap 3, Handelsmaat) van de materiaal-editor, alleen
   getoond bij veel opties. Puur DOM-postprocessing bovenop de bestaande bindMaterialEditor, zelfde
   patroon als de al-bestaande profielzoekfunctie (stap 2) — geen wijziging aan de geteste
   render-/bind-functies zelf, alleen een extra laag eromheen. Geen autofocus: het zoekveld wordt
   nooit automatisch gefocust, alleen na een tik van de gebruiker (iPhone-toetsenbord-regel). */
const SIZE_SEARCH_THRESHOLD = 8;

const uiPolishBind = bindMaterialEditor;
bindMaterialEditor = function (state, root, touched, draw) {
  uiPolishBind(state, root, touched, draw);
  const choices = root.querySelector('#catalog-choices');
  if (!choices) return;
  const options = Array.from(choices.querySelectorAll('label.choice'));
  let search = choices.previousElementSibling && choices.previousElementSibling.matches('.profile-search-wrap')
    ? choices.previousElementSibling.querySelector('#size-search')
    : null;
  if (options.length - 1 < SIZE_SEARCH_THRESHOLD) { if (search) search.closest('.profile-search-wrap').remove(); return; }
  if (!search) {
    const wrap = document.createElement('div');
    wrap.className = 'profile-search-wrap';
    wrap.innerHTML = '<label class="visually-hidden" for="size-search">Zoek een maat</label><input class="profile-search" id="size-search" type="search" placeholder="Zoek een maat, bijvoorbeeld 40x40" autocomplete="off">';
    choices.before(wrap);
    search = wrap.querySelector('#size-search');
  }
  search.value = '';
  const empty = document.createElement('p');
  empty.className = 'search-empty';
  empty.hidden = true;
  empty.setAttribute('role', 'status');
  empty.textContent = 'Geen maat gevonden. Pas de zoekterm aan of kies Maatwerk / eigen artikel.';
  const oldEmpty = choices.nextElementSibling;
  if (oldEmpty && oldEmpty.matches('.search-empty')) oldEmpty.remove();
  choices.after(empty);
  search.oninput = () => {
    const term = search.value.trim().toLowerCase();
    let anyVisible = false;
    options.forEach(label => {
      const isCustom = label.querySelector('input').value === 'custom';
      const match = isCustom || !term || label.textContent.toLowerCase().includes(term);
      label.hidden = !match;
      if (match) anyVisible = true;
    });
    empty.hidden = anyVisible;
  };
};
