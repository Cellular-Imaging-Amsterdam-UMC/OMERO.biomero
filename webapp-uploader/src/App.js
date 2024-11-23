import React, { useEffect } from "react";
import FileTree from "./FileTree";
import { useAppContext } from "./AppContext";

const App = () => {
  const { loadTreeData, loading, error } = useAppContext();

  useEffect(() => {
    loadTreeData(); // Load tree data on component mount
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="bg-[#d5d9dd] w-full h-full absolute top-0">
      <div className="flex space-x-4">
        <div className="w-1/4 bg-red-300">
          <FileTree />
        </div>
        <div className="w-1/2 bg-green-300">50% Width</div>
        <div className="w-1/4 bg-blue-300">25% Width</div>
      </div>
    </div>
  );
};

export default App;
