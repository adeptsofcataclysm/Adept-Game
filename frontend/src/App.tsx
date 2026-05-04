import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { NameEntryPage } from "./pages/NameEntryPage";
import { ShowPage } from "./pages/ShowPage";
import { AdminPage } from "./pages/AdminPage";

export default function App() {
  const { pathname } = useLocation();
  const layoutClass = pathname === "/show" ? "layout layout--show" : "layout";

  return (
    <div className={layoutClass}>
      <Routes>
        <Route path="/" element={<NameEntryPage />} />
        <Route path="/show" element={<ShowPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
