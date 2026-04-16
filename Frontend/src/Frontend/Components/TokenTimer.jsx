import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import FlipClockCountdown from "@leenguyen/react-flip-clock-countdown";
import "@leenguyen/react-flip-clock-countdown/dist/index.css";

const TokenTimer = ({ onExpire }) => {
  const [expiry, setExpiry] = useState(null);
  const [remainingTime, setRemainingTime] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const decoded = jwtDecode(token);
      const expiryTime = decoded.exp * 1000;
      setExpiry(expiryTime);

      // Track remaining time
      const interval = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
        setRemainingTime(diff);
      }, 1000);

      return () => clearInterval(interval);
    } catch (err) {
      console.error("Invalid token");
    }
  }, []);

  if (!expiry) return null;

  // Determine colors
  const isCritical = remainingTime <= 5;

  const minuteStyle = {
    width: 30,
    height: 30,
    fontSize: 24,
    borderRadius: "8px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    background: isCritical ? "#dc3545" : "#0d6efd", // red or blue
    color: "#fff",
  };

  const secondStyle = {
    width: 35,
    height: 40,
    fontSize: 24,
    borderRadius: "8px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    background: isCritical ? "#dc3545" : "#198754", // red or green
    color: "#fff",
  };

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <FlipClockCountdown
        to={expiry}
        renderMap={[false, false, true, true]} // Only minutes & seconds
        duration={0.5}
        onComplete={onExpire}
        showSeparators={true}
        digitBlockStyle={remainingTime > 59 ? minuteStyle : secondStyle}
      />
    </div>
  );
};

export default TokenTimer;
