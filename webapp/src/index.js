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
import BiomeroApp from "./biomero/BiomeroApp";
import ImporterApp from "./uploader/ImporterApp";
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
      <div className="bg-[#f0f1f5] w-full h-full relative top-0">
        <Navbar className="z-[1] top-[35px]" fixedToTop>
          <NavbarGroup>
            <Icon icon="style" className="mr-[7px]" />
            <NavbarHeading>Biomero</NavbarHeading>
            <NavbarDivider />
            <Button
              className="bp5-minimal focus:ring-0 focus:ring-offset-0"
              icon="cloud-upload"
              text="Import"
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
        <div className="pt-[50px]">
          {appName === "biomero" ? <BiomeroApp /> : <ImporterApp />}
        </div>
      </div>
    </AppProvider>
  );
}

window.onload = function () {
  const rootElement = document.getElementById("root");
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<AppRouter />} />
      </Routes>
    </BrowserRouter>
  );
};
