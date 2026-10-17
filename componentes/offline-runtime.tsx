"use client";
import { useEffect, useState } from "react";

export default function OfflineRuntime() {
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(() => setInstalled(true))
        .catch((error) => console.warn("BOOM POS: no se pudo registrar el modo offline", error));
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;
  return <div role="status" aria-live="polite" style={{position:"fixed",top:0,left:0,right:0,zIndex:99999,background:"#7f1d1d",color:"#fff",padding:"8px 12px",textAlign:"center",fontSize:13,fontWeight:700,boxShadow:"0 2px 8px #0002"}}>
    Sin conexión a internet · BOOM está en modo offline{installed ? "" : " · Abre BOOM con conexión al menos una vez para preparar el modo offline"}
  </div>;
}
