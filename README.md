✨ **Morpheus: Socket.IO Chat Server with Privy Authentication (Web3)** 🚀

This repository implements a WebSocket server using Socket.IO for real-time chat functionality 💬. Users are authenticated with Privy, a Web3 authentication solution 🔑.

### Requirements ⚙️

*   Deno (`deno` command available) 🦕
*   Privy account with App ID and Secret (see [https://docs.privy.io/](https://docs.privy.io/)) 🌐

### Local Development 💻

1.  Clone this repository. ⬇️
2.  Install dependencies: 📦

```bash
deno cache --reload imports
```

3.  Set environment variables: 🔑

*   `PORT`: The port on which the server will listen (default: 3000) 🚪
*   `PRIVY_APP_ID`: Your Privy App ID 🆔
*   `PRIVY_APP_SECRET`: Your Privy App Secret 🤫

**Example:** 📝

```bash
export PORT=3000
export PRIVY_APP_ID=your_app_id
export PRIVY_APP_SECRET=your_app_secret
```

4.  Start the development server: ▶️

```bash
deno run -A --watch main.ts
```

This will start the server in hot-reload mode 🔥, automatically restarting when changes are made to the code 🔄.

### Docker Deployment (Optional) 🐳

**1. Build the Docker image:** 🏗️

```bash
docker build -t socket-io-chat-server .
```

**2. Run the container:** 🏃

```bash
docker run -p 3000:3000 \
           -e PORT \
           -e PRIVY_APP_ID \
           -e PRIVY_APP_SECRET \
           socket-io-chat-server
```

**Note:** 📌

*   Replace the environment variables with your desired values. ✏️
*   This assumes you have Docker installed and configured. 🐳⚙️

### Contributing 🤝

Feel free to contribute to this project by creating pull requests! 🎉
