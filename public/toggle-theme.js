const primaryColorScheme = "";

const currentTheme = localStorage.getItem("theme");

function getPreferTheme() {
  if (currentTheme) return currentTheme;
  if (primaryColorScheme) return primaryColorScheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

let themeValue = getPreferTheme();

function setPreference() {
  localStorage.setItem("theme", themeValue);
  reflectPreference();
}

function reflectPreference() {
  document.firstElementChild.setAttribute("data-theme", themeValue);

  const body = document.body;
  if (body) {
    const computedStyles = window.getComputedStyle(body);
    const bgColor = computedStyles.backgroundColor;
    document
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", bgColor);
  }
}

reflectPreference();

window.onload = () => {
  reflectPreference();
};

document.addEventListener("astro:before-swap", event => {
  const bgColor = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");

  event.newDocument
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bgColor);
});

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches: isDark }) => {
    const storedTheme = localStorage.getItem("theme");
    if (!storedTheme) {
      themeValue = isDark ? "dark" : "light";
      setPreference();
    }
  });