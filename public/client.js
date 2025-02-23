/* Theme Management */
const initTheme = () => {
    const theme = localStorage.getItem("theme") || "light";
    document.body.dataset.theme = theme;
    updateThemeIcon(theme);
};

const toggleTheme = () => {
    const newTheme = document.body.dataset.theme === "light" ? "dark" : "light";
    document.body.dataset.theme = newTheme;
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
};

const updateThemeIcon = (theme) =>
    (document.querySelector("#theme-switch i").className =
        theme === "light" ? "fas fa-moon" : "fas fa-sun");

/* Socket.IO Connection */
const socket = io();
let lastLoggedStatus = null;

socket.on("connect", () => {
    console.log("Connected to server");
    updateConnectionStatus(true);
    showToast("success", "Connected to server");
});

socket.on("disconnect", () => {
    console.log("Disconnected from server");
    updateConnectionStatus(false);
    showToast("error", "Disconnected from server");
});

socket.on("status", (status) => {
    updateUI(status);
    if (!isStatusEqual(status, lastLoggedStatus)) {
        logActivity(status);
        lastLoggedStatus = status;
    }
});

/* Helpers */
const isStatusEqual = (s1, s2) =>
    s1 &&
    s2 &&
    s1.armed === s2.armed &&
    s1.active === s2.active &&
    Math.abs(s1.temp - s2.temp) < 0.1;

const animateChange = (el, newText) => {
    if (el.textContent !== newText) {
        el.style.animation = "fadeInOut 0.5s";
        setTimeout(() => {
            el.textContent = newText;
            el.style.animation = "";
        }, 250);
    }
};

/* UI Updates */
const updateConnectionStatus = (connected) => {
    const statusEl = document.getElementById("connection-status");
    statusEl.className = connected ? "status-connected" : "status-disconnected";
    statusEl.querySelector("span").textContent = connected
        ? "Connected"
        : "Disconnected";
};

const updateUI = (status) => {
    animateChange(
        document.getElementById("system-status"),
        status.armed ? "Armed" : "Disarmed"
    );
    animateChange(
        document.getElementById("alarm-status"),
        status.active ? "ACTIVE" : "Inactive"
    );
    animateChange(
        document.getElementById("temperature"),
        `${status.temp.toFixed(1)}°C`
    );

    document.getElementById("status-armed").className = `status-indicator ${
        status.armed ? "armed" : "disarmed"
    }`;
    document.getElementById("status-alarm").className = `status-indicator ${
        status.active ? "alarm-active" : "alarm-inactive"
    }`;

    const tempIndicator = document.getElementById("temp-indicator");
    tempIndicator.className =
        "status-indicator " +
        (status.temp > 30
            ? "high-temp"
            : status.temp > 25
            ? "medium-temp"
            : "normal-temp");
};

/* Activity Log */
const ACTIVITY_LOG_SIZE = 10;
const logActivity = (status) => {
    const activityLog = document.getElementById("activity-log");
    const timestamp = new Date().toLocaleTimeString();
    const { icon, message } = status.active
        ? { icon: "fa-exclamation-triangle", message: "Alarm triggered!" }
        : status.armed
        ? { icon: "fa-lock", message: "System armed" }
        : { icon: "fa-lock-open", message: "System disarmed" };

    const activityItem = document.createElement("div");
    activityItem.className = "activity-item";
    activityItem.innerHTML = `
      <div class="activity-icon"><i class="fas ${icon}" aria-hidden="true"></i></div>
      <div class="activity-content">
        <div class="activity-message">${message}</div>
        <div class="activity-time">${timestamp}</div>
      </div>
    `;
    activityLog.insertBefore(activityItem, activityLog.firstChild);
    while (activityLog.children.length > ACTIVITY_LOG_SIZE) {
        activityLog.removeChild(activityLog.lastChild);
    }
};

/* Toast Notifications */
const showToast = (type, message) => {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icon =
        type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    toast.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${message}</span>`;
    const container = document.getElementById("toast-container");
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
};

/* Command Functions */
const sendCommand = (cmd) => {
    if (socket.connected) {
        socket.emit("command", cmd);
        showToast("success", `Command sent: ${cmd}`);
    } else {
        showToast("error", "Cannot send command: Not connected");
    }
};

/* DOM Initialization */
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    document
        .getElementById("theme-switch")
        .addEventListener("click", toggleTheme);
    document
        .getElementById("btn-arm")
        .addEventListener("click", () => sendCommand("A"));
    document
        .getElementById("btn-disarm")
        .addEventListener("click", () => sendCommand("D"));
    document
        .getElementById("btn-toggle")
        .addEventListener("click", () => sendCommand("T"));
});
