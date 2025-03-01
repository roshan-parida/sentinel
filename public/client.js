/* Utility Functions */
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

/* Theme Management */
const ThemeManager = {
    init() {
        const theme = localStorage.getItem("theme") || "light";
        document.body.dataset.theme = theme;
        this.updateIcon(theme);
        $("#theme-switch").addEventListener("click", this.toggle.bind(this));
    },

    toggle() {
        const newTheme =
            document.body.dataset.theme === "light" ? "dark" : "light";
        document.body.dataset.theme = newTheme;
        localStorage.setItem("theme", newTheme);
        this.updateIcon(newTheme);
    },

    updateIcon(theme) {
        $("#theme-switch i").className =
            theme === "light" ? "fas fa-moon" : "fas fa-sun";
    },
};

/* UI Manager */
const UIManager = {
    elements: {
        connectionStatus: $("#connection-status"),
        systemStatus: $("#system-status"),
        alarmStatus: $("#alarm-status"),
        temperature: $("#temperature"),
        statusArmed: $("#status-armed"),
        statusAlarm: $("#status-alarm"),
        tempIndicator: $("#temp-indicator"),
        activityLog: $("#activity-log"),
    },

    init() {
        this.initButtonHandlers();
    },

    initButtonHandlers() {
        $("#btn-arm").addEventListener("click", () =>
            SocketManager.sendCommand("A")
        );
        $("#btn-disarm").addEventListener("click", () =>
            SocketManager.sendCommand("D")
        );
        $("#btn-toggle").addEventListener("click", () =>
            SocketManager.sendCommand("T")
        );
    },

    updateConnectionStatus(connected) {
        this.elements.connectionStatus.className = connected
            ? "status-connected"
            : "status-disconnected";
        this.elements.connectionStatus.querySelector("span").textContent =
            connected ? "Connected" : "Disconnected";
    },

    updateSystemStatus(status) {
        if (!status) return;

        this.animateChange(
            this.elements.systemStatus,
            status.armed ? "Armed" : "Disarmed"
        );
        this.animateChange(
            this.elements.alarmStatus,
            status.active ? "ACTIVE" : "Inactive"
        );
        this.animateChange(
            this.elements.temperature,
            `${status.temp.toFixed(1)}°C`
        );

        this.elements.statusArmed.className = `status-indicator ${
            status.armed ? "armed" : "disarmed"
        }`;
        this.elements.statusAlarm.className = `status-indicator ${
            status.active ? "alarm-active" : "alarm-inactive"
        }`;

        // Temperature indicator
        let tempClass = "normal-temp";
        if (status.temp > 30) tempClass = "high-temp";
        else if (status.temp > 25) tempClass = "medium-temp";

        this.elements.tempIndicator.className = "status-indicator " + tempClass;
    },

    animateChange(el, newText) {
        if (el.textContent !== newText) {
            el.style.animation = "fadeInOut 0.5s";
            setTimeout(() => {
                el.textContent = newText;
                el.style.animation = "";
            }, 250);
        }
    },

    logActivity(status) {
        if (!status) return;

        const timestamp = new Date().toLocaleTimeString();
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

        const activityItem = document.createElement("div");
        activityItem.className = "activity-item fade-in";
        activityItem.innerHTML = `
            <div class="activity-icon"><i class="fas ${icon}" aria-hidden="true"></i></div>
            <div class="activity-content">
                <div class="activity-message">${message}</div>
                <div class="activity-time">${timestamp}</div>
            </div>
        `;

        this.elements.activityLog.insertBefore(
            activityItem,
            this.elements.activityLog.firstChild
        );

        // Keep only the last 10 activities
        const ACTIVITY_LOG_SIZE = 10;
        while (this.elements.activityLog.children.length > ACTIVITY_LOG_SIZE) {
            this.elements.activityLog.removeChild(
                this.elements.activityLog.lastChild
            );
        }
    },

    showToast(type, message, duration = 3000) {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const icon =
            type === "success"
                ? "fa-check-circle"
                : type === "error"
                ? "fa-exclamation-circle"
                : type === "warning"
                ? "fa-exclamation-triangle"
                : "fa-info-circle";

        toast.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${message}</span>`;

        const container = $("#toast-container");
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = "slideOut 0.3s ease-out";
            setTimeout(() => container.removeChild(toast), 300);
        }, duration);
    },
};

/* Socket Communication */
const SocketManager = {
    socket: null,
    lastLoggedStatus: null,

    init() {
        this.socket = io();
        this.setupEventListeners();
    },

    setupEventListeners() {
        this.socket.on("connect", () => {
            console.log("Connected to server");
            UIManager.updateConnectionStatus(true);
            UIManager.showToast("success", "Connected to server");
        });

        this.socket.on("disconnect", () => {
            console.log("Disconnected from server");
            UIManager.updateConnectionStatus(false);
            UIManager.showToast("error", "Disconnected from server");
        });

        this.socket.on("status", (status) => {
            UIManager.updateSystemStatus(status);

            if (!this.isStatusEqual(status, this.lastLoggedStatus)) {
                UIManager.logActivity(status);
                this.lastLoggedStatus = { ...status };
            }
        });

        this.socket.on("system_error", (error) => {
            console.error("System error:", error);
            UIManager.showToast(
                "error",
                error.message || "System error occurred"
            );
        });
    },

    isStatusEqual(s1, s2) {
        return (
            s1 &&
            s2 &&
            s1.armed === s2.armed &&
            s1.active === s2.active &&
            Math.abs(s1.temp - s2.temp) < 0.1
        );
    },

    sendCommand(cmd) {
        if (!this.socket || !this.socket.connected) {
            UIManager.showToast("error", "Cannot send command: Not connected");
            return;
        }

        this.socket.emit("command", cmd);
        UIManager.showToast("success", `Command sent: ${cmd}`);
    },
};

/* Initialize on page load */
document.addEventListener("DOMContentLoaded", () => {
    ThemeManager.init();
    UIManager.init();
    SocketManager.init();
});
