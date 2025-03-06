# Sentinel - Smart Home Security System

Sentinel is a smart home security system designed to monitor and control your home security. It includes features such as motion detection, temperature monitoring, and RFID-based access control. The system provides a web interface for real-time monitoring and control, and it can send email alerts for critical events.

## Table of Contents

-   [Features](#features)
-   [Installation](#installation)
-   [Usage](#usage)
-   [Configuration](#configuration)
-   [Project Structure](#project-structure)
-   [Dependencies](#dependencies)
-   [Contributing](#contributing)
-   [License](#license)

## Features

-   **Motion Detection**: Uses an ultrasonic sensor to detect motion.
-   **Temperature Monitoring**: Monitors temperature using a thermistor and triggers alerts if thresholds are exceeded.
-   **RFID Access Control**: Allows authorized access using RFID cards.
-   **Web Interface**: Provides a real-time dashboard for monitoring and controlling the system.
-   **Email Alerts**: Sends email notifications for critical events such as alarm triggers and high temperatures.
-   **Theme Management**: Supports light and dark themes for the web interface.

## Installation

### Prerequisites

-   Node.js and npm
-   Arduino IDE
-   An Arduino board with the required sensors and modules (RFID, ultrasonic sensor, thermistor, buzzer, etc.)

### Steps

1. **Clone the repository**:

    ```sh
    git clone https://github.com/yourusername/sentinel.git
    cd sentinel
    ```

2. **Install Node.js dependencies**:

    ```sh
    npm install
    ```

3. **Upload the Arduino sketch**:

    - Open `shss.ino` in the Arduino IDE.
    - Select the appropriate board and port.
    - Upload the sketch to the Arduino board.

4. **Configure environment variables**:

    - Create a `.env` file in the root directory and add the following variables:
        ```env
        ARDUINO_PORT=COM5
        BAUD_RATE=115200
        PORT=3000
        HIGH_TEMP_THRESHOLD=30.0
        SENDER_USER=your-email@gmail.com
        SENDER_PASS=your-email-password
        OWNER_EMAIL1=owner1@example.com
        OWNER_EMAIL2=owner2@example.com
        ```

5. **Start the server**:

    ```sh
    npm start
    ```

6. **Access the web interface**:
    - Open a web browser and navigate to `http://localhost:3000`.

## Usage

-   **Arm/Disarm the System**: Use the web interface buttons to arm or disarm the system.
-   **Monitor Status**: View the system status, alarm status, and temperature on the dashboard.
-   **View Recent Activity**: Check the recent activity log for system events.
-   **Toggle Theme**: Use the theme switch button to toggle between light and dark themes.

## Configuration

-   **Arduino Configuration**: Modify the pin configuration and thresholds in `shss.ino` as needed.
-   **Server Configuration**: Update the environment variables in the `.env` file for email settings and thresholds.

## Project Structure

```
sentinel/
├── .gitignore
├── .env.example
├── package.json
├── README.md
├── server.js
├── public/
│   ├── client.js
│   ├── index.html
│   ├── styles.css
├── shss.ino
```

-   **.gitignore**: Specifies files and directories to be ignored by Git.
-   **.env.example**: Example environment variables file.
-   **package.json**: Node.js project configuration and dependencies.
-   **README.md**: Project documentation.
-   **server.js**: Node.js server code.
-   **public/**: Contains the web interface files (HTML, CSS, JS).
-   **shss.ino**: Arduino sketch for the security system.

## Dependencies

-   **Node.js**: JavaScript runtime environment.
-   **Express**: Web framework for Node.js.
-   **Socket.io**: Real-time bidirectional event-based communication.
-   **SerialPort**: Node.js package for reading and writing data to serial ports.
-   **Nodemailer**: Node.js module for sending emails.
-   **ArduinoJson**: Library for parsing JSON on Arduino.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
