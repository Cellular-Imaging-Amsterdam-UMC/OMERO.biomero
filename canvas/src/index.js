import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  useSearchParams,
  useNavigate,
} from "react-router-dom";

import "./index.css";
import "./tailwind.css";
import { AppProvider } from "./AppContext";
import BiomeroApp from "./BiomeroApp";
import UploaderApp from "./UploaderApp";
import {
  Navbar,
  NavbarGroup,
  NavbarHeading,
  NavbarDivider,
  Icon,
  Button,
} from "@blueprintjs/core";
function AppRouter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const appName = searchParams.get("tab") || "upload"; // Default to "biomero"

  return (
    <AppProvider>
      <div className="bg-[#f0f1f5] w-full h-full relative top-0 overflow-hidden">
        <Navbar className="z-[1]">
          <NavbarGroup>
            <Icon icon="style" className="mr-[7px]" />
            <NavbarHeading>CANVAS</NavbarHeading>
            <NavbarDivider />
            <Button
              className="bp5-minimal focus:ring-0 focus:ring-offset-0"
              icon="cloud-upload"
              text="Upload"
              onClick={() => navigate("?tab=upload")}
              outlined={appName === "upload"}
            />
            <Button
              className="bp5-minimal focus:ring-0 focus:ring-offset-0"
              icon="data-sync"
              text="Analyze"
              onClick={() => navigate("?tab=biomero")}
              outlined={appName === "biomero"}
            />
          </NavbarGroup>
        </Navbar>
        {appName === "biomero" ? <BiomeroApp /> : <UploaderApp />}
      </div>
    </AppProvider>
  );
}

window.onload = function () {
  const rootElement = document.getElementById("root");
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<AppRouter />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
};
