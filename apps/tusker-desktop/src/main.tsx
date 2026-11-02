import "./index.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Follow Windows' light/dark setting, using the website's `.dark` theme.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

createRoot(document.getElementById("root")!).render(<App />);
