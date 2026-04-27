import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { NetworkStoreProvider } from "./store/networkStore";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <NetworkStoreProvider>
            <App />
        </NetworkStoreProvider>
    </React.StrictMode>,
);
