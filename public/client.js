/* Theme management */
function initTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.body.setAttribute("data-theme", theme);
    updateThemeIcon(theme);
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    document.body.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector("#theme-switch i");
    icon.className = theme === "light" ? "fas fa-moon" : "fas fa-sun";
}

/* Socket.IO connection */
const socket = io();
let lastLoggedStatus = null; // Store last status logged in Recent Activity

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
    if (shouldLogActivity(status)) {
        logActivity(status);
    }
    lastLoggedStatus = status;
});

/* Helper: Compare two status objects (with a tolerance for temperature) */
function isStatusEqual(s1, s2) {
    if (!s1 || !s2) return false;
    const tempTolerance = 0.1;
    return (
        s1.armed === s2.armed &&
        s1.active === s2.active &&
        Math.abs(s1.temp - s2.temp) < tempTolerance
    );
}

function shouldLogActivity(newStatus) {
    return !isStatusEqual(newStatus, lastLoggedStatus);
}

/* UI Updates */
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById("connection-status");
    const statusText = statusElement.querySelector("span");
    statusElement.className = connected
        ? "status-connected"
        : "status-disconnected";
    statusText.textContent = connected ? "Connected" : "Disconnected";
}

function updateUI(status) {
    // Update armed status
    const systemStatus = document.getElementById("system-status");
    const newArmedStatus = status.armed ? "Armed" : "Disarmed";
    if (systemStatus.textContent !== newArmedStatus) {
        systemStatus.style.animation = "fadeInOut 0.5s";
        setTimeout(() => {
            systemStatus.textContent = newArmedStatus;
            systemStatus.style.animation = "";
        }, 250);
    }

    // Update alarm status
    const alarmStatus = document.getElementById("alarm-status");
    const newAlarmStatus = status.active ? "ACTIVE" : "Inactive";
    if (alarmStatus.textContent !== newAlarmStatus) {
        alarmStatus.style.animation = "fadeInOut 0.5s";
        setTimeout(() => {
            alarmStatus.textContent = newAlarmStatus;
            alarmStatus.style.animation = "";
        }, 250);
    }

    // Update temperature with smooth transition
    const tempElement = document.getElementById("temperature");
    const newTemp = `${status.temp.toFixed(1)}°C`;
    if (tempElement.textContent !== newTemp) {
        tempElement.style.animation = "fadeInOut 0.5s";
        setTimeout(() => {
            tempElement.textContent = newTemp;
            tempElement.style.animation = "";
        }, 250);
    }

    // Update status indicators
    document.getElementById("status-armed").className = `status-indicator ${
        status.armed ? "armed" : "disarmed"
    }`;
    document.getElementById("status-alarm").className = `status-indicator ${
        status.active ? "alarm-active" : "alarm-inactive"
    }`;

    // Update temperature indicator based on value
    const tempIndicator = document.getElementById("temp-indicator");
    if (status.temp > 30) {
        tempIndicator.className = "status-indicator high-temp";
    } else if (status.temp > 25) {
        tempIndicator.className = "status-indicator medium-temp";
    } else {
        tempIndicator.className = "status-indicator normal-temp";
    }
}

/* Activity Log Management */
const ACTIVITY_LOG_SIZE = 10;
function logActivity(status) {
    const activityLog = document.getElementById("activity-log");
    const timestamp = new Date().toLocaleTimeString();

    const activityItem = document.createElement("div");
    activityItem.className = "activity-item";

    let icon, message;
    if (status.active) {
        icon = "fa-exclamation-triangle";
        message = "Alarm triggered!";
    } else if (status.armed) {
        icon = "fa-lock";
        message = "System armed";
    } else {
        icon = "fa-lock-open";
        message = "System disarmed";
    }

    activityItem.innerHTML = `
        <div class="activity-icon">
            <i class="fas ${icon}" aria-hidden="true"></i>
        </div>
        <div class="activity-content">
            <div class="activity-message">${message}</div>
            <div class="activity-time">${timestamp}</div>
        </div>
    `;

    activityLog.insertBefore(activityItem, activityLog.firstChild);

    // Limit log entries to ACTIVITY_LOG_SIZE
    while (activityLog.children.length > ACTIVITY_LOG_SIZE) {
        activityLog.removeChild(activityLog.lastChild);
    }
}

/* Toast Notifications */
function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icon =
        type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    toast.innerHTML = `
        <i class="fas ${icon}" aria-hidden="true"></i>
        <span>${message}</span>
    `;

    const container = document.getElementById("toast-container");
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
}

/* Command Functions */
function sendCommand(cmd) {
    if (socket.connected) {
        socket.emit("command", cmd);
        showToast("success", `Command sent: ${cmd}`);
    } else {
        showToast("error", "Cannot send command: Not connected");
    }
}

/* Initialize when the DOM is ready */
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
