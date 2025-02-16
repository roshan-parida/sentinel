class AlarmDashboard {
    constructor() {
        this.socket = io();
        this.initializeSocket();
        this.initializeEventListeners();
        this.lastUpdate = null;
        this.notifications = [];
        this.lastAlertNotificationTime = 0;

        // Request notification permission on load
        if ("Notification" in window) {
            Notification.requestPermission().then((permission) => {
                console.log("Notification permission:", permission);
            });
        }
    }

    initializeSocket() {
        // Handle status updates from the server
        this.socket.on("status", (status) => {
            this.updateStatus(status);
            this.checkAlerts(status);
        });

        // Handle error messages from the server
        this.socket.on("error", (error) => {
            this.showNotification("error", error.message);
        });

        // Handle connection events
        this.socket.on("connect", () => {
            this.showNotification("success", "Connected to server");
            document.getElementById("connectionStatus").className = "connected";
        });

        this.socket.on("disconnect", () => {
            this.showNotification("error", "Disconnected from server");
            document.getElementById("connectionStatus").className =
                "disconnected";
        });
    }

    initializeEventListeners() {
        // Command submission form
        document
            .getElementById("commandForm")
            .addEventListener("submit", (e) => {
                e.preventDefault();
                const input = document.getElementById("commandInput");
                const command = input.value.trim();
                if (command) {
                    this.sendCommand(command);
                    input.value = "";
                }
            });

        // Arm/disarm toggle; send "A" for arm, "D" for disarm
        document.getElementById("armToggle").addEventListener("change", (e) => {
            this.sendCommand(e.target.checked ? "A" : "D");
        });

        // Clear notifications button
        document
            .getElementById("clearNotifications")
            .addEventListener("click", () => {
                this.clearNotifications();
            });
    }

    updateStatus(status) {
        const statusElements = {
            armed: document.getElementById("armedStatus"),
            active: document.getElementById("activeStatus"),
            temp: document.getElementById("tempStatus"),
            lastUpdate: document.getElementById("lastUpdate"),
        };

        statusElements.armed.textContent = status.armed ? "ARMED" : "DISARMED";
        statusElements.armed.className = status.armed
            ? "status-armed"
            : "status-disarmed";

        statusElements.active.textContent = status.active
            ? "ACTIVE"
            : "INACTIVE";
        statusElements.active.className = status.active
            ? "status-active"
            : "status-inactive";

        statusElements.temp.textContent = `${status.temp.toFixed(1)}°C`;

        this.lastUpdate = new Date();
        statusElements.lastUpdate.textContent = `Last Update: ${this.lastUpdate.toLocaleTimeString()}`;

        const armToggle = document.getElementById("armToggle");
        armToggle.checked = status.armed;
    }

    checkAlerts(status) {
        // Alert if temperature exceeds 30°C
        if (status.temp > 30) {
            this.showNotification("warning", "High temperature detected!");
        }

        // Alert if the system is active while armed (indicating alarm triggered)
        if (status.active && status.armed) {
            this.showNotification("alert", "ALARM TRIGGERED!");
            // Send a push notification if 30 seconds have passed since the last alert
            const now = Date.now();
            if (now - this.lastAlertNotificationTime > 30000) {
                this.lastAlertNotificationTime = now;
                if (Notification.permission === "granted") {
                    new Notification("Alarm Triggered!", {
                        body: "Your Smart Home Security System has been triggered!",
                        // Optionally add an icon:
                        // icon: 'path/to/icon.png'
                    });
                }
            }
        }
    }

    showNotification(type, message) {
        const notification = {
            id: Date.now(),
            type,
            message,
            timestamp: new Date().toLocaleTimeString(),
        };

        this.notifications.unshift(notification);
        this.updateNotificationsList();
    }

    updateNotificationsList() {
        const container = document.getElementById("notifications");
        container.innerHTML = this.notifications
            .slice(0, 10)
            .map(
                (notif) => `
        <div class="notification ${notif.type}">
          <span class="timestamp">${notif.timestamp}</span>
          <span class="message">${notif.message}</span>
        </div>
      `
            )
            .join("");
    }

    clearNotifications() {
        this.notifications = [];
        this.updateNotificationsList();
    }

    sendCommand(command) {
        // Emit the command to the server; your Node.js server appends newline if needed.
        this.socket.emit("command", command);
        this.showNotification("info", `Command sent: ${command}`);
    }
}

// Initialize dashboard when DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    window.dashboard = new AlarmDashboard();
});
