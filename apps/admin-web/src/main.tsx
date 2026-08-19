import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app";
import { AuthProvider } from "./modules/auth/auth-context";
import { queryClient } from "./modules/core/query-client";
import { installCustomFormValidation } from "./modules/ui/custom-form-validation";
import "./styles.css";

installCustomFormValidation();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
