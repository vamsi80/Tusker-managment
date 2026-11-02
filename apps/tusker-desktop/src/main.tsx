import "./index.css";
import { installFetchBridge } from "./next/fetch-bridge";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Before anything renders: the website's code calls fetch("/api/v1/...") from the start.
installFetchBridge();

createRoot(document.getElementById("root")!).render(<App />);
