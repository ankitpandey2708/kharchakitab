import { continueRender, delayRender, staticFile } from "remotion";

// Load Google Fonts used in KharchaKitab
const fontFamily = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=JetBrains+Mono:wght@500;600&display=swap";

export const loadFonts = () => {
  const waitForFont = delayRender();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = fontFamily;
  link.addEventListener("load", () => {
    continueRender(waitForFont);
  });
  link.addEventListener("error", () => {
    console.error("Failed to load fonts");
    continueRender(waitForFont);
  });
  document.head.appendChild(link);
};
