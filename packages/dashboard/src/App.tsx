// Two routes on a hash router (no server config needed):
//   #/        the landing page
//   #/market  the live terminal
import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Market from "./pages/Market";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  return hash.startsWith("#/market") ? <Market /> : <Landing />;
}
