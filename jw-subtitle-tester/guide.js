function switchLang(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.guide-section').forEach(section => section.classList.remove('active'));

  const clickedBtn = document.querySelector(`.lang-btn[data-lang="${lang}"]`);
  const targetSection = document.getElementById(`guide-${lang}`);

  if (clickedBtn && targetSection) {
    clickedBtn.classList.add('active');
    targetSection.classList.add('active');
    chrome.storage.local.set({ uiLanguage: lang });
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

  // Sync language with storage
  chrome.storage.local.get(["uiLanguage"]).then((result) => {
    const lang = result.uiLanguage || 'km';
    switchLang(lang);
  }).catch(() => {
    switchLang('km');
  });
});
