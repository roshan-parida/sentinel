const socket = io();

// When new serial data arrives from Node.js, update the UI
socket.on("serialData", (data) => {
    document.getElementById("status").innerText = data;
});

// Example: sending a command from the UI to Node.js/Arduino
document.getElementById("commandBtn").addEventListener("click", () => {
    const cmd = document.getElementById("commandInput").value;
    socket.emit("command", cmd);
});
