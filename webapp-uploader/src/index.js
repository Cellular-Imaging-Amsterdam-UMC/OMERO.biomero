import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "./tailwind.css";
import { AppProvider } from "./AppContext";

window.onload = function () {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
};
