import "./index.css";
import { installFetchBridge } from "./next/fetch-bridge";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Follow Windows' light/dark setting, using the website's `.dark` theme.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// Before anything renders: the website's code calls fetch("/api/v1/...") from the start.
installFetchBridge();

createRoot(document.getElementById("root")!).render(<App />);
