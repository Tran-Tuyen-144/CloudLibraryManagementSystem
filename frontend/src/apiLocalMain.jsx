import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ApiLocalPage from "./pages/ApiLocalPage.jsx";
import "./index.css";
createRoot(document.getElementById("root")).render(<StrictMode><ApiLocalPage /></StrictMode>);
