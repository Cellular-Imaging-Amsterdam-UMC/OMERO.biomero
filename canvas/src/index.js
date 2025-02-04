import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./tailwind.css";
import { AppProvider } from "./AppContext";
import BiomeroApp from "./BiomeroApp";
import UploaderApp from "./UploaderApp";

window.onload = function () {
  const rootElement = document.getElementById("root");
  const appName = rootElement.dataset.app || "biomero"; // Default to "biomero"

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppProvider>
        {appName === "biomero" ? <BiomeroApp /> : <UploaderApp />}
      </AppProvider>
    </React.StrictMode>
  );
};
