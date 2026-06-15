function switchLang(lang, writeToStorage = true) {
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.guide-section').forEach(section => section.classList.remove('active'));

  const clickedBtn = document.querySelector(`.lang-btn[data-lang="${lang}"]`);
  const targetSection = document.getElementById(`guide-${lang}`);

  if (clickedBtn && targetSection) {
    clickedBtn.classList.add('active');
    targetSection.classList.add('active');
    if (writeToStorage) {
      chrome.storage.local.set({ uiLanguage: lang });
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Bind click handlers to language buttons (CSP compliant)
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      switchLang(lang);
    });
  });

  // Sync language with storage on load
  chrome.storage.local.get(["uiLanguage"]).then((result) => {
    const lang = result.uiLanguage || 'km';
    switchLang(lang, false);
  }).catch(() => {
    switchLang('km', false);
  });

  // Listen for storage changes to sync language dynamically when changed in popup
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.uiLanguage) {
      const newLang = changes.uiLanguage.newValue;
      if (newLang) {
        switchLang(newLang, false);
      }
    }
  });
});
